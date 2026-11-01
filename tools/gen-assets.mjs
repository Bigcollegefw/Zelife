#!/usr/bin/env node
/* 美术资产生成入口（火山 Agent Plan · Seedream 5.0-pro，2026-11 验证打通）。
   用法：
     node tools/gen-assets.mjs                  # 槽位报告：缺失 / 零字节 / 尺寸
     node tools/gen-assets.mjs gen <槽位id>      # 按槽位提示词调 API，原图落 .asset-gen/out/
     node tools/gen-assets.mjs post <入图> <出图> [宽]   # 降采样+压缩（需 npm i -D sharp）
   约定：
   - API key 存 .config/api_keys.json（已 gitignore）：{ "seedream": "ark-..." }
   - 必须走套餐端点 /api/plan/v3（走 /api/v3 会报 key not exist），费用走套餐燃料值
   - 返回取 b64_json 直存文件；url 只有 24h 有效，不依赖
   - 透明底：Seedream 5.0-pro 支持 background:"transparent"（组图模式不支持，本工具不用组图）
   - 规范与提示词的「为什么」见 src/assets/asset_bible.md；各目录还有 README */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations'
const MODEL = 'doubao-seedream-5-0-pro-260628'
const OUT_DIR = resolve(ROOT, '.asset-gen/out')

/* ---------- 槽位清单：文件即插槽，放图即生效；提示词在此维护 ---------- */
const SAME_STICKER =
  '与参考图完全相同的角色立绘（同构图、同比例、同色彩、同画风），只做一处改动——'
export const SLOTS = [
  {
    id: 'crayon-sprite',
    file: 'src/assets/skins/crayon/sprite.png',
    size: '1024x1024',
    transparent: true,
    ref: '.asset-gen/refA-keyed.png', // 彩铅绘本妹妹（cand-A 色键抠底版：透明底生成要求参考图自带 alpha）
    prompt:
      '参考图角色原样使用（同发型同服装同书本同画风）：完整全身立绘，大头小身Q版比例，站在画面中央，脚部贴近画面下缘，四边留白均匀。柔和彩铅笔触与厚涂渐变，轮廓柔和不描硬边，腮红明显，暖色治愈绘本风。透明背景，无任何底板、圆圈、边框、文字、投影，缩小后剪影仍可辨认。',
  },
  {
    id: 'crayon-blink',
    file: 'src/assets/skins/crayon/sprite-blink.png',
    size: '1024x1024',
    transparent: true,
    ref: 'src/assets/skins/crayon/sprite.png', // 以定稿主图为基准做表情变体
    prompt: SAME_STICKER + '把眼睛改成闭眼（两道柔和下弯弧线），保持微笑。透明背景，无文字。',
  },
  {
    id: 'crayon-happy',
    file: 'src/assets/skins/crayon/sprite-happy.png',
    size: '1024x1024',
    transparent: true,
    ref: 'src/assets/skins/crayon/sprite.png',
    prompt: SAME_STICKER + '把表情改成很开心：眼睛弯成月牙笑眼，嘴巴张开大笑，腮红更明显。透明背景，无文字。',
  },
  {
    id: 'crayon-sad',
    file: 'src/assets/skins/crayon/sprite-sad.png',
    size: '1024x1024',
    transparent: true,
    ref: 'src/assets/skins/crayon/sprite.png',
    prompt: SAME_STICKER + '把表情改成低落：眉毛微微下垂，嘴角轻轻向下，眼睛湿润。透明背景，无文字。',
  },
  {
    id: 'brand-wordmark',
    file: 'src/assets/brand/wordmark.png',
    size: '2048x1024',
    // 透明模式要求恰好一张带 alpha 的输入图，字标无参考图 → 走纯色底生成 + key 命令色键抠底
    postNote: 'key <原图> .asset-gen/wordmark-keyed.png 6 → post ... 1200',
    prompt:
      '「择择人生」四个中文大字，横排一行，稚拙可爱的儿童手写蜡笔字，笔画带蜡笔断线与飞白质感，牛仔蓝色字，字距自然，字的中心线大致水平但每个字略有倾斜错落。纯奶油米色纯色背景（无纹理无渐变，方便抠图），横版构图，画面里只有这四个字：无英文、无标点、无图案、无描边、无投影。',
  },
]

/* ---------- key ---------- */
function apiKey() {
  const p = resolve(ROOT, '.config/api_keys.json')
  if (existsSync(p)) {
    const k = JSON.parse(readFileSync(p, 'utf8')).seedream
    if (k) return k
  }
  throw new Error('缺少 API key：请在 .config/api_keys.json 写 { "seedream": "ark-..." }（该目录已 gitignore）')
}

/* ---------- 生成 ---------- */
async function gen(id) {
  const slot = SLOTS.find((s) => s.id === id)
  if (!slot) throw new Error(`未知槽位 ${id}（可用：${SLOTS.map((s) => s.id).join(', ')}）`)
  const body = {
    model: MODEL,
    prompt: slot.prompt,
    size: slot.size,
    response_format: 'b64_json',
    output_format: 'png',
    watermark: false,
  }
  if (slot.transparent) body.background = 'transparent'
  if (slot.ref) {
    const rp = resolve(ROOT, slot.ref)
    if (existsSync(rp)) {
      const mime = slot.ref.endsWith('.png') ? 'image/png' : 'image/jpeg'
      body.image = [`data:${mime};base64,${readFileSync(rp).toString('base64')}`]
    } else {
      console.warn(`[warn] 参考图不存在，跳过：${slot.ref}（表情帧依赖定稿主图）`)
    }
  }
  console.log(`→ ${id}  ${body.image ? '（带参考图）' : ''}${body.background ? '透明底' : ''}`)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error(`返回里没有 b64_json：${JSON.stringify(json).slice(0, 300)}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const out = resolve(OUT_DIR, `${id}-${Date.now()}.png`)
  writeFileSync(out, Buffer.from(b64, 'base64'))
  console.log(`✓ 原图 ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`)
  const w = slot.size.startsWith('2048') ? 1200 : 512
  console.log(`  落槽位：node tools/gen-assets.mjs post "${out}" "${slot.file.replace(/\.png$/, '.webp')}" ${w}`)
}

/* ---------- 色键抠底：把近似纯色背景抠成透明（sharp 可选依赖） ----------
   用途有二：① 透明底生成要求参考图自带 alpha——把奶油底锚点图抠透再用（2026-11 API 实测约束）；
   ② 兜底：生成结果没走成透明通道时手工抠。容差按 RGB 欧氏距离，默认 30 */
async function keyBg(inPath, outPath, tol = 30) {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    throw new Error('需要 sharp：npm i -D sharp')
  }
  const src = resolve(ROOT, inPath)
  const dst = resolve(ROOT, outPath)
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // 以四角平均色为键色（锚点图都是纯色背景）
  const at = (x, y) => ((y * info.width + x) * info.channels) | 0
  const corners = [
    [at(2, 2), at(info.width - 3, 2), at(2, info.height - 3), at(info.width - 3, info.height - 3)],
  ].flat()
  const kc = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / corners.length)
  const t2 = tol * tol
  for (let i = 0; i < data.length; i += info.channels) {
    const d = (data[i] - kc[0]) ** 2 + (data[i + 1] - kc[1]) ** 2 + (data[i + 2] - kc[2]) ** 2
    if (d < t2) data[i + 3] = 0
  }
  mkdirSync(dirname(dst), { recursive: true })
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(dst)
  console.log(`✓ 抠底 ${outPath}（键色 rgb(${kc.map((v) => v | 0)})，容差 ${tol}）`)
}

/* ---------- 后处理：降采样 + 压缩（sharp 可选依赖） ---------- */
async function post(inPath, outPath, width = 512) {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    throw new Error('需要 sharp：npm i -D sharp')
  }
  const src = resolve(ROOT, inPath)
  const dst = resolve(ROOT, outPath)
  mkdirSync(dirname(dst), { recursive: true })
  let img = sharp(src).resize({ width, withoutEnlargement: true })
  img = dst.endsWith('.webp') ? img.webp({ quality: 90 }) : img.png({ compressionLevel: 9 })
  await img.toFile(dst)
  console.log(`✓ ${outPath} (${(statSync(dst).size / 1024).toFixed(0)} KB, 宽 ${width})`)
}

/* ---------- 槽位报告 ---------- */
function pngSize(buf) {
  return buf.length > 24 && buf.readUInt32BE(12) === 0x49484452
    ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
    : '?'
}
function report() {
  console.log('槽位清单（放图即生效；.png/.webp 任一存在即可，详细规范见 src/assets/asset_bible.md）\n')
  for (const s of SLOTS) {
    const stem = s.file.replace(/\.png$/, '')
    const hit = [`${stem}.png`, `${stem}.webp`].find((f) => {
      const p = resolve(ROOT, f)
      if (!existsSync(p)) return false
      return statSync(p).size > 0
    })
    let mark = '✗ 缺失'
    if (hit) {
      const buf = readFileSync(resolve(ROOT, hit))
      mark = `✓ ${pngSize(buf)} (${(buf.length / 1024).toFixed(0)} KB)`
    }
    console.log(`  ${mark.padEnd(20)} ${s.id.padEnd(16)} ${hit ?? s.file}`)
  }
  console.log('\n旧插槽 src/assets/system/（皮肤没有对应图时的回落）与 src/assets/scenes/ 不在本表，规范见各自 README。')
}

const [cmd, a, b, c] = process.argv.slice(2)
if (cmd === 'gen') gen(a).catch((e) => (console.error(e.message), process.exit(1)))
else if (cmd === 'post') post(a, b, Number(c) || 512).catch((e) => (console.error(e.message), process.exit(1)))
else if (cmd === 'key') keyBg(a, b, Number(c) || 30).catch((e) => (console.error(e.message), process.exit(1)))
else report()
