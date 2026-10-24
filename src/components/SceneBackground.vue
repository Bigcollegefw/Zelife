<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isMedia, mediaUrl } from '../media.js'

/* 统一背景：dataURL 字符串 / 媒体描述符 / 空（回落到基调渐变）。
   replay 变化 → 视频从头播放（场景切换）；定格结尾 = 播完停在最后一帧 */
const props = defineProps({
  media: { type: [String, Object], default: '' },
  bgKey: { type: String, default: 'dawn' },
  replay: { type: String, default: '' },
})

const kind = ref('')
const url = ref('')
const poster = ref('')
const loop = ref(false)
const vidEl = ref(null)
const imgEl = ref(null)
const natW = ref(0)
const natH = ref(0)
const sizeTick = ref(0) // 屏幕尺寸变化时重算构图

// 定格 ⇄ 循环切换：若已停在最后一帧，切到循环后接着播
watch(loop, (v) => {
  if (v && vidEl.value?.ended) vidEl.value.play?.().catch(() => {})
})

watch(
  () => [props.media, props.replay],
  async () => {
    const m = props.media
    if (isMedia(m)) {
      kind.value = m.kind
      loop.value = m.kind === 'video' ? !!m.loop : false
      poster.value = m.poster ?? ''
      url.value = (await mediaUrl(m.id)) ?? ''
    } else if (typeof m === 'string' && m) {
      kind.value = 'photo'
      url.value = m
      poster.value = ''
    } else {
      kind.value = ''
      url.value = ''
    }
  },
  { immediate: true },
)

const onResize = () => (sizeTick.value += 1)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

/** 构图：fit={s,x,y}（归一化）按当前屏幕换算成像素平移，跨设备分辨率无关 */
const fitStyle = computed(() => {
  void sizeTick.value
  const f = isMedia(props.media) ? props.media.fit : null
  if (kind.value !== 'photo' || !f || !natW.value) return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const k = Math.max(vw / natW.value, vh / natH.value)
  const tx = f.x * ((natW.value * k * f.s - vw) / 2)
  const ty = f.y * ((natH.value * k * f.s - vh) / 2)
  return { transform: `translate(${tx}px, ${ty}px) scale(${f.s})` }
})

function onImgLoad() {
  natW.value = imgEl.value?.naturalWidth || 0
  natH.value = imgEl.value?.naturalHeight || 0
}
</script>

<template>
  <div class="sb" :class="`bg-${bgKey}`">
    <img
      v-if="kind === 'photo' && url"
      ref="imgEl"
      :key="url"
      class="sb-img"
      :src="url"
      :style="fitStyle"
      alt=""
      @load="onImgLoad"
    />
    <video
      v-else-if="kind === 'video' && url"
      ref="vidEl"
      :key="replay + url"
      class="sb-img"
      :src="url"
      muted
      playsinline
      autoplay
      :loop="loop"
      :poster="poster || undefined"
    />
  </div>
</template>

<style scoped>
.sb { position: absolute; inset: 0; background-size: cover; background-position: center; }
.sb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

.bg-dawn {
  background-image:
    radial-gradient(90% 60% at 70% 8%, #FFF6E0 0%, rgba(255, 246, 224, 0) 60%),
    linear-gradient(180deg, #F4E9DA 0%, #EFE2CF 55%, #E6D7C1 100%);
}
.bg-street {
  background-image:
    radial-gradient(70% 45% at 25% 15%, #F3FAF7 0%, rgba(243, 250, 247, 0) 65%),
    linear-gradient(180deg, #E4EEEC 0%, #EFE9DC 60%, #E8DFC9 100%);
}
.bg-noon {
  background-image:
    linear-gradient(115deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0) 35%),
    linear-gradient(180deg, #F5F1E4 0%, #EFE8D4 60%, #E9DFC6 100%);
}
.bg-dusk {
  background-image:
    radial-gradient(80% 50% at 50% 88%, #F7DFB8 0%, rgba(247, 223, 184, 0) 62%),
    linear-gradient(180deg, #E9E2E2 0%, #E3D3C4 55%, #D3BFA9 100%);
}
.bg-night {
  background-image:
    radial-gradient(60% 34% at 78% 12%, rgba(246, 238, 214, 0.5) 0%, rgba(246, 238, 214, 0) 70%),
    linear-gradient(180deg, #4A5060 0%, #3A3F4C 60%, #2C303A 100%);
}
</style>
