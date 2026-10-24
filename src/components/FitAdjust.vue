<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fitState, closeFitAdjust } from '../fit.js'
import { mediaUrl } from '../media.js'

/* 调整构图：双指缩放 + 单指拖动（桌面：拖动 + 滚轮缩放），双击复位。
   平移按余量夹紧，任何缩放下都不会露出黑边 */
const url = ref('')
const nat = ref({ w: 0, h: 0 })
const s = ref(1)
const tx = ref(0)
const ty = ref(0)
const imgEl = ref(null)
const pointers = new Map()
let start = null
let lastTap = 0

watch(
  () => fitState.open,
  async (open) => {
    if (!open) return
    s.value = 1
    tx.value = 0
    ty.value = 0
    nat.value = { w: 0, h: 0 }
    url.value = (await mediaUrl(fitState.desc?.id)) ?? ''
  },
)

function onImgLoad() {
  nat.value = { w: imgEl.value?.naturalWidth || 1, h: imgEl.value?.naturalHeight || 1 }
}

/** cover 基础上叠加 s 倍后，横/纵还能各挪多少（保证不露边） */
function bounds() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const k = Math.max(vw / nat.value.w, vh / nat.value.h)
  return {
    mx: Math.max(0, (nat.value.w * k * s.value - vw) / 2),
    my: Math.max(0, (nat.value.h * k * s.value - vh) / 2),
  }
}
function clampT() {
  const { mx, my } = bounds()
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
    s.value = Math.min(4, Math.max(1, (start.s * dist) / start.dist))
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
  s.value = Math.min(4, Math.max(1, s.value * (e.deltaY < 0 ? 1.08 : 0.93)))
  clampT()
}

/** ok=false 放弃这张图；withFit=false 用居中默认 */
function finish(ok, withFit) {
  if (!ok) {
    closeFitAdjust({ ok: false })
    return
  }
  if (!withFit) {
    closeFitAdjust({ ok: true, fit: null })
    return
  }
  const { mx, my } = bounds()
  closeFitAdjust({
    ok: true,
    fit: {
      s: +s.value.toFixed(3),
      x: mx ? +(tx.value / mx).toFixed(3) : 0,
      y: my ? +(ty.value / my).toFixed(3) : 0,
    },
  })
}

const rootEl = ref(null)
onMounted(() => rootEl.value?.addEventListener('wheel', onWheel, { passive: false }))
onBeforeUnmount(() => rootEl.value?.removeEventListener('wheel', onWheel))
</script>

<template>
  <div v-if="fitState.open" ref="rootEl" class="fa" @click.stop>
    <img
      ref="imgEl"
      :src="url"
      class="fa-img"
      :style="{ transform: `translate(${tx}px, ${ty}px) scale(${s})` }"
      alt=""
      draggable="false"
      @load="onImgLoad"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <div class="fa-grid" />

    <header class="fa-top">
      <span class="fa-title serif">调整构图</span>
      <button class="fa-x" @click="finish(false)">✕ 放弃</button>
    </header>
    <p class="fa-hint">双指缩放 · 单指拖动 · 双击复位</p>
    <div class="fa-btns">
      <button class="fa-btn" @click="finish(true, false)">跳过（居中）</button>
      <button class="fa-btn go" @click="finish(true, true)">完成</button>
    </div>
  </div>
</template>

<style scoped>
.fa {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: #2b2823;
  overflow: hidden;
}
.fa-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.fa-img:active {
  cursor: grabbing;
}
.fa-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(to right, transparent 33.3%, rgba(245, 241, 232, 0.16) 33.3%, rgba(245, 241, 232, 0.16) calc(33.3% + 1px), transparent calc(33.3% + 1px)),
    linear-gradient(to right, transparent 66.6%, rgba(245, 241, 232, 0.16) 66.6%, rgba(245, 241, 232, 0.16) calc(66.6% + 1px), transparent calc(66.6% + 1px)),
    linear-gradient(to bottom, transparent 33.3%, rgba(245, 241, 232, 0.16) 33.3%, rgba(245, 241, 232, 0.16) calc(33.3% + 1px), transparent calc(33.3% + 1px)),
    linear-gradient(to bottom, transparent 66.6%, rgba(245, 241, 232, 0.16) 66.6%, rgba(245, 241, 232, 0.16) calc(66.6% + 1px), transparent calc(66.6% + 1px));
}
.fa-top {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
}
.fa-title { font-size: 14px; letter-spacing: 0.18em; color: rgba(245, 241, 232, 0.85); }
.fa-x {
  border: none; background: rgba(245, 241, 232, 0.12); color: #F5F1E8;
  font: inherit; font-size: 12px; letter-spacing: 0.08em;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
}
.fa-hint {
  position: absolute;
  top: calc(52px + env(safe-area-inset-top));
  left: 0; right: 0;
  text-align: center;
  font-size: 11px; letter-spacing: 0.14em;
  color: rgba(245, 241, 232, 0.4);
  pointer-events: none;
}
.fa-btns {
  position: absolute;
  bottom: calc(20px + env(safe-area-inset-bottom));
  left: 0; right: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
}
.fa-btn {
  font: inherit; font-size: 14px; letter-spacing: 0.1em; cursor: pointer;
  padding: 12px 26px; border-radius: 999px; border: none;
  background: rgba(245, 241, 232, 0.14); color: #F5F1E8;
}
.fa-btn:active { filter: brightness(1.15); }
.fa-btn.go { background: #F5F1E8; color: #2B2823; font-weight: 600; }
</style>
