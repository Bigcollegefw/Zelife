/* 品牌文案单一来源：改名只动这里，各触点引用（见 assets/brand/README.md）。
   注意：localStorage 键名、package.json name、backup.js 校验仍叫 galplan——那是数据兼容红线，与本文件无关。
   wordmark 字标：往 src/assets/brand/ 放一张 wordmark.png（或 .webp，1200×480 透明横版）即自动启用；
   没有图时各页回退衬线文本字标（IntroView / AboutView 的 v-if 分支）。 */
const wordmarks = import.meta.glob('./assets/brand/wordmark.{png,webp}', { eager: true, import: 'default' })

export const APP_NAME = '择择人生'
export const TAGLINE = '把一天过成一场游戏'
export const WORDMARK =
  wordmarks['./assets/brand/wordmark.png'] ?? wordmarks['./assets/brand/wordmark.webp'] ?? ''
