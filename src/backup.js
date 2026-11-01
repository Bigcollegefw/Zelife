/* 本机数据备份（设置 › 账号与协议 › 同步本机数据）：
   把本地存储的剧本/进度/夜记 + IndexedDB 里的照片视频打成一个 JSON 文件导出，
   导入时整体写回并重载。真云同步（服务器按账号存取）是将来 M4 级的后端工程，
   这一行的 UI 到时候就地升级，导出/导入可保留作手动备份。 */

const DATA_KEYS = [
  'galplan-demo-v1', // 单局进度
  'galplan-presets-v1', // 剧本库（照片/视频以描述符引用 IDB）
  'galplan-nightlog-v1', // 夜记集
  'galplan-nodeorder-v1', // 画布手动排序
]

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
}

/** 打包含 mediaCount（照片视频数）与文件名，供界面展示；出错抛中文 Error */
export async function buildBackup() {
  const data = {}
  for (const k of DATA_KEYS) {
    const raw = localStorage.getItem(k)
    if (raw) data[k] = raw
  }
  if (!Object.keys(data).length) throw new Error('这台设备还没有可备份的内容')

  // 扫出剧本里引用的全部媒体（描述符形如 {kind, id}，旧 dataURL 内联串随 JSON 自带）
  const ids = new Set()
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (typeof v.kind === 'string' && typeof v.id === 'string' && v.id) {
      ids.add(v.id)
      return
    }
    if (Array.isArray(v)) return v.forEach(walk)
    for (const x of Object.values(v)) walk(x)
  }
  for (const raw of Object.values(data)) {
    try {
      walk(JSON.parse(raw))
    } catch {
      /* 单键损坏不挡整体导出 */
    }
  }

  const media = {}
  for (const id of ids) {
    try {
      const blob = await getMedia(id)
      if (blob) media[id] = await blobToDataUrl(blob)
    } catch {
      /* 个别媒体读不出：跳过，导出继续（导入端缺失引用会走已有的降级渲染） */
    }
  }
  return {
    pack: { app: 'galplan', v: 1, date: new Date().toISOString() },
    mediaCount: Object.keys(media).length,
    file: { app: 'galplan', v: 1, date: new Date().toISOString(), data, media },
    name: `galplan-backup-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`,
  }
}

/** 导出成文件下载（iOS Safari 存到「文件」，桌面进下载目录） */
export async function exportBackup() {
  const { file, name } = await buildBackup()
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return name
}

/** 解析备份文件：校验格式，返回 { date, keys, mediaCount } 供确认弹层展示 */
export function parseBackup(text) {
  let f
  try {
    f = JSON.parse(text)
  } catch {
    throw new Error('这不是一个有效的备份文件')
  }
  if (f?.app !== 'galplan' || typeof f.data !== 'object' || f.data === null) {
    throw new Error('备份文件内容不对，请确认导出的是 galplan 的备份')
  }
  return {
    date: f.pack?.date ?? f.date ?? '',
    keys: Object.keys(f.data).length,
    mediaCount: Object.keys(f.media ?? {}).length,
    file: f,
  }
}

/** 写回备份：覆盖同键数据（备份里没有的本机数据键先清掉，避免新旧混装）；
    媒体逐个放回 IndexedDB。完成后由调用方 reload。账号与偏好键不在备份范围内，不受影响。 */
export async function applyBackup(file) {
  for (const k of DATA_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* 忽略 */
    }
  }
  for (const [k, raw] of Object.entries(file.data)) {
    try {
      localStorage.setItem(k, raw)
    } catch {
      throw new Error('本机存储写不下这份备份（多半是内容太多）')
    }
  }
  for (const [id, dataUrl] of Object.entries(file.media ?? {})) {
    try {
      await putMedia(dataUrlToBlob(dataUrl), id)
    } catch {
      /* 个别媒体恢复失败不挡整体 */
    }
  }
}
