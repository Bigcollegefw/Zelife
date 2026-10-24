import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787', // 显式 127.0.0.1：Windows 下 localhost 可能解析成 ::1 而 wrangler 只听 IPv4
        changeOrigin: true, // Host 改写成 127.0.0.1：否则手机经代理进来时 worker 看到的是局域网 IP，
        // DEV_FALLBACK 的 isLocalRequest 判定会失败，手机上拿不到开发验证码
      },
    },
  },
})
