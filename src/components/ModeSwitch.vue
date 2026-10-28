<script setup>
/* 演示/真实切换（主页与抽屉共用）。已开始今天时切换＝确认后清空重开：
   真实模式重开后按当前时间快进（已过时刻顺流），演示模式从第一刻重演。
   重开后的去向由父级定：抽屉听 restarted 回舞台，主页原地（按钮变回「开始今天」）。 */
import { useGame } from '../store.js'
import { confirmBox } from '../confirm.js'

const emit = defineEmits(['restarted'])
const { state, setMode, reset } = useGame()

async function pick(mode) {
  if (state.mode === mode) return
  if (!state.started) {
    setMode(mode)
    return
  }
  const body =
    mode === 'real'
      ? '会重新开始今天：已经过点的时刻将顺流而去，从当前时刻继续。当前进度清空。'
      : '会从头开始今天，逐个时刻重演。当前进度清空。'
  if (!(await confirmBox(mode === 'real' ? '切换到真实模式？' : '切换到演示模式？', { body }))) return
  reset()
  setMode(mode)
  emit('restarted')
}
</script>

<template>
  <div class="mode-switch" role="radiogroup" aria-label="时间模式">
    <button :class="{ on: state.mode === 'manual' }" @click="pick('manual')">演示</button>
    <button :class="{ on: state.mode === 'real' }" @click="pick('real')">真实</button>
  </div>
</template>

<style scoped>
.mode-switch {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  background: var(--paper);
  flex: none;
}
.mode-switch button {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.1em;
  padding: 5px 14px;
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.mode-switch button.on { background: var(--ink); color: var(--on-ink); }
</style>
