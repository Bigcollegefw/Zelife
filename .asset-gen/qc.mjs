/* 临时质检脚本：验证 alpha 通道 + 出 512 webp 预览（用后即弃） */
import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'

const dir = '.asset-gen/out'
for (const f of readdirSync(dir).filter((x) => x.includes('-') && x.endsWith('.png'))) {
  const p = `${dir}/${f}`
  const m = await sharp(p).metadata()
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const corner = (x, y) => data[((y * info.width + x) * 4) + 3]
  let nz = 0
  for (let i = 3; i < data.length; i += 4007) if (data[i] > 8) nz++
  const out = `.asset-gen/prev-${f.replace('.png', '.webp')}`
  await sharp(p).resize({ width: f.includes('wordmark') ? 600 : 512 }).webp({ quality: 90 }).toFile(out)
  console.log(
    f, `${m.width}x${m.height}`,
    'alpha:' + m.hasAlpha,
    '四角alpha:', corner(2, 2), corner(510, 2), corner(2, 510), corner(510, 510),
    '不透明采样:', nz,
    '→', out, (statSync(out).size / 1024).toFixed(0) + 'KB',
  )
}
