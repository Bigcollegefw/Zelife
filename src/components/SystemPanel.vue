<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 系统面板：决策时刻的「系统」演出（短剧风）。
 * 小人播报本时刻旁白（打字机），打完亮出系统化选项。
 * 自带 TTS 朗读开关（浏览器内置语音，零成本）；顶替原「底部旁白 + 中间选项」组合。
 * 对外暴露 skip / isTyping，接口与 DialogueBox 一致——舞台的轻触推进逻辑无需改动。
 */
const props = defineProps({
  tag: { type: String, default: '' }, // 时刻标题，如「午后 · 房间」
  text: { type: String, required: true }, // 系统播报正文（节点旁白）
  choices: { type: Array, default: () => [] }, // [{ text, ... }]
  speed: { type: Number, default: 42 }, // ms / 字
})
const emit = defineEmits(['choose'])

const VOICE_KEY = 'galplan-sysvoice'

const shown = ref('')
const done = ref(false)
let timer = null
let flyTimer = null
const docked = ref(false) // 飞行动画结束后才开始播报（短剧感：先飞到位再开口）

/* ---------- 打字机（等待停靠结束后启动） ---------- */
function play() {
  clearInterval(timer)
  shown.value = ''
  done.value = false
  if (!props.text) {
    done.value = true
    return
  }
  let i = 0
  timer = setInterval(() => {
    i += 1
    shown.value = props.text.slice(0, i)
    if (i >= props.text.length) {
      clearInterval(timer)
      done.value = true
    }
  }, props.speed)
}
function dock() {
  if (docked.value) return
  docked.value = true
  play()
}
onMounted(() => {
  flyTimer = setTimeout(dock, 950) // 与飞行动画时长一致
})
watch(() => props.text, () => { if (docked.value) play() })
onBeforeUnmount(() => {
  clearTimeout(flyTimer)
  clearInterval(timer)
  stopSpeak()
})

function skip() {
  clearTimeout(flyTimer)
  dock() // 飞行途中被点：立刻停到左上角
  if (done.value) return
  clearInterval(timer)
  shown.value = props.text
  done.value = true
}

function isTyping() {
  return !done.value
}
defineExpose({ skip, isTyping })

/* ---------- TTS：浏览器内置中文语音 ---------- */
const voiceOn = ref(false)
try {
  voiceOn.value = localStorage.getItem(VOICE_KEY) === '1'
} catch { /* 隐私模式等：默认关 */ }

function stopSpeak() {
  try { window.speechSynthesis?.cancel() } catch { /* 无语音环境 */ }
}
function speak(full) {
  stopSpeak()
  if (!voiceOn.value || !full) return
  const u = new SpeechSynthesisUtterance(full)
  u.lang = 'zh-CN'
  u.rate = 1.05
  try { window.speechSynthesis.speak(u) } catch { /* 无语音环境静默 */ }
}
watch(voiceOn, (on) => {
  try { localStorage.setItem(VOICE_KEY, on ? '1' : '0') } catch { /* 忽略 */ }
  if (on && docked.value) speak(props.text)
  else stopSpeak()
})
watch(() => props.text, (t) => { if (docked.value) speak(t) })

/* ---------- 小人：墨色小系统（占位形象，后续可替换成生成的贴纸图） ---------- */
</script>

<template>
  <div class="sys" :class="{ docked }">
    <div class="sys-head">
      <span class="sys-dot" />
      <span class="sys-t">SYSTEM · 决策时刻</span>
      <span v-if="tag" class="sys-tag">{{ tag }}</span>
      <button
        class="sys-voice"
        :title="voiceOn ? '关闭系统语音' : '开启系统语音'"
        @click.stop="voiceOn = !voiceOn"
      >{{ voiceOn ? '🔊' : '🔇' }}</button>
    </div>

    <div class="sys-body">
      <p class="sys-text serif">{{ shown }}<i v-if="!done" class="sys-caret" /></p>
    </div>

    <!-- 选项：打完字才亮出，逐个浮起 -->
    <div class="sys-choices" :class="{ ready: done }">
      <button
        v-for="(c, i) in choices"
        :key="i"
        class="sys-choice"
        :style="{ transitionDelay: done ? i * 90 + 'ms' : '0ms' }"
        @click.stop="emit('choose', i)"
      >
        <span class="sys-num">{{ ['①', '②', '③', '④'][i] ?? i + 1 }}</span>
        <span class="sys-choice-t">{{ c.text }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sys {
  position: fixed;
  /* 停靠位：固定左上角（避开顶部状态条，留出安全区） */
  top: calc(58px + env(safe-area-inset-top));
  left: 12px;
  width: min(88%, 400px);
  z-index: 6;
  background: var(--veil);
  -webkit-backdrop-filter: blur(16px) saturate(1.05);
  backdrop-filter: blur(16px) saturate(1.05);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 16px 16px;
  box-shadow: 0 14px 40px var(--shadow);
  color: var(--ink);
  overflow: hidden;
  /* 短剧式飞入：从画面右下远处切入，弧线掠过屏幕，回摆一次后停在左上角 */
  animation: sys-fly 0.95s cubic-bezier(0.22, 0.68, 0.32, 1) both;
  will-change: transform;
}
@keyframes sys-fly {
  0% { transform: translate(120vw, 52vh) rotate(7deg) scale(1.06); opacity: 0; }
  18% { opacity: 1; }
  42% { transform: translate(30vw, 18vh) rotate(-3.5deg) scale(1.02); }
  72% { transform: translate(-4vw, -3vh) rotate(1.5deg) scale(0.99); }
  100% { transform: translate(0, 0) rotate(0) scale(1); }
}

/* 飞到位后：一道扫描光带掠过（信号接入感），延迟随飞行结束才开始 */
.sys::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 0%, rgba(250, 248, 244, 0.16) 46%, transparent 100%);
  transform: translateY(-100%);
}
.sys.docked::after { animation: sys-scan 0.5s ease-out 1; }
@keyframes sys-scan {
  from { transform: translateY(-100%); }
  to { transform: translateY(100%); }
}

.sys-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--ink-2);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.sys-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--good);
  animation: sys-pulse 1.6s ease-in-out infinite;
}
@keyframes sys-pulse { 50% { opacity: 0.35; } }
.sys-t { font-variant-numeric: tabular-nums; }
.sys-tag { margin-left: auto; letter-spacing: 0.08em; opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sys-voice {
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0.75;
}
.sys-voice:hover { opacity: 1; }

.sys-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding-top: 12px;
}

/* 小人已独立为 SysSprite 组件：飞行时会掠过面板，停稳后落在本面板头部（fixed 坐标对齐） */
/* 给头部左侧留出小人停靠位 */
.sys-head { padding-left: 40px; }

.sys-text {
  margin: 0;
  flex: 1;
  min-height: 62px;
  font-size: 15.5px;
  line-height: 1.9;
  letter-spacing: 0.03em;
  color: var(--ink);
}
.sys-caret {
  display: inline-block;
  width: 1px;
  height: 14px;
  background: var(--ink);
  margin-left: 2px;
  vertical-align: -2px;
  animation: sys-blinkcaret 1s steps(1) infinite;
}
@keyframes sys-blinkcaret { 50% { opacity: 0; } }

/* 选项：系统化按钮 */
.sys-choices {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sys-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 14.5px;
  letter-spacing: 0.04em;
  color: var(--on-ink);
  background: #3A342C;
  border: 1px solid #3A342C;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  /* 打完字才逐个亮出 */
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.34s ease, transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), filter 0.15s ease;
}
.sys-choices.ready .sys-choice { opacity: 1; transform: translateY(0); }
.sys-choice:active { filter: brightness(1.35); }
.sys-num { flex: none; font-size: 12px; opacity: 0.85; }
.sys-choice-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
