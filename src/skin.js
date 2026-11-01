/* 美术皮肤：蜡笔杂货（默认）/ 经典纸面。存本机（与进度、账号、主题无关）。
   机制：<html data-skin="crayon"> + skins/crayon.css 整组接管 CSS 变量——加一个皮肤
   = 加一个 CSS 文件 + 在 SKINS 表加一项。
   与 theme.js 正交：主题换「灯光」（明暗），皮肤换「颜料」（材质配色）。
   meta theme-color（iOS 状态栏底色）在这里统管：皮肤 × 明暗共四态。
   依赖方向 skin → theme 单向（读 themeState，theme.js 不知道皮肤存在）。
   index.html 里有段内联脚本做首帧防闪，键名/色值改动时三处同步：
   本文件 SKINS[].bar ↔ index.html 内联脚本 BAR ↔ skins/crayon.css 的 --bg。 */
import { reactive, watchEffect } from 'vue'
import { themeState } from './theme.js'

const KEY = 'galplan-skin-v1' // 'crayon' | 'classic'

export const SKINS = {
  crayon: {
    label: '蜡笔杂货',
    pose: 'edge', // SysSprite 停靠姿态：坐卡沿（choose）+ 躲猫猫（announce）
    bar: { light: '#F8EFDB', dark: '#26334F' }, // iOS 状态栏底色 = crayon.css 两档 --bg
  },
  classic: {
    label: '经典',
    pose: 'head', // 原姿态：落进面板头部左侧
    bar: { light: '#FAF8F4', dark: '#201D18' }, // 与 theme.js 既有值一致
  },
}
export const DEFAULT_SKIN = 'crayon'

function load() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

const saved = load()
export const skinState = reactive({
  skin: SKINS[saved] ? saved : DEFAULT_SKIN,
})

function apply() {
  if (!SKINS[skinState.skin]) skinState.skin = DEFAULT_SKIN
  document.documentElement.dataset.skin = skinState.skin
}

/** 切换皮肤（立即生效，无需刷新；小人表情帧等按 skinState 响应式换图） */
export function setSkin(v) {
  if (!SKINS[v]) return
  skinState.skin = v
  try { localStorage.setItem(KEY, v) } catch { /* 忽略 */ }
  apply()
}

/** main.js 挂载前调用（在 initTheme 之后）：应用本机选择，并盯皮肤×明暗写状态栏色 */
export function initSkin() {
  apply()
  // theme-color 由这里统一裁决：classic 的值与 theme.js 写的完全一致，不冲突
  watchEffect(() => {
    const bar = SKINS[skinState.skin]?.bar
    if (!bar) return
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', bar[themeState.resolved] ?? bar.light)
  })
}
