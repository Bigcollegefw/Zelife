<script setup>
/* 头像裁剪：圆形蒙版取景，双指缩放 + 单指拖动（桌面：拖动 + 滚轮），双击复位。
   交互语言与 FitAdjust 一致。实现要点：
   - 不用 object-fit + overflow 裁切（iOS Safari 上 transform 叠 object-fit 会渲染成黑块），
     cover 缩放由 transform 自己算：显示尺寸 = 自然尺寸 × z（z = cover 基础缩放 × s），
     内容中心 = 框中心 + (tx, ty)。
   - 圆圈用「蒙版挖洞」呈现：圈外压暗、圆环描边，圈内就是头像。
   - 确认时把圈内可见区域画到 256×256 canvas 出 JPEG：
     窗口在自然坐标的左边 = nat.w/2 − (box/2 + tx) / z，边长 = box / z。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({ src: { type: String, required: true } })
const emit = defineEmits(['done', 'cancel'])

const SIZE = 256 // 输出边长
const MAX_S = 6 // 缩放上限（s 倍数）

const boxEl = ref(null)
const imgEl = ref(null)
const nat = ref({ w: 0, h: 0 })
const box = ref(0) // 取景框边长 px
const s = ref(1)
const tx = ref(0)
const ty = ref(0)
const pointers = new Map()
let start = null
let lastTap = 0

const z = computed(() => {
  if (!box.value || !nat.value.w || !nat.value.h) return 1
  const k = Math.max(box.value / nat.value.w, box.value / nat.value.h)
  return k * s.value
})
const imgStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${tx.value}px, ${ty.value}px) scale(${z.value})`,
}))

function onImgLoad() {
  nat.value = { w: imgEl.value?.naturalWidth || 1, h: imgEl.value?.naturalHeight || 1 }
  measure()
}
function measure() {
  box.value = boxEl.value ? boxEl.value.getBoundingClientRect().width : 0
  clampT()
}
onMounted(async () => {
  await nextTick()
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))

/* 平移夹紧：任何缩放下内容都不露出框外 */
function clampT() {
  if (!box.value) return
  const mx = Math.max(0, (nat.value.w * z.value - box.value) / 2)
  const my = Math.max(0, (nat.value.h * z.value - box.value) / 2)
  tx.value = Math.min(mx, Math.max(-mx, tx.value))
  ty.value = Math.min(my, Math.max(-my, ty.value))
}

function snapStart() {
  const [a, b] = [...pointers.values()]
  if (!a || !b) {
    start = null
    return
  }
  start = {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    s: s.value,
    tx: tx.value,
    ty: ty.value,
  }
}
function onDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 1) {
    const now = performance.now()
    if (now - lastTap < 300) {
      s.value = 1
      tx.value = 0
      ty.value = 0 // 双击复位
    }
    lastTap = now
  } else if (pointers.size === 2) {
    snapStart()
  }
}
function onMove(e) {
  if (!pointers.has(e.pointerId)) return
  const prev = pointers.get(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size >= 2 && start) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
    s.value = Math.min(MAX_S, Math.max(1, (start.s * dist) / start.dist))
    tx.value = start.tx + ((a.x + b.x) / 2 - start.cx)
    ty.value = start.ty + ((a.y + b.y) / 2 - start.cy)
  } else if (pointers.size === 1) {
    tx.value += e.clientX - prev.x
    ty.value += e.clientY - prev.y
  }
  clampT()
}
function onUp(e) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) start = null
}
function onWheel(e) {
  e.preventDefault()
  s.value = Math.min(MAX_S, Math.max(1, s.value * (e.deltaY < 0 ? 1.08 : 0.93)))
  clampT()
}

/* 圈内可见区域 → 256×256 JPEG */
function finish() {
  const img = imgEl.value
  if (!img || !box.value || !nat.value.w) {
    emit('cancel')
    return
  }
  const sx = nat.value.w / 2 - (box.value / 2 + tx.value) / z.value
  const sy = nat.value.h / 2 - (box.value / 2 + ty.value) / z.value
  const side = box.value / z.value
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
  emit('done', canvas.toDataURL('image/jpeg', 0.85))
}
</script>

<template>
  <Teleport to="body">
    <div class="ac" @click.stop>
      <div ref="boxEl" class="ac-stage">
        <img
          ref="imgEl"
          :src="src"
          class="ac-img"
          :style="imgStyle"
          alt=""
          draggable="false"
          @load="onImgLoad"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        />
        <div class="ac-hole" />
        <div class="ac-ring" />
      </div>

      <header class="ac-top">
        <span class="ac-title serif">调整头像</span>
        <button class="ac-x" @click="emit('cancel')">✕ 放弃</button>
      </header>
      <p class="ac-hint">圈内就是头像 · 双指缩放 · 单指拖动 · 双击复位</p>
      <div class="ac-btns">
        <button class="ac-btn go" @click="finish">完成</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ac {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: #2b2823;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ac-stage {
  position: relative;
  width: min(86vw, 56vh);
  height: min(86vw, 56vh); /* 显式高度，不依赖 aspect-ratio（旧 iOS 没有） */
}
.ac-img {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: none;
  touch-action: none; /* iOS 上接管双指，不让页面跟着缩放 */
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  z-index: 1;
}
.ac-hole {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 200vmax rgba(43, 40, 35, 0.86); /* 圈外全部压暗 */
  pointer-events: none;
  z-index: 2;
}
.ac-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(245, 241, 232, 0.35);
  pointer-events: none;
  z-index: 3;
}
.ac-top {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  z-index: 4;
}
.ac-title { font-size: 14px; letter-spacing: 0.18em; color: rgba(245, 241, 232, 0.85); }
.ac-x {
  border: none; background: rgba(245, 241, 232, 0.12); color: #f5f1e8;
  font: inherit; font-size: 12px; letter-spacing: 0.08em;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
}
.ac-hint {
  position: absolute;
  top: calc(52px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(245, 241, 232, 0.45);
  pointer-events: none;
  z-index: 4;
}
.ac-btns {
  position: absolute;
  bottom: calc(20px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 4;
}
.ac-btn {
  font: inherit; font-size: 14px; letter-spacing: 0.1em; cursor: pointer;
  padding: 12px 34px; border-radius: 999px; border: none;
  background: #f5f1e8; color: #2b2823; font-weight: 600;
}
.ac-btn:active { filter: brightness(1.1); }
</style>
