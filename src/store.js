import { computed, reactive, ref } from 'vue'
import { BUILTIN_PRESETS } from './data/presets.js'
import { STATE_START, MISSED_DELTA, applyDelta, clamp, stateTier } from './gloom.js'

const RUN_KEY = 'galplan-demo-v1'
const PRESETS_KEY = 'galplan-presets-v1'

/* ---------- 工具 ---------- */

export const persistError = ref(false) // localStorage 写满（多半是照片太多）

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm ?? '0:0').split(':').map(Number)
  return h * 60 + m
}

/** 基调按时刻自动定（编辑卡已去掉手选下拉）：晨光 5-10 点 / 午后 11-16 点 / 暮色 17-19 点 / 夜色 20-4 点 */
export function bgKeyOf(scene) {
  if (!scene?.time) return 'dawn'
  const h = Math.floor(toMinutes(scene.time) / 60)
  if (h >= 20 || h < 5) return 'night'
  if (h < 11) return 'dawn'
  if (h < 17) return 'noon'
  return 'dusk'
}

export function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 存档损坏则当作没有 */
  }
  return null
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    persistError.value = false
  } catch {
    persistError.value = true
  }
}

/* ---------- 预设（剧本库：有向图，含照片，持久化） ----------
   preset = { id, name, start, nodes: { id → node } }
   node(moment) = { id, time, title, bgKey, narration, photo, intros[],
                    choices: [{ text, delta, feedback, reflect, effect, to }] }
   choices[].to 指向下一个节点；to = null 表示走到终点（夜记）。
   线性剧本 = 每个选项都指向同一下一节点的退化图。                 */

const savedPresets = loadJson(PRESETS_KEY)
// 情绪极性迁移（v1 阴霾：越高越糟 → v2 状态值：越高越好）：所有 delta 取反，只做一次
if (savedPresets && !savedPresets.moodV2) {
  for (const p of savedPresets.list ?? []) {
    for (const n of Object.values(p.nodes ?? {})) {
      for (const c of n.choices ?? []) if (typeof c.delta === 'number') c.delta = -c.delta
    }
  }
  savedPresets.moodV2 = true
}
const presets = reactive(
  savedPresets ?? {
    activeId: BUILTIN_PRESETS[0].id,
    list: JSON.parse(JSON.stringify(BUILTIN_PRESETS)),
    moodV2: true,
  },
)

// 迁移与规范化：v1 线性 scenes[] → v2 图 nodes{}；补齐 intros / choice.effect
for (const p of presets.list) {
  if (!p.nodes || !p.start) {
    const scenes = [...(p.scenes ?? [])].sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    p.nodes = {}
    scenes.forEach((s, i) => {
      p.nodes[s.id] = s
      const next = scenes[i + 1]?.id ?? null
      for (const c of s.choices ?? []) c.to = next
    })
    p.start = scenes[0]?.id ?? null
    delete p.scenes
  }
  for (const s of Object.values(p.nodes)) {
    if (!Array.isArray(s.intros)) {
      const old = s.intro
      s.intros = old && (old.text?.trim() || old.photo) ? [{ text: old.text ?? '', photo: old.photo ?? null }] : []
      delete s.intro
    }
    for (const c of s.choices ?? []) {
      if (!c.effect || typeof c.effect !== 'object') c.effect = { text: '', photo: null }
    }
  }
}

const activePreset = computed(
  () => presets.list.find((p) => p.id === presets.activeId) ?? presets.list[0],
)
const allNodes = computed(() => Object.values(activePreset.value.nodes))
const nodesOf = computed(() => activePreset.value.nodes)

/** 入度表：用于识别合流节点 */
const inDegree = computed(() => {
  const m = {}
  for (const n of allNodes.value) {
    for (const c of n.choices ?? []) {
      if (c.to) m[c.to] = (m[c.to] ?? 0) + 1
    }
  }
  return m
})

export function persistPresets() {
  saveJson(PRESETS_KEY, { activeId: presets.activeId, list: presets.list, moodV2: true })
}

function patchScene(presetId, nodeId, patch) {
  const p = presets.list.find((x) => x.id === presetId)
  const node = p?.nodes[nodeId]
  if (!node) return
  Object.assign(node, patch)
  persistPresets()
}

/** 新建节点（可带模板字段），返回 id */
function addNode(presetId, template = {}) {
  const p = presets.list.find((x) => x.id === presetId)
  if (!p) return null
  const id = template.id || uid('evt')
  p.nodes[id] = {
    kind: 'moment',
    time: '12:00',
    title: '新的时刻',
    bgKey: 'noon',
    narration: '这里是旁白：写下这个时刻的场景，和你面对的处境。',
    photo: null,
    intros: [],
    choices: [
      { text: '那个更值得的选项', delta: 10, feedback: '选择之后，好像有什么亮了一点。', reflect: '你选了更难、但更对的那条路。', effect: { text: '', photo: null }, to: null },
      { text: '那个更容易的选项', delta: -10, feedback: '很容易——也太容易了。', reflect: '省力的选择，代价总是迟到，但从不缺席。', effect: { text: '', photo: null }, to: null },
    ],
    ...template,
    id,
  }
  p.nodes[id].bgKey = bgKeyOf(p.nodes[id]) // 基调跟着时刻走（不再手选）
  persistPresets()
  return id
}

/** 删除节点：指向它的边改接它的默认后继，避免断链 */
function removeNode(presetId, nodeId) {
  const p = presets.list.find((x) => x.id === presetId)
  const node = p?.nodes[nodeId]
  if (!p || !node) return
  const fallback = node.choices?.[0]?.to ?? null
  for (const n of Object.values(p.nodes)) {
    for (const c of n.choices ?? []) {
      if (c.to === nodeId) c.to = fallback
    }
  }
  delete p.nodes[nodeId]
  if (p.start === nodeId) {
    p.start = fallback ?? Object.keys(p.nodes)[0] ?? null
  }
  persistPresets()
}

/** 在默认路径末端接一个新时刻（编辑器「＋ 新增时刻」） */
function appendMoment(presetId) {
  const p = presets.list.find((x) => x.id === presetId)
  if (!p) return
  const id = addNode(presetId)
  const last = pathOfPreset(p, p.start).at(-1)
  if (last) {
    for (const c of last.choices ?? []) {
      if (c.to === null) c.to = id
    }
  } else {
    p.start = id
  }
  persistPresets()
}

function pathOfPreset(p, fromId) {
  const out = []
  const seen = new Set()
  let cur = fromId
  while (cur && p.nodes[cur] && !seen.has(cur)) {
    seen.add(cur)
    out.push(p.nodes[cur])
    cur = p.nodes[cur].choices?.[0]?.to ?? null
  }
  return out
}

const defaultPath = (fromId) => pathOfPreset(activePreset.value, fromId)
const isMerge = (id) => (inDegree.value[id] ?? 0) >= 2

/** 复制某个预设新建（「上班 → 周末」就是复制后改） */
function createPreset(name, fromPresetId) {
  const src = presets.list.find((x) => x.id === fromPresetId)
  const nodes = {}
  for (const [id, n] of Object.entries(src?.nodes ?? {})) {
    nodes[id] = {
      ...n,
      intros: (n.intros ?? []).map((it) => ({ ...it })),
      choices: (n.choices ?? []).map((c) => ({ ...c, effect: { ...c.effect } })),
    }
  }
  const p = { id: uid('pre'), name, start: src?.start ?? null, nodes }
  presets.list.push(p)
  persistPresets()
  return p
}

function removePreset(presetId) {
  if (presets.list.length <= 1) return false
  const i = presets.list.findIndex((x) => x.id === presetId)
  if (i < 0) return false
  presets.list.splice(i, 1)
  if (presets.activeId === presetId) presets.activeId = presets.list[0].id
  persistPresets()
  return true
}

/** 切换预设 = 换一种生活模板，从新的一天开始 */
function setActivePreset(id) {
  if (id === presets.activeId) return
  presets.activeId = id
  persistPresets()
  resetRun()
}

/* ---------- 单局状态 ---------- */

const savedRun = loadJson(RUN_KEY)
// 情绪极性迁移：旧阴霾值 0-100（越高越糟）→ 状态值 -10-100（越高越好），只做一次
if (savedRun && !savedRun.moodV2) {
  savedRun.gloom = 90 - (savedRun.gloom ?? 20)
  for (const e of savedRun.log ?? []) if (typeof e.delta === 'number') e.delta = -e.delta
  savedRun.moodV2 = true
}

const state = reactive({
  started: savedRun?.started ?? false,
  mode: savedRun?.mode ?? 'manual', // 'manual' 演示推进 | 'real' 真实时间
  gloom: savedRun?.gloom ?? STATE_START,
  date: savedRun?.date ?? null,
  // { sceneId, choiceIndex, delta, missed, snap: { time, title, choiceText, reflect } }
  log: savedRun?.log ?? [],
  moodV2: true,
})

function persistRun() {
  saveJson(RUN_KEY, {
    started: state.started,
    mode: state.mode,
    gloom: state.gloom,
    date: state.date,
    log: state.log,
    moodV2: true,
  })
}

const loggedIds = computed(() => new Set(state.log.map((e) => e.sceneId)))

/** 错过 = 顺流而下：走向状态掉得最狠的那个选项 */
function driftNext(node) {
  const drift = [...(node.choices ?? [])].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0]
  return drift?.to ?? null
}

/** 前沿：从起点沿已做选择走到当前待决节点；null = 今天已走完 */
function frontierOf() {
  let cur = activePreset.value.start
  const seen = new Set()
  while (cur && nodesOf.value[cur]) {
    if (seen.has(cur)) return null // 环保护
    seen.add(cur)
    const entry = state.log.find((e) => e.sceneId === cur)
    if (!entry) return nodesOf.value[cur]
    const node = nodesOf.value[cur]
    const next = entry.missed
      ? driftNext(node)
      : node.choices?.[entry.choiceIndex]?.to ?? null
    cur = next
  }
  return null
}

const frontier = computed(frontierOf)
const finished = computed(() => state.log.length > 0 && !frontier.value)
const tier = computed(() => stateTier(state.gloom))

/** 做选择时给历史留一份文案快照：之后改剧本，不会污染已生成的夜记 */
function snapOf(scene, choice) {
  return {
    time: scene.time,
    title: scene.title,
    choiceText: choice?.text ?? '',
    reflect: choice?.reflect || choice?.feedback || '',
  }
}

/** 某时刻现在能否进入 */
function isEnterable(node, now = nowMinutes()) {
  if (loggedIds.value.has(node.id)) return false
  if (state.mode === 'manual') return frontier.value?.id === node.id
  return now >= toMinutes(node.time)
}

/**
 * 真实模式 / 跨天追赶：
 * 直接跳到当前时间节点；若途中处于分流之中，则回退到最近一个确定的合流节点，
 * 从那里开始由玩家补选择到当前时间。合流之前的时刻顺流而去（错过，状态 -8）。
 */
function catchUp() {
  const res = { missed: 0 }
  if (state.mode !== 'real') return res
  const now = nowMinutes()
  // 沿默认走向收集已到点的时刻，直到未到点 / 终点
  const chain = []
  const seen = new Set()
  let cur = frontierOf()?.id ?? null
  while (cur && nodesOf.value[cur] && !seen.has(cur)) {
    seen.add(cur)
    const n = nodesOf.value[cur]
    if (toMinutes(n.time) > now) break
    chain.push(n)
    cur = n.choices?.[0]?.to ?? null
  }
  // 锚点：链上最后一个合流节点；没有合流则直接跳到当前时间节点
  let anchor = -1
  chain.forEach((n, i) => {
    if (isMerge(n.id)) anchor = i
  })
  const cut = anchor >= 0 ? anchor : Math.max(0, chain.length - 1)
  for (let i = 0; i < cut; i++) {
    const n = chain[i]
    state.gloom = clamp(state.gloom + MISSED_DELTA)
    state.log.push({
      sceneId: n.id,
      choiceIndex: -1,
      delta: MISSED_DELTA,
      missed: true,
      snap: { time: n.time, title: n.title },
    })
    res.missed += 1
  }
  if (res.missed) persistRun()
  return res
}

/** 在某场景做出选择，返回实际生效的状态变化 */
function choose(scene, choiceIndex) {
  const choice = scene.choices[choiceIndex]
  const before = state.gloom
  state.gloom = applyDelta(state.gloom, choice.delta)
  const applied = state.gloom - before
  state.log.push({
    sceneId: scene.id,
    choiceIndex,
    delta: applied,
    missed: false,
    snap: snapOf(scene, choice),
  })
  persistRun()
  return applied
}

function startDay() {
  if (!state.started) {
    state.started = true
    state.date = new Date().toISOString()
    persistRun()
  }
}

function resetRun() {
  state.started = false
  state.gloom = STATE_START
  state.date = null
  state.log = []
  persistRun()
}

function setMode(mode) {
  state.mode = mode
  persistRun()
}

export function useGame() {
  return {
    // 运行状态
    state, frontier, finished, tier,
    isEnterable, catchUp, choose, startDay, reset: resetRun, setMode,
    // 剧本库（图）
    presets, activePreset, allNodes, nodesOf, defaultPath, isMerge,
    persistError, persistPresets,
    patchScene, addNode, removeNode, appendMoment, createPreset, removePreset, setActivePreset,
  }
}
