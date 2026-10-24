/* API 客户端：全站只此一处网络出口，一律走相对路径 /api——
   开发由 Vite 代理到 wrangler（npm run api），生产由 Pages 同域服务，零 CORS 代码。
   错误一律 throw Error(中文)，调用方直接展示 message 即可。
   与 auth.js 互相引用：只允许在函数体内取用对方导出，禁止模块顶层调用。 */

import { authState, clearToken } from './auth.js'

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  let payload
  if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof Uint8Array) {
    payload = body // 二进制直传（头像等），格式由服务端按字节识别
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (authState.token) headers.authorization = `Bearer ${authState.token}`

  let res
  try {
    res = await fetch('/api' + path, { method, headers, body: payload })
  } catch {
    throw new Error('网络不给力，稍后再试')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* 非 JSON 响应按空处理，走下面的通用错误 */
  }
  if (res.ok) return data
  if (res.status === 401) clearToken() // 会话失效：本地清 token，界面层自行决定引导
  throw new Error((data && data.error) || '出了点小问题，稍后再试')
}
