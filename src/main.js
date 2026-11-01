import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './theme.js'
import { initSkin } from './skin.js'
import './styles/main.css'
import './styles/skins/crayon.css' // 顺序契约：必须在 main.css 之后（同变量名的整组覆盖）

initTheme() // 挂载前定好深浅，避免首帧闪白
initSkin() // 挂载前定好皮肤（含 iOS 状态栏色；在 initTheme 后，theme-color 由它统一裁决）

createApp(App).use(router).mount('#app')

// 手机软键盘：聚焦输入框时把它滚到可见（iOS Safari 布局视口不收缩，容易挡住底部输入框；
// Capacitor WKWebView 默认会压缩视口，此兜底在两种环境下都无害）
window.addEventListener(
  'focusin',
  (e) => {
    const t = e.target
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') && !t.hidden) {
      setTimeout(() => t.scrollIntoView?.({ block: 'nearest' }), 320) // 等键盘弹出动画结束
    }
  },
  { passive: true },
)
