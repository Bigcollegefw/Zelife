/**
 * 系统语音（TTS）：浏览器内置中文语音，零成本零依赖。
 * 供 SystemPanel（旁白 + 选项朗读）与 SysSprite（效果页播报）共用；
 * 开关状态存 localStorage('galplan-sysvoice')，两处共享同一开关。
 * 设置弹层（SettingsSheet）是开关/语速的正主，面板小喇叭是同源快捷入口——
 * 状态收在 voiceState（reactive），改一处两处同步。
 */
import { reactive } from 'vue'

export const VOICE_KEY = 'galplan-sysvoice'
const RATE_KEY = 'galplan-voice-rate' // 'slow' | 'normal' | 'fast'
const RATES = { slow: 0.85, normal: 1.05, fast: 1.3 }

function readStore(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStore(key, v) {
  try { localStorage.setItem(key, v) } catch { /* 忽略 */ }
}

export const voiceState = reactive({
  on: readStore(VOICE_KEY) === '1',
  rate: RATES[readStore(RATE_KEY)] ? readStore(RATE_KEY) : 'normal',
})

export function isVoiceOn() {
  return voiceState.on
}
export function setVoice(on) {
  voiceState.on = on
  writeStore(VOICE_KEY, on ? '1' : '0')
  if (!on) stopSpeak() // 正在朗读时当场关掉：立即安静
}
export function setVoiceRate(r) {
  voiceState.rate = r
  writeStore(RATE_KEY, r)
}
export function stopSpeak() {
  try { window.speechSynthesis?.cancel() } catch { /* 无语音环境 */ }
  keepAlive = []
  if (ticker) { clearInterval(ticker); ticker = null }
}

/* 音色选择：优先「AI 短剧感」的自然在线音色（Edge/Windows 11 自带 Xiaoxiao/Yunxi 等），
   其次 Apple 内置中文，最后任意中文音色。Chrome 的音色表异步加载，voiceschanged 后刷新缓存。 */
let cachedVoice = null
const PREFERRED = [
  'xiaoxiao', 'xiaoyi', 'yunxi', 'yunyang', 'yunjian', 'xiaomo', 'xiaohan', // 微软在线自然音色
  'tingting', 'meijia', 'sinji', // Apple 内置
  'huihui', 'yaoyao', 'kangkang', // Windows 传统 SAPI
]
function pickVoice() {
  const synth = window.speechSynthesis
  const voices = synth.getVoices()
  if (!voices.length) return null // 音色表还没就绪：下次发声再挑
  const zh = voices.filter((v) => /^zh/i.test(v.lang) || /中文|chinese/i.test(v.name))
  if (!zh.length) return null
  for (const p of PREFERRED) {
    const hit = zh.find((v) => v.name.toLowerCase().includes(p))
    if (hit) return hit
  }
  return zh[0]
}
function zhVoice() {
  if (cachedVoice) return cachedVoice
  cachedVoice = pickVoice()
  return cachedVoice
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  try {
    window.speechSynthesis.getVoices() // 预热：触发 Chrome 异步加载音色表
    window.speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoice = null })
  } catch { /* 无语音环境 */ }
}

/* 两个 Chromium 已知坑的防御：
   1) 排队中的 SpeechSynthesisUtterance 会被提前 GC → 后面的段落静音。靠 keepAlive 持引用保命
   2) 桌面端连续朗读 ~15s 会被浏览器掐断 → 朗读期间每 10s pause+resume 续命（触屏设备有 pause 卡死 bug，不启用） */
let keepAlive = []
let ticker = null

/**
 * 顺序朗读多段文字（speechSynthesis 自动排队，一段播完接一段）。
 * 只在开关打开时发声；开头 cancel 打断上一轮。parts 中的空段自动跳过。
 * 语速优先取显式参数，缺省跟随设置里的朗读语速（voiceState.rate）。
 */
export function speakSeq(parts, { rate } = {}) {
  rate = rate ?? RATES[voiceState.rate] ?? 1.05
  const queue = (parts ?? []).filter(Boolean)
  if (!queue.length) return // 空播报（如 dock 小人没有播报词）直接返回：不能 cancel，否则会掐断面板正在进行的朗读
  stopSpeak()
  if (!isVoiceOn() || !window.speechSynthesis) return
  const synth = window.speechSynthesis
  const v = zhVoice()
  for (const text of queue) {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    if (v) u.voice = v
    u.rate = rate
    keepAlive.push(u)
    try { synth.speak(u) } catch { /* 无语音环境静默 */ }
  }
  if (ticker) clearInterval(ticker)
  const isTouch = 'ontouchstart' in window
  ticker = setInterval(() => {
    if (synth.speaking || synth.pending) {
      if (!isTouch) {
        try { synth.pause(); synth.resume() } catch { /* 忽略 */ }
      }
    } else if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }, 10000)
}
