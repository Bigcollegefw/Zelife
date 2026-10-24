<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  tag: { type: String, default: '' },
  speed: { type: Number, default: 36 }, // ms / 字
  variant: { type: String, default: 'box' }, // 'box' 白底对话框 | 'bare' 过场裸文字（居中、不可点）
})
const emit = defineEmits(['done'])

const shown = ref('')
const done = ref(false)
let timer = null

function play() {
  clearInterval(timer)
  shown.value = ''
  done.value = false
  if (!props.text) {
    done.value = true
    emit('done')
    return
  }
  let i = 0
  timer = setInterval(() => {
    i += 1
    shown.value = props.text.slice(0, i)
    if (i >= props.text.length) {
      clearInterval(timer)
      done.value = true
      emit('done')
    }
  }, props.speed)
}

/** 点击对话框：跳过打字，直接看完整句 */
function skip() {
  if (done.value) return
  clearInterval(timer)
  shown.value = props.text
  done.value = true
  emit('done')
}

watch(() => props.text, play, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

defineExpose({ skip, isTyping: () => !done.value })
</script>

<template>
  <div class="dbox" :class="{ bare: variant === 'bare' }" @click.stop="skip">
    <div v-if="tag && variant !== 'bare'" class="dbox-tag">{{ tag }}</div>
    <p class="dbox-text serif">{{ shown }}<i v-if="!done" class="dbox-caret" /></p>
  </div>
</template>

<style scoped>
.dbox {
  position: relative;
  background: rgba(255, 255, 255, 0.88);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  backdrop-filter: blur(14px) saturate(1.05);
  border: 1px solid rgba(51, 48, 43, 0.12);
  border-radius: 8px;
  padding: 14px 18px 16px;
  min-height: 108px;
  box-shadow: 0 10px 30px rgba(60, 50, 30, 0.1);
  cursor: pointer;
}
.dbox-tag {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--ink-2);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.dbox-tag::after { content: ''; height: 1px; flex: 1; background: var(--line); }
.dbox-text {
  margin: 0;
  font-size: 16px;
  line-height: 1.95;
  letter-spacing: 0.03em;
  color: var(--ink);
  min-height: 62px;
}
.dbox-caret {
  display: inline-block;
  width: 1px;
  height: 15px;
  background: var(--ink);
  margin-left: 2px;
  vertical-align: -2px;
  animation: dbox-blink 1s steps(1) infinite;
}
@keyframes dbox-blink { 50% { opacity: 0; } }

/* 过场裸文字：无卡片，居中白字（点击推进由外层舞台接管） */
.dbox.bare {
  background: none;
  border: none;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  padding: 0;
  min-height: 0;
  pointer-events: none;
}
.dbox.bare .dbox-text {
  color: #F5F1E8;
  text-align: center;
  font-size: 17px;
  letter-spacing: 0.06em;
  line-height: 2.1;
  min-height: 0;
  text-shadow: 0 1px 14px rgba(0, 0, 0, 0.4);
}
.dbox.bare .dbox-caret { background: #F5F1E8; }
</style>
