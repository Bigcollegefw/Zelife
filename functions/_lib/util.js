/* 后端小工具：JSON 响应 / 哈希 / 随机码 / 校验。
   放在 _lib（下划线开头）：Pages Functions 不会把 _* 当成路由，但可以正常 import */

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function readJsonBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* opaque token：客户端拿原 token，库里只存哈希 */
export function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomCode6() {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return String(a[0] % 1000000).padStart(6, '0')
}

export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/* 每日发送限额按 UTC 切窗：对国内用户有 ±8h 偏差，防滥用场景可接受 */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

const NICK_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混的 I/O/0/1

export function genNickname() {
  const a = crypto.getRandomValues(new Uint32Array(4))
  let s = ''
  for (let i = 0; i < 4; i++) s += NICK_CHARS[a[i] % NICK_CHARS.length]
  return '玩家' + s
}

/* 分享码：8 位，去掉易混的 0/O/1/l/o/I（56 字符集，约百万亿量级，碰撞可忽略）。
   纯点击场景长度无压力，短一点方便截图中辨认 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function genWorkCode() {
  const a = crypto.getRandomValues(new Uint32Array(8))
  let s = ''
  for (let i = 0; i < 8; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length]
  return s
}

export const isWorkCode = (s) => typeof s === 'string' && /^[A-HJ-NP-Za-km-np-z2-9]{8}$/.test(s)

/* DEV_FALLBACK 双保险之一：即使误把 DEV_FALLBACK 配到生产，非本机请求也不回传验证码 */
export function isLocalRequest(request) {
  const h = new URL(request.url).hostname
  return h === 'localhost' || h === '127.0.0.1'
}
