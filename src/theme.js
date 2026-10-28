/* 外观主题：纸面（默认）/ 暖夜，可跟随系统。存本机（与进度、账号无关）。
   机制：<html data-theme="dark"> + main.css 里的 CSS 变量覆盖——将来美术皮肤走同一机制（换变量集）。
   index.html 里有一段内联脚本做首帧防闪，改键名/色值时两处同步。 */
import { reactive } from 'vue'

const KEY = 'galplan-theme-v1' // 'auto' | 'light' | 'dark'

export const themeState = reactive({
  setting: localStorage.getItem(KEY) || 'auto',
  resolved: 'light', // auto 实际落到哪一档
})

const mq = window.matchMedia('(prefers-color-scheme: dark)')

function apply() {
  themeState.resolved =
    themeState.setting === 'auto' ? (mq.matches ? 'dark' : 'light') : themeState.setting
  document.documentElement.dataset.theme = themeState.resolved
  // iOS 状态栏底色 / 表单控件配色跟随（与 CSS 里的 color-scheme 双保险）
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeState.resolved === 'dark' ? '#201D18' : '#FAF8F4')
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', themeState.resolved)
}

/** 切换档位（立即生效，无需刷新） */
export function setTheme(setting) {
  themeState.setting = setting
  localStorage.setItem(KEY, setting)
  apply()
}

/** main.js 挂载前调用：应用本机选择，并盯系统深浅变化（仅 auto 档跟随） */
export function initTheme() {
  apply()
  mq.addEventListener?.('change', () => {
    if (themeState.setting === 'auto') apply()
  })
}
