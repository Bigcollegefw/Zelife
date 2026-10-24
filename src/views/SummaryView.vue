<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { fmtDelta } from '../gloom.js'
import GloomMeter from '../components/GloomMeter.vue'

const router = useRouter()
const { state, activePreset, frontier, finished, tier, setMode } = useGame()

const dateLabel = computed(() => {
  const d = state.date ? new Date(state.date) : new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${wd}`
})

/** 时间轴 = 今天实际走过的路径（快照），加上当前前沿 */
const walked = computed(() =>
  state.log.map((e) => ({
    key: e.sceneId,
    time: e.snap?.time ?? '',
    title: e.snap?.title ?? '',
    text: e.missed ? null : e.snap?.choiceText ?? '……',
    delta: e.delta,
    missed: e.missed,
  })),
)

const deltaClass = (d) => (d > 0 ? 'good' : d < 0 ? 'bad' : 'zero')
</script>

<template>
  <div class="summary">
    <header class="s-head">
      <button class="btn ghost back" @click="router.push('/stage')">‹ 回到此刻</button>
      <div class="mode-switch" role="radiogroup" aria-label="时间模式">
        <button :class="{ on: state.mode === 'manual' }" @click="setMode('manual')">演示</button>
        <button :class="{ on: state.mode === 'real' }" @click="setMode('real')">真实</button>
      </div>
    </header>

    <div class="s-kicker">汇总 · {{ activePreset.name }}预设</div>
    <h1 class="s-date serif">{{ dateLabel }}</h1>

    <section class="card hero">
      <GloomMeter :value="state.gloom" :tier="tier" />
    </section>

    <section class="tl">
      <article v-for="w in walked" :key="w.key" class="tl-item" :class="w.missed ? 'missed' : 'done'">
        <div class="tl-time">{{ w.time }}</div>
        <div class="tl-node"><span class="tl-dot" /></div>
        <div class="tl-main">
          <div class="tl-title serif">{{ w.title }}</div>
          <div class="tl-status">
            <template v-if="w.missed">顺流而去 · 状态 {{ fmtDelta(w.delta) }}</template>
            <template v-else>
              已选「{{ w.text }}」
              <b class="delta" :class="deltaClass(w.delta)">{{ fmtDelta(w.delta) }}</b>
            </template>
          </div>
        </div>
        <div class="tl-act">{{ w.missed ? '·' : '✓' }}</div>
      </article>

      <article v-if="frontier" class="tl-item current">
        <div class="tl-time">{{ frontier.time }}</div>
        <div class="tl-node"><span class="tl-dot" /></div>
        <div class="tl-main">
          <div class="tl-title serif">{{ frontier.title }}</div>
          <div class="tl-status">现在轮到你</div>
        </div>
        <div class="tl-act">现在</div>
      </article>
    </section>

    <p class="s-note">真实模式：直接跳到当前时间；处于分流中时，从最近的合流节点补选择</p>

    <footer class="s-foot">
      <button v-if="finished" class="btn primary big" @click="router.push('/report')">
        查看今日总结
      </button>
      <button v-else class="btn primary big" @click="router.push('/stage')">回到此刻</button>
      <button class="btn ghost big" @click="router.push('/editor')">编辑剧本</button>
    </footer>
  </div>
</template>

<style scoped>
.summary {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 18px 18px 26px;
}
.s-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.s-head .back { padding: 7px 14px; font-size: 13px; }

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
.mode-switch button.on { background: var(--ink); color: #FBFAF7; }

.s-kicker { margin-top: 20px; font-size: 11px; letter-spacing: 0.4em; color: var(--ink-2); }
.s-date { font-size: 22px; letter-spacing: 0.06em; margin: 8px 0 16px; font-weight: 600; }

.hero { margin-bottom: 6px; }

.tl { list-style: none; margin: 8px 0 0; padding: 0; }

.tl-item {
  display: grid;
  grid-template-columns: 50px 18px 1fr auto;
  gap: 0 10px;
  padding: 13px 0;
  align-items: start;
}
.tl-item.current .tl-title { transition: transform 0.16s ease; }

.tl-time {
  font-size: 13px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  padding-top: 3px;
}
.tl-node { position: relative; display: flex; justify-content: center; }
.tl-node::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.tl-item:first-child .tl-node::before { top: 8px; }
.tl-item:last-child .tl-node::before { bottom: auto; height: 8px; }
.tl-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bg);
  border: 1.5px solid var(--ink-3);
  margin-top: 5px;
}
.tl-item.done .tl-dot { background: var(--good); border-color: var(--good); }
.tl-item.missed .tl-dot { background: var(--bad); border-color: var(--bad); }
.tl-item.current .tl-dot {
  border-color: var(--ink);
  animation: tl-pulse 2.4s ease infinite;
}
@keyframes tl-pulse {
  0% { box-shadow: 0 0 0 0 rgba(51, 48, 43, 0.18); }
  70% { box-shadow: 0 0 0 7px rgba(51, 48, 43, 0); }
  100% { box-shadow: 0 0 0 0 rgba(51, 48, 43, 0); }
}

.tl-title { font-size: 15px; letter-spacing: 0.04em; }
.tl-status { font-size: 12px; color: var(--ink-2); margin-top: 3px; letter-spacing: 0.02em; }
.tl-act {
  font-size: 12px;
  color: var(--ink);
  align-self: center;
  letter-spacing: 0.08em;
}

.s-note {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.05em;
}
.s-foot { margin-top: auto; padding-top: 20px; display: flex; flex-direction: column; gap: 10px; }
</style>
