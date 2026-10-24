// 收集 src/assets/scenes/ 里的照片：文件名（去掉扩展名）等于场景 id 即自动生效。
// 例如 wake.jpg 会自动成为「08:30 清晨 · 卧室」的背景。
const modules = import.meta.glob('./assets/scenes/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  import: 'default',
})

export function bundledPhoto(sceneId) {
  for (const [path, url] of Object.entries(modules)) {
    const name = path.split('/').pop().replace(/\.[^.]+$/, '')
    if (name === sceneId) return url
  }
  return null
}
