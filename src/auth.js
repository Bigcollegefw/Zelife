/* 账号状态 + 登录弹层，镜像 confirm.js 的命令式形态（openLogin() → Promise）。
   账号只为分享服务：本地剧本/进度永远不要求登录、不上传。
   token 存 localStorage（galplan-auth-v1，opaque token，服务端只存其哈希）；
   启动时后台 /api/me 校验，不阻塞 app。 */

import { reactive } from 'vue'
import { api } from './api.js'

const KEY = 'galplan-auth-v1'

export const authState = reactive({
  user: null, // { id, email, nickname, created_at }
  token: null,
  loginOpen: false,
  resolve: null,
})

function persist() {
  if (authState.token) {
    localStorage.setItem(KEY, JSON.stringify({ token: authState.token, user: authState.user }))
  } else {
    localStorage.removeItem(KEY)
  }
}

/* 会话失效（api 收到 401）时调用：token 与用户一并清——
   界面必须回到诚实的未登录态，否则会「看着像登录了」却发不出任何凭证 */
export function clearToken() {
  authState.token = null
  authState.user = null
  persist()
}

/* 打开登录弹层：登录成功 resolve(true)，关闭/取消 resolve(false)。
   已开着时旧 promise 按取消结清（同 confirmBox）。 */
export function openLogin() {
  return new Promise((resolve) => {
    if (authState.loginOpen) authState.resolve?.(false)
    authState.resolve = resolve
    authState.loginOpen = true
  })
}

export function closeLogin(result) {
  authState.resolve?.(result)
  authState.loginOpen = false
  authState.resolve = null
}

export function requestCode(email) {
  return api('/auth/request-code', { method: 'POST', body: { email } })
}

export async function verifyCode(email, code) {
  const data = await api('/auth/verify', { method: 'POST', body: { email, code } })
  authState.token = data.token
  authState.user = data.user
  persist()
  return data.user
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' })
  } catch {
    /* 本地清掉即可；服务端会话到期自清 */
  }
  authState.token = null
  authState.user = null
  persist()
}

/* 改昵称（主页用）：成功即更新本地缓存的用户 */
export async function updateNickname(nickname) {
  const data = await api('/me', { method: 'PATCH', body: { nickname } })
  authState.user = data.user
  persist()
  return data.user
}

/* 头像：上传（客户端压好的 JPEG Blob）成功后按服务端版本号更新本地缓存 */
export async function uploadAvatar(blob) {
  const data = await api('/me/avatar', { method: 'PUT', body: blob })
  authState.user = {
    ...authState.user,
    avatar_version: data.avatar_version,
    avatar_status: data.avatar_status,
  }
  persist()
  return data
}

/* App.vue onMounted 调用：乐观恢复登录态 + 后台校验。
   401 时 api() 已清登录态（回到诚实未登录）；网络失败则全保留，离线容忍、静默。 */
export async function initAuth() {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    saved = null
  }
  if (!saved || !saved.token) return
  authState.token = saved.token
  authState.user = saved.user || null
  try {
    const data = await api('/me')
    authState.user = data.user
    persist()
  } catch {
    /* 保留现状：要么已清 token，要么离线 */
  }
}

export function useAuth() {
  return { authState, openLogin, closeLogin, requestCode, verifyCode, logout, initAuth }
}
