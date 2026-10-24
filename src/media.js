/* 媒体仓：视频 / 照片 Blob 存 IndexedDB，localStorage 只留 JSON 引用。
   未来打包 iOS/Android（Capacitor WebView 壳）时本层可直接沿用；换原生再换适配器。 */
import { fileToPhoto } from './photo.js'
import { confirmBox } from './confirm.js'
import { openFitAdjust } from './fit.js'

const DB_NAME = 'galplan-media'
const STORE = 'media'
let dbPromise = null

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, 1)
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE)
      rq.onsuccess = () => resolve(rq.result)
      rq.onerror = () => reject(rq.error)
    })
  }
  return dbPromise
}

async function run(mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const uid = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export async function putMedia(blob) {
  const id = uid()
  await run('readwrite', (s) => s.put(blob, id))
  return id
}

export function getMedia(id) {
  return run('readonly', (s) => s.get(id))
}

export async function delMedia(id) {
  await run('readwrite', (s) => s.delete(id))
  dropUrl(id)
}

/* 对象 URL 缓存：同一媒体多处显示共用一个 URL */
const urlCache = new Map()
export async function mediaUrl(id) {
  if (!id) return null
  if (urlCache.has(id)) return urlCache.get(id)
  try {
    const blob = await getMedia(id)
    const url = blob ? URL.createObjectURL(blob) : null
    urlCache.set(id, url)
    return url
  } catch {
    return null
  }
}
export function dropUrl(id) {
  const u = urlCache.get(id)
  if (u) URL.revokeObjectURL(u)
  urlCache.delete(id)
}

/* 背景描述符：旧 dataURL 字符串兼容为内联照片；
   对象 = { kind:'photo'|'video', id, loop?, poster?, fit?, waitEnd?(视频播完再出选项) } */
export const isMedia = (v) => !!v && typeof v === 'object' && !!v.kind

/* 背景视频的体量与格式约定：浏览器端无法转码，只能原样存播，太大手机吃不消。
   推荐 15 秒内 / 20MB 内；超 20MB 提醒；超 50MB 拒绝。手机相册导出的 MP4/MOV 基本都在支持列表。 */
export const VIDEO_LIMITS = { max: 50 * 1024 * 1024, warn: 20 * 1024 * 1024 }
export const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/ogg']

/** 上传统一入口：图片 → 压缩入 IDB；视频 → 校验格式与大小后入 IDB（默认定格结尾）。
    不合格弹应用内提示，返回 null。 */
export async function fileToMedia(file) {
  if (file.type.startsWith('video/')) {
    const okType = VIDEO_MIMES.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
    if (!okType) {
      await confirmBox('暂不支持这种视频格式。', { body: '请用 MP4 / MOV / WebM（手机相册导出的基本都是这几种）。' })
      return null
    }
    const mb = (file.size / 1024 / 1024).toFixed(1)
    if (file.size > VIDEO_LIMITS.max) {
      await confirmBox(`这段视频有 ${mb} MB，超过背景视频上限（50 MB）。`, { body: '请换一段更短的——推荐 15 秒内、20 MB 以内。' })
      return null
    }
    if (
      file.size > VIDEO_LIMITS.warn &&
      !(await confirmBox(`这段视频有 ${mb} MB，偏大。`, { body: '背景加载和流畅度可能受影响，推荐 15 秒内、20 MB 以内。仍要使用吗？' }))
    ) {
      return null
    }
    return videoToMedia(file)
  }
  return photoToMedia(file)
}

/** dataURL → Blob（atob 解码；比 fetch(data:) 兼容性更稳，老 WebKit 上 fetch 不支持 data 协议） */
export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** 生成小图 poster（缩略 / 回看 / 加载占位用） */
function downscaleToPoster(src, w = 240, q = 0.6) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = w
        c.height = Math.round((img.naturalHeight / img.naturalWidth) * w) || w
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', q))
      } catch {
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = src
  })
}

/** 照片文件 → IDB 描述符（沿用压缩管线，1080px/JPEG；附 240px poster 供缩略）。
    上传时进入「调整构图」取景一次：放弃＝不入库；跳过＝居中默认；完成＝记录 fit */
export async function photoToMedia(file) {
  const dataUrl = await fileToPhoto(file)
  const [blob, poster] = await Promise.all([dataUrlToBlob(dataUrl), downscaleToPoster(dataUrl)])
  const id = await putMedia(blob)
  const desc = { kind: 'photo', id, poster }
  const r = await openFitAdjust(desc)
  if (!r.ok) {
    await delMedia(id)
    return null
  }
  if (r.fit) desc.fit = r.fit
  return desc
}

/** 视频文件 → IDB 描述符（默认定格结尾；截第一帧做 poster，供缩略 / 回看 / 降级） */
export async function videoToMedia(file) {
  const [id, poster] = await Promise.all([putMedia(file), videoPoster(file)])
  return { kind: 'video', id, poster: poster ?? '', loop: false }
}

function videoPoster(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    let settled = false
    const done = (val) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(val)
    }
    v.onerror = () => done(null)
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.1, (v.duration || 1) / 10)
    }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas')
        const w = 240
        c.width = w
        c.height = Math.round((v.videoHeight / v.videoWidth) * w) || 320
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
        done(c.toDataURL('image/jpeg', 0.6))
      } catch {
        done(null)
      }
    }
    setTimeout(() => done(null), 5000) // 拿不到首帧也不卡住
  })
}

/* 一次性迁移：历史 dataURL 照片搬进 IDB（localStorage 瘦身），
   并为缺少 poster 的照片描述符补一张缩略（v3）。失败保持原样，下次启动再试。 */
const MIG_KEY = 'galplan-media-migrated-v3'
const toIdb = async (dataUrl) => {
  const [blob, poster] = await Promise.all([dataUrlToBlob(dataUrl), downscaleToPoster(dataUrl)])
  return { kind: 'photo', id: await putMedia(blob), poster }
}
export async function migratePhotosToIdb(presets, persist) {
  if (localStorage.getItem(MIG_KEY)) return
  try {
    let moved = 0
    const fixPhoto = async (obj, key) => {
      const v = obj[key]
      if (typeof v === 'string' && v.startsWith('data:')) {
        obj[key] = await toIdb(v)
        moved++
      } else if (isMedia(v) && v.kind === 'photo' && !v.poster) {
        // 已入 IDB 但没有缩略的照片：取 Blob 生成 poster
        const blob = await getMedia(v.id)
        if (!blob) return
        const u = URL.createObjectURL(blob)
        const poster = await downscaleToPoster(u)
        URL.revokeObjectURL(u)
        if (poster) {
          obj[key] = { ...v, poster }
          moved++
        }
      }
    }
    for (const p of presets.list ?? []) {
      for (const n of Object.values(p.nodes ?? {})) {
        await fixPhoto(n, 'photo')
        for (const it of n.intros ?? []) await fixPhoto(it, 'photo')
        for (const c of n.choices ?? []) {
          if (c.effect) await fixPhoto(c.effect, 'photo')
        }
      }
      if (p.finale) await fixPhoto(p.finale, 'photo')
    }
    if (moved) persist()
    localStorage.setItem(MIG_KEY, '1')
  } catch {
    /* IDB 不可用：保持 dataURL 原样 */
  }
}
