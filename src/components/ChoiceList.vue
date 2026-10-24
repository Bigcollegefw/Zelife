<script setup>
defineProps({
  choices: { type: Array, required: true }, // [{ text, delta, feedback }]
  chosen: { type: Number, default: -1 }, // 回看：当天实际选中的选项（-1 = 无）
  readonly: { type: Boolean, default: false }, // 回看模式：不可点，只高亮当时的选择
})
const emit = defineEmits(['choose'])
</script>

<template>
  <div class="choices">
    <button
      v-for="(c, i) in choices"
      :key="i"
      class="choice serif"
      :class="{ picked: readonly && i === chosen, dim: readonly && chosen >= 0 && i !== chosen }"
      :disabled="readonly"
      @click="!readonly && emit('choose', i)"
    >
      {{ c.text }}
    </button>
  </div>
</template>

<style scoped>
.choices { display: flex; flex-direction: column; gap: 12px; }
.choice {
  font-family: var(--serif);
  font-size: 16px;
  letter-spacing: 0.08em;
  color: var(--ink);
  text-align: center;
  padding: 15px 18px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.86);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(51, 48, 43, 0.16);
  border-radius: 4px;
  box-shadow: 0 6px 20px rgba(60, 50, 30, 0.1);
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, transform 0.1s ease;
}
.choice:not(:disabled):hover,
.choice:not(:disabled):focus-visible {
  background: var(--ink);
  color: #FBFAF7;
  border-color: var(--ink);
  outline: none;
}
.choice:active { transform: scale(0.985); }
/* 回看：当时选中的高亮，其余退后 */
.choice:disabled { cursor: default; }
.choice.picked { background: var(--ink); color: #FBFAF7; border-color: var(--ink); }
.choice.dim { opacity: 0.4; }
</style>
