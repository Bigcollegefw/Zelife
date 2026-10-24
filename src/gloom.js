// 状态值规则：-10 ～ 100，越高越好。一天的状态由它着色。
export const STATE_START = 40    // 每天从「尚可」起步
export const LOW_STATE = 25      // < 25（哀 / 坏）：画面起雾，状态回升减半
export const MISSED_DELTA = -8   // 错过一个时刻（顺流而去）的代价

export const clamp = (v) => Math.max(-10, Math.min(100, Math.round(v)))

export const fmtDelta = (d) => (d > 0 ? '+' : '') + d

/** 应用一次状态变化。低状态（<25）下，回升（正变化）效果减半——爬出来需要更多努力。 */
export function applyDelta(state, delta) {
  if (state < LOW_STATE && delta > 0) delta = Math.floor(delta / 2)
  return clamp(state + delta)
}

const TIERS = [
  { max: 0, key: 'bad', label: '坏', color: '#8C5A50', phrase: '今天很沉', note: '这一天被压得很沉。没关系，明早还有一个全新的决定在等你。' },
  { max: 25, key: 'sad', label: '哀', color: '#8A7454', phrase: '有点丧气', note: '丧气不定义这一天。把力气留给下一个决定。' },
  { max: 50, key: 'ok', label: '尚可', color: '#7E8F7C', phrase: '不好也不坏', note: '平常的日子也有它的分量。' },
  { max: 75, key: 'good', label: '好', color: '#4F7D78', phrase: '日子是顺的', note: '这一天在你手上，走得稳稳的。' },
  { max: 101, key: 'great', label: '爽', color: '#3E6B66', phrase: '痛快的一天', note: '光，是你亲手放进这一天里的。' },
]

export function stateTier(v) {
  return TIERS.find((t) => v < t.max)
}
