<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, required: true },
  tier: { type: Object, required: true }, // stateTier() 的返回值
  compact: { type: Boolean, default: false },
  showPhrase: { type: Boolean, default: true },
})

// 五档刻度：坏(-10~0) / 哀(0~25) / 尚可(25~50) / 好(50~75) / 爽(75~100)
const pct = (v) => ((v + 10) / 110) * 100
// 档位色走 CSS 变量（--tier-* 深浅两套在 main.css）：深色底上要提亮一档才不发闷
const tc = computed(() => `var(--tier-${props.tier.key})`)
</script>

<template>
  <span v-if="compact" class="gm-pill" :style="{ '--tc': tc }">
    <i class="gm-dot" />{{ tier.label }} <b class="serif">{{ value }}</b>
  </span>

  <div v-else class="gm">
    <div class="gm-row">
      <span class="gm-label">状态值</span>
      <b class="gm-num serif" :style="{ color: tc }">{{ value }}</b>
    </div>
    <div class="gm-bar">
      <div class="gm-fill" :style="{ width: pct(value) + '%', background: tc }" />
      <i v-for="b in [0, 25, 50, 75]" :key="b" class="gm-mark" :style="{ left: pct(b) + '%' }" />
    </div>
    <div class="gm-scale">
      <span v-for="(t, i) in ['坏', '哀', '尚可', '好', '爽']" :key="t" :style="{ left: [4.5, 20.5, 43.2, 65.9, 88.6][i] + '%' }">
        {{ t }}
      </span>
    </div>
    <p v-if="showPhrase" class="gm-phrase">{{ tier.label }} · {{ tier.phrase }}</p>
  </div>
</template>

<style scoped>
.gm-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--veil);
  border: 1px solid var(--line);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink);
  white-space: nowrap;
}
.gm-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tc); }
.gm-pill b { font-weight: 600; font-size: 13px; margin-left: 2px; font-variant-numeric: tabular-nums; }

.gm-row { display: flex; justify-content: space-between; align-items: baseline; }
.gm-label { font-size: 11px; letter-spacing: 0.35em; color: var(--ink-2); }
.gm-num {
  font-size: 54px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: color 0.6s ease;
}
.gm-bar { position: relative; height: 4px; border-radius: 2px; background: var(--mist); margin-top: 12px; }
.gm-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.7s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.6s ease;
}
.gm-mark { position: absolute; top: -3px; width: 1px; height: 10px; background: var(--ink-3); }
.gm-scale {
  position: relative;
  height: 14px;
  margin-top: 6px;
  font-size: 10px;
  letter-spacing: 0.15em;
  color: var(--ink-3);
}
.gm-scale span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.gm-phrase { margin: 10px 0 0; font-size: 12px; letter-spacing: 0.12em; color: var(--ink-2); }
</style>
