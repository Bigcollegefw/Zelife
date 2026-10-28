import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './theme.js'
import './styles/main.css'

initTheme() // 挂载前定好深浅，避免首帧闪白

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
