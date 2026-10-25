/* 分享（M2）：把当前剧本打包上传成「作品快照」。
   媒体描述符三形态：
   - 本地：{kind, id, poster?, fit?, loop?, waitEnd?}（id = IndexedDB 键）
   - 旧内联：dataURL 字符串（上传时转 Blob 一并上传）
   - 远端：{kind, url, poster?, ...}（访客端直接用，沙箱零改动）
   上传时本地/旧内联 -> {kind, ref: 'f0..fN', poster, ...}，服务端改写成远端形态。 */

import { reactive } from 'vue'
import { api } from './api.js'
import { getMedia, dataUrlToBlob } from './media.js'

/* 分享弹层开关（App.vue 挂 ShareSheet，镜像 confirm.js 命令式形态） */
export const shareState = reactive({ open: false })
export function openShare() {
  shareState.open = true
}

/* 剧本里媒体的所有落点（与 store.js normalize / 后端改写同源）：
   node.photo / node.intros[].photo / node.choices[].effect.photo / preset.finale.photo */
function eachMedia(preset, fn) {
  for (const n of Object.values(preset.nodes ?? {})) {
    fn(n, 'photo')
    for (const it of n.intros ?? []) fn(it, 'photo')
    for (const c of n.choices ?? []) {
      if (c.effect) fn(c.effect, 'photo')
    }
  }
  if (preset.finale) fn(preset.finale, 'photo')
}

/** 打包当前剧本：返回 { files: [[slot, Blob]], presetJson, title }，失败抛中文 Error。
    同一媒体多处引用只传一份；本机找不到文件的媒体置空并在结果里报一条问题。 */
export async function buildWorkUpload(activePreset) {
  const preset = JSON.parse(JSON.stringify(activePreset))
  const files = []
  const slotByMedia = new Map() // 媒体键（id 或 dataURL 串）-> slot
  let n = 0
  const issues = []
  const convert = async (obj, key) => {
    const v = obj[key]
    if (typeof v === 'string' && v.startsWith('data:')) {
      if (slotByMedia.has(v)) {
        obj[key] = { kind: 'photo', ref: slotByMedia.get(v) }
        return
      }
      let blob = null
      try {
        blob = dataUrlToBlob(v)
      } catch {
        issues.push('有一张旧格式照片无法读取')
        obj[key] = null
        return
      }
      const slot = `f${n++}`
      files.push([slot, blob])
      slotByMedia.set(v, slot)
      obj[key] = { kind: 'photo', ref: slot }
      return
    }
    if (v && typeof v === 'object' && (v.kind === 'photo' || v.kind === 'video')) {
      if (!v.id) return // 已是远端 url 形态：直通
      const known = slotByMedia.get(v.id)
      if (known) {
        obj[key] = { ...v, ref: known }
        delete obj[key].id
        return
      }
      let blob = null
      try {
        blob = await getMedia(v.id)
      } catch {
        blob = null
      }
      if (!blob) {
        issues.push('有一张照片或视频在本机找不到文件')
        obj[key] = null
        return
      }
      const slot = `f${n++}`
      files.push([slot, blob])
      slotByMedia.set(v.id, slot)
      const desc = { ...v, ref: slot }
      delete desc.id
      obj[key] = desc
    }
  }
  const pending = []
  eachMedia(preset, (o, k) => pending.push(convert(o, k)))
  await Promise.all(pending)
  if (issues.length) throw new Error(issues[0])
  const title = String(activePreset?.name ?? '').trim().slice(0, 24) || '我的剧本'
  return { files, presetJson: JSON.stringify(preset), title }
}

/* ---------- 分享管理 ---------- */

export async function myWorks() {
  return api('/works')
}

export async function revokeWork(code, revoked) {
  return api(`/works/${code}`, { method: 'PATCH', body: { status: revoked ? 'revoked' : 'active' } })
}

export async function deleteWork(code) {
  return api(`/works/${code}`, { method: 'DELETE' })
}

/** 复制分享链接：微信内置浏览器 clipboard API 不可靠 -> 失败时把链接给用户手动复制 */
export async function copyShareLink(code) {
  const url = `${location.origin}/#/w/${code}`
  try {
    await navigator.clipboard.writeText(url)
    return { ok: true }
  } catch {
    return { ok: false, url }
  }
}

/** 访客页作者徽标：guest.work.owner_id 是否等于当前登录用户。
    从 localStorage 读登录缓存而非 import auth.js：share.js 不掺登录态，保持单向依赖 */
export function isMyWork(work) {
  let uid = null
  try {
    uid = JSON.parse(localStorage.getItem('galplan-auth-v1') || 'null')?.user?.id ?? null
  } catch {
    uid = null
  }
  return !!work?.owner_id && work.owner_id === uid
}
