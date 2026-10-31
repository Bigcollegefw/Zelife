<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 系统小人：独立于面板的漂浮角色（红果短剧式小系统）。
 * mode = 'dock'     随面板召唤飞入屏幕，绕一圈后停靠进面板头部
 * mode = 'announce' 飞到屏幕中上方，带气泡逐字播报（效果页结算）
 * 气泡文本走打字机 + TTS（与系统面板共用同一个语音开关）。
 */
const props = defineProps({
  mode: { type: String, default: 'dock' },
  text: { type: String, default: '' },
})

const VOICE_KEY = 'galplan-sysvoice'
let voiceOn = false
try {
  voiceOn = localStorage.getItem(VOICE_KEY) === '1'
} catch { /* 默认不读 */ }

const FLY_MS = 1650 // 与飞行动画（1.5s）+ 起飞延迟（0.15s）一致，停稳后才开始播报

/* ---------- 美术资源插槽 ----------
   把做好的小人图放进 src/assets/system/：
   - sprite.png        主形象（透明背景 PNG，建议 512×512，角色居中占约 70%）
   - sprite-blink.png  可选：眨眼帧（与主形象同构图，仅改眼睛），没有就自动用代码眨眼
   有 sprite.png 就用它替换内置 SVG，动画（飞行/浮动/眨眼切换）全部由代码继续驱动 */
const assets = import.meta.glob('../assets/system/sprite*.{png,webp}', { eager: true, import: 'default' })
const spriteImg =
  assets['../assets/system/sprite.png'] ?? assets['../assets/system/sprite.webp'] ?? null
const blinkImg =
  assets['../assets/system/sprite-blink.png'] ?? assets['../assets/system/sprite-blink.webp'] ?? null
const shown = ref('')
const done = ref(false)
let timer = null
let flyTimer = null
const docked = ref(false)

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
  }, 40)
}
function stopSpeak() {
  try { window.speechSynthesis?.cancel() } catch { /* 无语音环境 */ }
}
function speak(full) {
  stopSpeak()
  if (!voiceOn || !full) return
  const u = new SpeechSynthesisUtterance(full)
  u.lang = 'zh-CN'
  u.rate = 1.05
  try { window.speechSynthesis.speak(u) } catch { /* 无语音环境静默 */ }
}

onMounted(() => {
  flyTimer = setTimeout(() => {
    docked.value = true
    play()
    speak(props.text)
  }, FLY_MS)
})
watch(() => props.text, (t) => {
  if (!docked.value) return
  play()
  speak(t)
})
onBeforeUnmount(() => {
  clearTimeout(flyTimer)
  clearInterval(timer)
  stopSpeak()
})
</script>

<template>
  <div class="spr" :class="[mode, { docked }]">
    <!-- 美术图（放入 assets/system/sprite.png 后自动启用） -->
    <img v-if="spriteImg" class="spr-img" :src="spriteImg" alt="" />
    <!-- 可选眨眼帧：周期性盖在主图上 -->
    <img v-if="spriteImg && blinkImg" class="spr-img spr-blink" :src="blinkImg" alt="" />

    <!-- 内置占位小人（无美术资源时的兜底） -->
    <svg v-if="!spriteImg" class="spr-figure" viewBox="0 0 64 64" aria-hidden="true">
      <!-- 头顶日晷徽记 -->
      <g class="spr-halo">
        <circle cx="32" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4" />
        <line x1="32" y1="1.5" x2="32" y2="4" stroke="currentColor" stroke-width="1.4" />
      </g>
      <!-- 墨色圆身 -->
      <ellipse cx="32" cy="38" rx="17" ry="19" fill="currentColor" />
      <!-- 白点眼 -->
      <g class="spr-eyes">
        <circle cx="26.5" cy="34" r="2.1" fill="#FAF8F4" />
        <circle cx="37.5" cy="34" r="2.1" fill="#FAF8F4" />
      </g>
      <!-- 小账本 -->
      <rect x="24" y="46" width="16" height="10" rx="1.5" fill="#FAF8F4" opacity="0.85" />
      <line x1="27" y1="50" x2="37" y2="50" stroke="#3A342C" stroke-width="1.2" />
      <line x1="27" y1="53" x2="34" y2="53" stroke="#3A342C" stroke-width="1.2" />
    </svg>

    <!-- 播报气泡（announce 模式） -->
    <div v-if="mode === 'announce' && props.text" class="spr-bubble" :class="{ ready: docked }">
      <span class="spr-bubble-t">{{ shown }}<i v-if="!done" class="spr-caret" /></span>
    </div>
  </div>
</template>

<style scoped>
.spr {
  position: fixed;
  z-index: 12;
  pointer-events: none;
  color: #3A342C;
  will-change: transform, filter;
  /* 阴影统一放在容器层：飞行/绕卡时的远近虚影由关键帧整体控制 */
  filter: drop-shadow(0 4px 10px rgba(20, 18, 15, 0.28));
}

/* ---------- dock：停靠在面板头部（与 SystemPanel 的 fixed 坐标对齐） ---------- */
.spr.dock {
  top: calc(64px + env(safe-area-inset-top));
  left: 20px;
  width: 44px;
  /* 绕卡一周（带透视）：右上前方向入画 → 掠过卡片上沿 → 钻到卡片【后面】（缩小+虚焦+被卡片遮挡）
     → 从卡片左下前方钻出（放大回来）→ 沿卡片左缘滑上头部停稳。
     z-index 在关键帧间离散翻转（面板 z=6）：前 14 / 后 3，即“到它前面也可以到它后面” */
  z-index: 12;
  animation: spr-fly-dock 1.5s cubic-bezier(0.4, 0.1, 0.3, 1) 0.15s both;
  will-change: transform, filter;
}
@keyframes spr-fly-dock {
  /* 入画：右上远处，在卡片前方（大 = 离观众近） */
  0% {
    z-index: 14;
    transform: translate(62vw, -38vh) rotate(12deg) scale(1.3);
    filter: drop-shadow(0 10px 22px rgba(20, 18, 15, 0.4));
    opacity: 0;
  }
  12% { opacity: 1; }
  /* 掠向卡片右上角，开始压低高度准备下潜 */
  30% {
    z-index: 14;
    transform: translate(28vw, 7vh) rotate(-5deg) scale(1.05);
  }
  /* 下潜：滑到卡片上沿之后——缩小 + 虚焦 + z 翻到卡片后 */
  46% {
    z-index: 3;
    transform: translate(1.5vw, 2vh) rotate(3deg) scale(0.8);
    filter: blur(1.6px) drop-shadow(0 4px 10px rgba(20, 18, 15, 0.2));
  }
  58% {
    z-index: 3;
    transform: translate(0.5vw, 12vh) rotate(-3deg) scale(0.82);
    filter: blur(1.4px);
  }
  /* 从卡片左下前方钻出：z 翻回前面，尺寸与清晰度恢复 */
  72% {
    z-index: 14;
    transform: translate(1vw, 22vh) rotate(4deg) scale(1.08);
    filter: drop-shadow(0 8px 18px rgba(20, 18, 15, 0.35));
  }
  /* 沿卡片左缘滑上头部，回摆一次落位 */
  86% {
    transform: translate(2.5vw, 2vh) rotate(-2deg) scale(0.98);
  }
  100% {
    z-index: 12;
    transform: translate(0, 0) rotate(0) scale(1);
    filter: drop-shadow(0 4px 10px rgba(20, 18, 15, 0.28));
  }
}

/* ---------- announce：从停靠位小幅腾起，仍在左上角播报（与决策面板同位＝身份连续，且不挡正文） ---------- */
.spr.announce {
  top: calc(120px + env(safe-area-inset-top));
  left: 16px;
  width: 60px;
  animation:
    spr-fly-announce 0.9s cubic-bezier(0.22, 0.68, 0.32, 1) both,
    spr-bob 4.6s ease-in-out 1s infinite;
}
@keyframes spr-fly-announce {
  0% { transform: translate(26vw, 14vh) rotate(-9deg) scale(0.85); opacity: 0; }
  20% { opacity: 1; }
  55% { transform: translate(-1.5vw, -3vh) rotate(4deg) scale(1.05); }
  80% { transform: translate(0.5vw, 1vh) rotate(-1deg) scale(0.98); }
  100% { transform: translate(0, 0) rotate(0) scale(1); }
}
@keyframes spr-bob { 50% { margin-top: -3px; } }

/* ---------- 角色本体动画 ---------- */
.spr-figure { width: 100%; height: auto; display: block; overflow: visible; }
/* 美术图形态：动画由代码驱动（飞行轨迹/浮动/旋转都作用在整图上） */
.spr-img {
  width: 100%;
  height: auto;
  display: block;
}
.spr-blink {
  position: absolute;
  inset: 0;
  /* 与内置 SVG 同节奏：4.4s 一轮，只在 4%~6% 时间窗露出眨眼帧 */
  animation: spr-blink-frame 4.4s steps(1) infinite;
  opacity: 0;
}
@keyframes spr-blink-frame { 0%, 4%, 6%, 100% { opacity: 0; } 5% { opacity: 1; } }
.spr-halo { transform-origin: 32px 7px; animation: spr-halo-spin 9s linear infinite; }
@keyframes spr-halo-spin { to { transform: rotate(360deg); } }
.spr-eyes { transform-origin: 32px 34px; animation: spr-blink 4.4s steps(1) infinite; }
@keyframes spr-blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }

/* ---------- 播报气泡：挂在小人下方、左对齐（宽度自适应，最长到屏幕 72%） ---------- */
.spr-bubble {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  transform: translateY(8px);
  width: max-content;
  max-width: 72vw;
  background: rgba(42, 37, 31, 0.94);
  color: #F5F1E8;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13.5px;
  letter-spacing: 0.04em;
  line-height: 1.8;
  white-space: pre-line;
  box-shadow: 0 10px 30px rgba(20, 18, 15, 0.35);
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.spr-bubble.ready { opacity: 1; transform: translateY(0); }
.spr-bubble::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 18px;
  transform: rotate(45deg);
  width: 12px;
  height: 12px;
  background: rgba(42, 37, 31, 0.94);
}
.spr-caret {
  display: inline-block;
  width: 1px;
  height: 12px;
  background: #F5F1E8;
  margin-left: 2px;
  vertical-align: -1px;
  animation: spr-blink-caret 1s steps(1) infinite;
}
@keyframes spr-blink-caret { 50% { opacity: 0; } }
</style>
