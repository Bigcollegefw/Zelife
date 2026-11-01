/* 演出偏好（本机）：打字速度。存 localStorage，与进度、账号无关，访客同样生效。
   作用点 = 全部 DialogueBox / SystemPanel（StageView 统一传 typeSpeedMs()）。 */
import { reactive } from 'vue'

const KEY = 'galplan-typespeed-v1' // 'slow' | 'normal' | 'fast'
const SPEED_MS = { slow: 78, normal: 42, fast: 14 }

function load() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

const saved = load()
export const typeState = reactive({
  speed: SPEED_MS[saved] ? saved : 'normal',
})

export function setTypeSpeed(v) {
  typeState.speed = v
  try { localStorage.setItem(KEY, v) } catch { /* 忽略 */ }
}

/** 当前打字间隔（ms/字）。模板里调用，随设置即时响应 */
export function typeSpeedMs() {
  return SPEED_MS[typeState.speed] ?? SPEED_MS.normal
}
