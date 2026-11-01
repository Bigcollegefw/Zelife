/* 到点提醒（浏览器 Notification API）：真实模式等待中、页面在后台标签时，
   新时刻到点发一条系统通知。零后端——能力边界（设置页如实展示）：
   - 桌面 Chrome/Edge/Safari：可用
   - 安卓 Chrome：需 PWA 的 Service Worker 配合（new Notification 会被拒，静默降级）
   - iOS Safari：浏览器内不支持，加桌面 PWA / App 打包后才可
   开关存本机 galplan-notify-v1；权限被浏览器拒绝时提示去浏览器设置里开。 */
import { reactive } from 'vue'

const KEY = 'galplan-notify-v1'

const supported = typeof window !== 'undefined' && 'Notification' in window

function read() {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function write(v) {
  try { localStorage.setItem(KEY, v) } catch { /* 忽略 */ }
}

export const notifState = reactive({
  supported,
  permission: supported ? Notification.permission : 'unsupported', // granted | denied | default | unsupported
  on: supported && Notification.permission === 'granted' && read() === '1',
})

/** 开=先要权限（被拒则维持关）；关=只记本机偏好，不动权限 */
export async function setNotify(on) {
  if (!on) {
    notifState.on = false
    write('0')
    return
  }
  if (!notifState.supported) return
  if (notifState.permission !== 'granted') {
    try {
      notifState.permission = await Notification.requestPermission()
    } catch {
      notifState.permission = Notification.permission
    }
  }
  notifState.on = notifState.permission === 'granted'
  write(notifState.on ? '1' : '0')
}

/** 到点通知：只在开关开启且页面在后台时发声（前台自有演出，不打扰） */
export function notifyMoment(time, title) {
  if (!notifState.on || !document.hidden) return
  try {
    const n = new Notification('现在轮到你', {
      body: `${time} · ${title}`,
      tag: 'galplan-moment', // 同一时刻只保留最新一条
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* 安卓 Chrome 等环境会拒绝页面直发通知（要走 Service Worker）：静默降级 */
  }
}
