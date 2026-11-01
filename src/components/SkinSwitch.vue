<script setup>
/* 皮肤两态：蜡笔杂货（默认）/ 经典。存本机、立即生效，与进度无关。
   样式与 ThemeSwitch 同构（分段胶囊），皮肤逻辑在 skin.js。 */
import { skinState, setSkin } from '../skin.js'

const opts = [
  { v: 'crayon', label: '蜡笔杂货' },
  { v: 'classic', label: '经典' },
]
</script>

<template>
  <div class="skin-switch" role="radiogroup" aria-label="皮肤">
    <button
      v-for="o in opts"
      :key="o.v"
      :class="{ on: skinState.skin === o.v }"
      @click="setSkin(o.v)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.skin-switch {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  background: var(--mist);
  flex: none;
}
.skin-switch button {
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
.skin-switch button.on { background: var(--ink); color: var(--on-ink); }
</style>
