<script setup>
/* 外观三态：跟随系统 / 纸面（浅）/ 暖夜（深）。存本机、立即生效，与进度无关。
   样式与 ModeSwitch 同构（分段胶囊），主题逻辑在 theme.js。 */
import { themeState, setTheme } from '../theme.js'

const opts = [
  { v: 'auto', label: '跟随系统' },
  { v: 'light', label: '纸面' },
  { v: 'dark', label: '暖夜' },
]
</script>

<template>
  <div class="theme-switch" role="radiogroup" aria-label="外观">
    <button
      v-for="o in opts"
      :key="o.v"
      :class="{ on: themeState.setting === o.v }"
      @click="setTheme(o.v)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  background: var(--mist);
  flex: none;
}
.theme-switch button {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  padding: 5px 12px;
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}
.theme-switch button.on { background: var(--ink); color: var(--on-ink); }
</style>
