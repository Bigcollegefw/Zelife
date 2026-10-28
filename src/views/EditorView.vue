<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGame, toMinutes, persistError } from '../store.js'
import EventCard from '../components/EventCard.vue'
import { confirmBox } from '../confirm.js'

const router = useRouter()
const {
  state, presets, activePreset, allNodes, nodesOf, isMerge,
  setActivePreset, createPreset, removePreset, reset,
  removeNode, addNode, persistPresets, guest,
} = useGame()

/* 访客只读模式（M2 分享）：可进可看，拖拽/连线/增删/编辑全禁 */
const roMode = computed(() => guest.on)

/* 返回键：访客回作品落地页；本人回舞台（还没开始则回首页） */
function backOut() {
  if (guest.on && guest.work) router.push('/w/' + guest.work.code)
  else router.push(state.started ? '/stage' : '/intro')
}

/* ══════════ 预设（画布头部） ══════════ */
async function switchPreset(id) {
  if (id === presets.activeId) return
  if (state.started && state.log.length && !(await confirmBox('切换预设会开始新的一天，当前进度将清空。'))) return
  setActivePreset(id)
}

const creating = ref(false)
const newName = ref('')
function createFromCurrent() {
  const name = newName.value.trim()
  if (!name) return
  createPreset(name, presets.activeId)
  newName.value = ''
  creating.value = false
}

async function delPreset() {
  if (presets.list.length <= 1) return
  if (!(await confirmBox(`删除预设「${activePreset.value.name}」？`, { body: '其中的节点和照片将一并删除。', danger: true }))) return
  if (removePreset(presets.activeId)) reset()
}

/* ══════════ 展开状态（持久保存编辑时的完整样子） ══════════ */
const EXPANDED_KEY = 'galplan-expanded-v1'
function loadExpandedMap() {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY)) ?? {}
  } catch {
    return {}
  }
}
const expandedMap = loadExpandedMap()
const expandedIds = ref(new Set(expandedMap[activePreset.value.id] ?? []))
function persistExpanded() {
  if (roMode.value) return // 访客：展开态不落盘
  expandedMap[activePreset.value.id] = [...expandedIds.value]
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expandedMap))
  } catch {
    /* 存满则放弃持久化展开态 */
  }
}
function isExpanded(n) {
  return expandedIds.value.has(n.id)
}

watch(
  () => presets.activeId,
  () => {
    expandedIds.value = new Set(expandedMap[activePreset.value.id] ?? [])
    focusId.value = null
    focusOn.value = false
    detachDragListeners()
    drag.value = null
    dropSheet.value = null
    edgeSheet.value = null
    // 新旧预设节点 id 不同：渲染前先用默认高度摆好位置，
    // 否则新节点查不到坐标会闪到画布左上角，再飞回来
    if (svgEl.value) svgEl.value.style.opacity = '0.05'
    relayout()
    nextTick(() => {
      relayout() // 挂载后按真实高度修正
      drawEdges()
      if (svgEl.value) svgEl.value.style.opacity = ''
      if (wrapEl.value) wrapEl.value.scrollTop = 0 // 换了预设，画布从顶部开始
      centerCanvas()
      revealCanvas()
    })
  },
)

/* ══════════ 画布布局：对称，无支线概念 ══════════ */
const CANVAS_W = 460
const CARD_W = 176
const WIDE_W = 208
const GAP = 24
const ROW_GAP = 76

/* ---------- 手动排序（拖拽交换位置，按预设记住） ---------- */
const ORDER_KEY = 'galplan-nodeorder-v1'
function loadOrderMap() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY)) ?? {}
  } catch {
    return {}
  }
}
const orderMap = reactive(loadOrderMap()) // { presetId → { nodeId → 排序键 } }
function orderKey(n) {
  const m = orderMap[presets.activeId]
  return m?.[n.id] != null ? m[n.id] : toMinutes(n.time)
}
function persistOrder() {
  if (roMode.value) return // 访客：排序不落盘
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orderMap))
  } catch {
    /* 存满则放弃 */
  }
}

const nodeEls = {}
let ro = null // 卡片高度变化（文本自动增高）→ 画布实时重排
let roTimer = null
let animatingExpand = false // 展开/收起动画期间不触发重排，避免互相打架
const setNodeEl = (id, el) => {
  if (el) {
    nodeEls[id] = el
    ro?.observe(el)
  } else {
    const old = nodeEls[id]
    if (old) ro?.unobserve(old)
    delete nodeEls[id]
  }
}
const layout = reactive({ pos: {}, height: 400, addY: 452 })
const canvasW = ref(460) // 画布宽：随最宽的行撑开（多分支不再被裁掉）
const svgEl = ref(null)
const wrapEl = ref(null)
const zoomerEl = ref(null)

/** 行 = 时刻：同一时刻的备选并排（可互换），行按时间升序；箭头只能指向更晚的行 */
const rows = computed(() => {
  const groups = new Map()
  for (const n of allNodes.value) {
    const t = toMinutes(n.time)
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t).push(n)
  }
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((k) => groups.get(k).sort((x, y) => orderKey(x) - orderKey(y) || (x.id < y.id ? -1 : 1)))
})

const rowsIdx = computed(() => {
  const m = {}
  rows.value.forEach((row, ri) => row.forEach((n, ci) => (m[n.id] = { r: ri, c: ci })))
  return m
})

function relayout() {
  const pos = {}
  let y = 24
  let wMax = CANVAS_W
  // 第一遍：每行卡宽（多分支时收窄以尽量塞进画布）与所需画布宽
  const plans = rows.value.map((row) => {
    const cw =
      row.length <= 1
        ? CARD_W
        : Math.max(112, Math.floor((CANVAS_W - (row.length - 1) * GAP - 16) / row.length))
    const ws = row.map((n) => (isExpanded(n) ? WIDE_W : cw))
    const total = ws.reduce((s, w) => s + w, 0) + (ws.length - 1) * GAP
    wMax = Math.max(wMax, total + 28)
    return { row, ws, total }
  })
  canvasW.value = wMax
  // 第二遍：行内绕中轴对称落位
  for (const { row, ws, total } of plans) {
    let x = (canvasW.value - total) / 2
    let maxH = 0
    row.forEach((n, i) => {
      const h = nodeEls[n.id]?.offsetHeight ?? (isExpanded(n) ? 230 : 92)
      pos[n.id] = { x: Math.round(x), y, w: ws[i] }
      x += ws[i] + GAP
      if (h > maxH) maxH = h
    })
    y += maxH + ROW_GAP
  }
  layout.pos = pos
  layout.height = y - ROW_GAP + 44
  layout.addY = layout.height + 8 // 「＋ 新增节点」虚线卡的槽位
}

/* 画布比视口宽时停在正中（布局左右对称，起始视角应当居中） */
function centerCanvas() {
  const w = wrapEl.value
  if (!w) return
  w.scrollLeft = Math.max(0, Math.round((canvasW.value - w.clientWidth) / 2))
}
watch(canvasW, () => nextTick(centerCanvas)) // 变宽后回到正中

/* 首次布局遮罩 + 稳定门控：挂载前先用默认高度占位（卡片带正确宽度挂载，
   自动增高一次量准）；淡入前连续两帧 relayout 几何一致才算稳定，超时兜底 */
const canvasReady = ref(false)
let revealSig = ''
let revealTries = 0
function revealCanvas() {
  revealSig = ''
  revealTries = 0
  const tick = () => {
    relayout()
    const sig = JSON.stringify(layout.pos)
    if (sig === revealSig || ++revealTries > 6) {
      drawEdges()
      centerCanvas()
      canvasReady.value = true
      return
    }
    revealSig = sig
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
// 渲染前先按默认高度摆位：让卡片（尤其展开卡）带最终宽度挂载，高度一步到位
relayout()

/* 连线淡出重画（结构/位置变化后的统一过渡） */
function refreshEdges() {
  if (svgEl.value) svgEl.value.style.opacity = '0.05'
  clearTimeout(smoothTimer)
  smoothTimer = setTimeout(() => {
    drawEdges()
    if (svgEl.value) svgEl.value.style.opacity = ''
  }, 380)
}

/* ---------- 交换位置：记录手动排序键，两卡回弹 ---------- */
function swapNodes(a, b) {
  const ka = orderKey(a)
  const kb = orderKey(b)
  const m = (orderMap[presets.activeId] ??= {})
  if (ka === kb) {
    // 键相同（如两卡同时刻）：按当前列位决定谁前谁后，保证真的换过去
    const ca = rowsIdx.value[a.id]?.c ?? 0
    const cb = rowsIdx.value[b.id]?.c ?? 0
    const [front, back] = ca <= cb ? [b, a] : [a, b]
    m[front.id] = ka - 0.5
    m[back.id] = ka + 0.5
  } else {
    m[a.id] = kb + (kb > ka ? 0.5 : -0.5)
    m[b.id] = ka + (ka > kb ? 0.5 : -0.5)
  }
  persistOrder()
  relayout()
  refreshEdges()
}

function popCards(ids) {
  ids.forEach((id) => {
    const el = nodeEls[id]
    if (!el) return
    el.classList.remove('pop')
    void el.offsetWidth
    el.classList.add('pop')
    setTimeout(() => el.classList.remove('pop'), 520)
  })
}

function posStyle(n) {
  const p = layout.pos[n.id]
  if (!p) return {}
  return { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px' }
}

/* ---------- 连线（全量、虚线） ---------- */
const SVG_NS = 'http://www.w3.org/2000/svg'

function rectOf(id) {
  const p = layout.pos[id]
  return { x: p?.x ?? 0, y: p?.y ?? 0, w: p?.w ?? CARD_W, h: nodeEls[id]?.offsetHeight ?? 92 }
}

const CIRCLED = ['①', '②', '③', '④'] // 选项序号（与节点卡「决策N」、编辑卡选项序号对应）
let rowGeoms = [] // 每行几何：{ yTop, yBot, cards[]（按 x 排序） }
let gapUsed = [] // 每行已被长连线占用的缝隙列（避免同缝穿两条线）

function drawEdges() {
  const svg = svgEl.value
  if (!svg) return
  svg.innerHTML = ''
  rowGeoms = rows.value.map((row) => {
    let yTop = Infinity
    let yBot = -Infinity
    const cards = row.map((m) => rectOf(m.id)).sort((p, q) => p.x - q.x)
    for (const rc of cards) {
      yTop = Math.min(yTop, rc.y)
      yBot = Math.max(yBot, rc.y + rc.h)
    }
    return { yTop, yBot, cards }
  })
  gapUsed = rows.value.map(() => [])
  svg.setAttribute('width', canvasW.value)
  svg.setAttribute('height', layout.height)
  // 同一对节点间的多个决策合并成一条箭头，箭头上标注决策序号
  const pairs = new Map()
  for (const n of allNodes.value) {
    (n.choices ?? []).forEach((c, i) => {
      if (!c.to || !layout.pos[c.to]) return
      const key = `${n.id}→${c.to}`
      if (!pairs.has(key)) pairs.set(key, { fromId: n.id, toId: c.to, nums: [] })
      pairs.get(key).nums.push(i)
    })
  }
  for (const p of pairs.values()) drawEdge(p.fromId, p.toId, p.nums)
}

/* 圆角折线（三次贝塞尔圆角）：比四分之一圆更舒缓，与其他连线的柔和曲线统一 */
function roundedPath(pts, r) {
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]
    const [px, py] = pts[i - 1]
    const [nx, ny] = pts[i + 1]
    const d1 = Math.hypot(x - px, y - py) || 1
    const d2 = Math.hypot(nx - x, ny - y) || 1
    const rr = Math.min(r, d1 / 2.2, d2 / 2.2)
    const k = rr * 0.6
    const ax = x + ((px - x) / d1) * rr
    const ay = y + ((py - y) / d1) * rr
    const bx = x + ((nx - x) / d2) * rr
    const by = y + ((ny - y) / d2) * rr
    const c1x = ax + ((x - px) / d1) * k
    const c1y = ay + ((y - py) / d1) * k
    const c2x = bx - ((nx - x) / d2) * k
    const c2y = by - ((ny - y) / d2) * k
    d += ` L${ax},${ay} C${c1x},${c1y} ${c2x},${c2y} ${bx},${by}`
  }
  d += ` L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`
  return d
}

/** 为长连线在第 r 行挑一条缝：贴近理想直线、优先与上一行同列（能直穿就不拐）、避开已占用 */
function pickGap(r, ideal, prevCol) {
  const g = rowGeoms[r]
  if (!g) return ideal
  const cols = []
  for (let i = 0; i < g.cards.length - 1; i++) {
    cols.push((g.cards[i].x + g.cards[i].w + g.cards[i + 1].x) / 2) // 卡与卡之间
  }
  const first = g.cards[0]
  const last = g.cards[g.cards.length - 1]
  if (first.x - 12 >= 8) cols.push(first.x - 12) // 行两侧的空档（须在画布内）
  if (last.x + last.w + 12 <= canvasW.value - 8) cols.push(last.x + last.w + 12)
  let best = first.x - 12
  let bd = Infinity
  for (const c of cols) {
    let pen = Math.abs(c - ideal)
    if (prevCol != null) pen += Math.abs(c - prevCol) * 0.55 // 连续性：顺着上一行列直着穿
    if ((gapUsed[r] ?? []).some((u) => Math.abs(u - c) < 12)) pen += 200 // 这条缝已有线
    if (pen < bd) {
      bd = pen
      best = c
    }
  }
  gapUsed[r].push(best)
  return best
}

function drawEdge(fromId, toId, nums) {
  const a = rectOf(fromId)
  const b = rectOf(toId)
  const ia = rowsIdx.value[fromId]
  const ib = rowsIdx.value[toId]
  if (!ia || !ib) return

  let d, dir, lx, ly
  let x2 = 0
  let y2 = 0
  if (ib.r > ia.r) {
    // 所有向下连线统一穿缝路由：先沿本列降到通道中线，再贴理想直线穿缝，最后进 B。
    // 拐点全部落在行间通道里——行内有展开的长卡也不会被挡；相邻行同样安全
    const ra = ia.r
    const rb = ib.r
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    const aBot = a.y + a.h
    const chY = (r) => rowGeoms[r].yBot + 38 // 行与行之间的通道中线
    const rm = rb - ra > 1 ? Math.max(ra + 1, Math.min(rb - 1, Math.round((ra + rb) / 2))) : -1
    const cols = {}
    let prev = ax
    for (let r = ra + 1; r < rb; r++) {
      const t = (r - ra) / (rb - ra)
      cols[r] = pickGap(r, ax + (bx - ax) * t, prev)
      prev = cols[r]
    }
    const pts = [
      [ax, aBot],
      [ax, chY(ra)],
    ]
    for (let r = ra + 1; r < rb; r++) {
      const col = cols[r]
      const nextT = r + 1 < rb ? cols[r + 1] : bx
      const shift = Math.max(-8, Math.min(8, (nextT - col) / 2)) // 横移的一半吸收进缝内斜线
      pts.push([col - shift, chY(r - 1) + 14])
      pts.push([col + shift, chY(r) - 14])
      if (r === rm) {
        lx = col
        ly = (rowGeoms[r].yTop + rowGeoms[r].yBot) / 2
      }
    }
    pts.push([bx, b.y - 26])
    pts.push([bx, b.y])
    d = roundedPath(pts, 48)
    dir = 0
    x2 = bx
    y2 = b.y
    if (rm < 0) {
      // 相邻行：序号放在通道的横移段上
      lx = (ax + bx) / 2
      ly = chY(ra)
    }
  } else if (ia.r === ib.r) {
    // 同时刻连线（遗留）：从行的下方通道绕 U，避开行内中间的卡
    const r = ia.r
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    const cy = rowGeoms[r].yBot + 38
    x2 = bx
    y2 = b.y + b.h
    d = roundedPath(
      [
        [ax, a.y + a.h],
        [ax, cy],
        [bx, cy],
        [bx, y2],
      ],
      26,
    )
    dir = 180
    lx = (ax + bx) / 2
    ly = cy - 6
  } else {
    // 指回更早的旧连线（按规则不应再产生）：直连待修，箭头向上
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    x2 = b.x + b.w / 2
    y2 = b.y + b.h
    d = `M${x1},${y1} C${x1 + 40},${y1 - 56} ${x2 + 40},${y2 + 56} ${x2},${y2}`
    dir = 180
    lx = (x1 + x2) / 2 + 40
    ly = (y1 + y2) / 2
  }

  const svg = svgEl.value
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('class', 'edge-line')
  path.setAttribute('stroke-width', '1.3')
  path.setAttribute('stroke-dasharray', '4 4')
  svg.appendChild(path)

  const arr = document.createElementNS(SVG_NS, 'path')
  arr.setAttribute('d', `M${x2},${y2} m-3.5,-5 l7,0 l-3.5,7 z`)
  arr.setAttribute('transform', `rotate(${dir}, ${x2}, ${y2})`)
  arr.setAttribute('class', 'edge-arrow')
  svg.appendChild(arr)

  // 箭头上的决策序号：标出前一节点的第几个决策通向这条线；点击可断开
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('class', 'edge-hit')
  const hit = document.createElementNS(SVG_NS, 'circle')
  hit.setAttribute('cx', lx)
  hit.setAttribute('cy', ly - 4)
  hit.setAttribute('r', 14)
  hit.setAttribute('fill', 'transparent')
  hit.setAttribute('pointer-events', 'all')
  const tx = document.createElementNS(SVG_NS, 'text')
  tx.setAttribute('x', lx)
  tx.setAttribute('y', ly)
  tx.setAttribute('text-anchor', 'middle')
  tx.setAttribute('class', 'edge-num')
  tx.textContent = nums.map((i) => CIRCLED[i] ?? i + 1).join('')
  g.appendChild(hit)
  g.appendChild(tx)
  g.addEventListener('click', () => openEdgeSheet(fromId, toId, nums))
  svg.appendChild(g)
}

/* ---------- 结构变化 → 平滑重排 ---------- */
const structureKey = computed(() =>
  JSON.stringify(allNodes.value.map((n) => [n.id, n.time, (n.choices ?? []).map((c) => c.to)])),
)

let structTimer = null
let smoothTimer = null

function scheduleRelayout() {
  clearTimeout(structTimer)
  structTimer = setTimeout(() => smoothRelayout(), 80)
}

function smoothRelayout() {
  if (svgEl.value) svgEl.value.style.opacity = '0.05'
  nextTick(() => relayout())
  clearTimeout(smoothTimer)
  smoothTimer = setTimeout(() => {
    drawEdges()
    if (svgEl.value) svgEl.value.style.opacity = ''
  }, 380)
}

watch(structureKey, () => scheduleRelayout())

/* ══════════ 画布拖拽：交换位置 / 决策连线 / 拖到底部删除 ══════════
   ⠿ 按住拖动小卡 → 其余节点蒙版；拖到另一卡上弹面板，拖到红区删除 */
const drag = ref(null) // { id, dx, dy, w, h, overId, kind, overDel }
let suppressClickUntil = 0 // 拖拽结束的瞬间吞掉随之而来的 click，避免误开节点
const delZoneEl = ref(null)
const dropSheet = ref(null) // { fromId, toId, sameRow }
const edgeSheet = ref(null) // { fromId, toId, nums }

function onHandleDown(e, n) {
  if (roMode.value || drag.value || focusOn.value || focusId.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = nodeEls[n.id]
  if (!el) return
  e.preventDefault()
  drag.value = {
    id: n.id,
    dx: 0,
    dy: 0,
    h: el.offsetHeight,
    startX: e.clientX,
    startY: e.clientY,
    overId: null,
    kind: null, // swap 同时刻互换 | link 连到更晚 | bad 禁止指向更早
    overDel: false,
  }
  window.addEventListener('pointermove', onHandleMove)
  window.addEventListener('pointerup', onHandleUp)
  window.addEventListener('pointercancel', onHandleCancel)
}

function hitTest(x, y, skipId) {
  for (const [id, el] of Object.entries(nodeEls)) {
    if (id === skipId) continue
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
  }
  return null
}

/** 落点分类：时刻向后才有箭头；同一时刻只能互换；更早禁止 */
function dropKind(fromId, toId) {
  const ta = toMinutes(nodesOf.value[fromId]?.time)
  const tb = toMinutes(nodesOf.value[toId]?.time)
  if (tb > ta) return 'link'
  if (tb === ta) return 'swap'
  return 'bad'
}

function onHandleMove(e) {
  const d = drag.value
  if (!d) return
  d.dx = e.clientX - d.startX
  d.dy = e.clientY - d.startY
  d.overId = hitTest(e.clientX, e.clientY, d.id)
  d.kind = d.overId ? dropKind(d.id, d.overId) : null
  const dz = delZoneEl.value
  if (dz) {
    const r = dz.getBoundingClientRect()
    d.overDel = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  } else {
    d.overDel = false
  }
}

function detachDragListeners() {
  window.removeEventListener('pointermove', onHandleMove)
  window.removeEventListener('pointerup', onHandleUp)
  window.removeEventListener('pointercancel', onHandleCancel)
}

async function onHandleUp() {
  const d = drag.value
  detachDragListeners()
  suppressClickUntil = Date.now() + 400 // 拖拽后的 click 不再当作点按（否则会误开目标节点）
  if (!d) return
  if (d.overDel) {
    const node = nodesOf.value[d.id]
    drag.value = null
    if (node && (await confirmBox(`删除「${node.time} ${node.title}」？`, { body: '指向它的决策会改接到它的后继。', danger: true }))) {
      removeNode(presets.activeId, d.id)
      scheduleRelayout()
    }
    return
  }
  if (d.overId && d.kind !== 'bad') {
    dropSheet.value = { fromId: d.id, toId: d.overId, sameRow: d.kind === 'swap' }
  }
  drag.value = null // 蒙版随之消失；确认动作后 relayout 播放移动动画
}

function onHandleCancel() {
  detachDragListeners()
  suppressClickUntil = Date.now() + 400
  drag.value = null
}

function dragStyle(n) {
  const d = drag.value
  if (!d || d.id !== n.id) return null
  return {
    transform: `translate(${d.dx}px, ${d.dy}px) scale(1.05) rotate(1.2deg)`,
    zIndex: 30,
    transition: 'box-shadow 0.2s ease',
  }
}

const ghostStyle = computed(() => {
  const d = drag.value
  if (!d) return null
  const p = layout.pos[d.id]
  return p ? { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: d.h + 'px' } : null
})

/* ---------- 落点面板：交换位置 / 把决策连过去 ---------- */
const dropFrom = computed(() => (dropSheet.value ? nodesOf.value[dropSheet.value.fromId] : null))
const dropTo = computed(() => (dropSheet.value ? nodesOf.value[dropSheet.value.toId] : null))
const nodeLabel = (id) => {
  const n = nodesOf.value[id]
  return n ? `${n.time} ${n.title}` : '？'
}

function doSwap() {
  const a = dropFrom.value
  const b = dropTo.value
  if (!a || !b) return
  dropSheet.value = null
  swapNodes(a, b)
  popCards([a.id, b.id])
}

function doConnect(idx) {
  const c = dropFrom.value?.choices?.[idx]
  if (!c || !dropSheet.value) return
  c.to = dropSheet.value.toId // structureKey 变化 → 平滑重排
  dropSheet.value = null
}

/* ---------- 断开连线（点箭头序号） ---------- */
function openEdgeSheet(fromId, toId, nums) {
  if (roMode.value || drag.value) return
  edgeSheet.value = { fromId, toId, nums: [...nums] }
}

function breakEdge(idx) {
  const c = nodesOf.value[edgeSheet.value?.fromId]?.choices?.[idx]
  if (c) c.to = null // 该决策改为「结束这一天」
  edgeSheet.value = null
}

/* ---------- 画布直接新增节点（独立节点，拖拽连线接入剧情） ---------- */
function addNodeFromCanvas() {
  if (roMode.value) return
  const id = addNode(presets.activeId)
  if (!id) return
  relayout() // 渲染前先占好槽位，避免新卡闪到画布左上角再飞回来
  nextTick(() => popCards([id]))
}

/* ---------- 展开 / 收起：高度与让位动画 ----------
   高度动画用确定性计时收尾，不依赖 transitionend（该事件被打断/合并时会漏发，
   漏发则内联高度永久钉死，之后展开/收起看起来毫无反应） */
let expandHTimer = null
function toggleExpand(n) {
  if (Date.now() < suppressClickUntil) return
  const el = nodeEls[n.id]
  const startH = el?.offsetHeight ?? 92
  if (expandedIds.value.has(n.id)) expandedIds.value.delete(n.id)
  else expandedIds.value.add(n.id)
  persistExpanded()

  nextTick(() => {
    const el2 = nodeEls[n.id]
    if (!el2) {
      relayout()
      drawEdges()
      return
    }
    const endH = el2.offsetHeight
    relayout()
    animatingExpand = true
    el2.style.height = startH + 'px'
    void el2.offsetWidth
    el2.style.height = Math.max(endH, 8) + 'px'
    clearTimeout(expandHTimer)
    expandHTimer = setTimeout(() => {
      el2.style.height = '' // 定时收尾：无论过渡事件是否触发，内联高度必被清除
      animatingExpand = false
    }, 420)
  })

  if (svgEl.value) svgEl.value.style.opacity = '0.05'
  clearTimeout(smoothTimer)
  smoothTimer = setTimeout(() => {
    drawEdges()
    if (svgEl.value) svgEl.value.style.opacity = ''
  }, 380)
}

function collapseAll() {
  expandedIds.value = new Set()
  persistExpanded()
  scheduleRelayout()
}

/* ══════════ 相机推进：聚焦进节点内部 ══════════
   动效铁律（与 docs/node-editor-mockup.html 一致）：
   1. 推近：画布以被点卡片为中心 transform 缩放，其余节点淡出失焦
   2. 等比归位：内部内容从放大姿态 scale 1.32 缩回 1，与推近连成一次缩放
   3. 驻留 + 直接缩小：进入后画布保持缩放姿态，退出直接缩小回全景，零重摆 */
const focusId = ref(null) // 内部视图的内容作用域
const focusOn = ref(false) // 内部视图是否挂载显示
const focusVis = ref(false) // 内部视图不透明度
const focusTarget = ref(null) // 画布上被聚焦的卡片（高亮 + 退出落点）
const focusing = ref(false)
const zoominStart = ref(false)
const zoomout = ref(false)
const focusBodyEl = ref(null)

let focusTimer = null
let backTimer1 = null
let backTimer2 = null

function targetTransform(el) {
  const zr = zoomerEl.value.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const ox = r.left - zr.left + r.width / 2
  const oy = r.top - zr.top + r.height / 2
  const cx = wrapEl.value.clientWidth / 2
  const cy = wrapEl.value.scrollTop + wrapEl.value.clientHeight / 2
  const s = Math.min((wrapEl.value.clientWidth - 24) / r.width, 3)
  return { ox, oy, transform: `translate(${cx - ox}px, ${cy - oy}px) scale(${s})` }
}

function applyTransform(t, animate) {
  const z = zoomerEl.value
  if (!z) return
  z.style.transition = animate ? 'transform .45s cubic-bezier(.22,.61,.36,1)' : 'none'
  z.style.transformOrigin = `${t.ox}px ${t.oy}px`
  z.style.transform = t.transform
}

function focusNode(n) {
  if (Date.now() < suppressClickUntil) return
  const el = nodeEls[n.id]
  if (!el) return
  clearTimeout(focusTimer)
  clearTimeout(backTimer1) // 快速返回后立刻重进：退场计时不能把新会话清掉（⤢⤡“没反应”的根因）
  clearTimeout(backTimer2)
  focusId.value = n.id
  focusTarget.value = n.id
  focusing.value = true
  applyTransform(targetTransform(el), true)
  focusTimer = setTimeout(() => {
    zoominStart.value = true
    focusOn.value = true
    nextTick(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (focusBodyEl.value) focusBodyEl.value.scrollTop = 0 // 新挂载的容器本来就在顶，这里兜底
          focusVis.value = true
          zoominStart.value = false
        }),
      ),
    )
    // 画布保持在缩放姿态驻留（不复位），退出时直接缩小回去
  }, 250)
}

function back() {
  zoomout.value = true
  focusVis.value = false
  applyTransform({ ox: 0, oy: 0, transform: 'none' }, true)
  zoomerEl.value.style.transformOrigin = '0 0'
  clearTimeout(backTimer1)
  clearTimeout(backTimer2)
  backTimer1 = setTimeout(() => {
    focusOn.value = false
    focusId.value = null
    zoomout.value = false
  }, 260)
  backTimer2 = setTimeout(() => {
    focusing.value = false
    focusTarget.value = null
  }, 470)
}

function forceBack() {
  clearTimeout(focusTimer)
  clearTimeout(backTimer1)
  clearTimeout(backTimer2)
  focusId.value = null
  focusOn.value = false
  focusVis.value = false
  zoominStart.value = false
  zoomout.value = false
  focusing.value = false
  focusTarget.value = null
  applyTransform({ ox: 0, oy: 0, transform: 'none' }, false)
  zoomerEl.value.style.transformOrigin = '0 0'
}

function onNodeTap(n) {
  if (drag.value || Date.now() < suppressClickUntil) return // 拖拽后的松手不当作点按
  if (!isExpanded(n)) focusNode(n) // 展开卡上编辑不触发聚焦，用左上角 ⤢ 聚焦
}

/* ══════════ 节点内部：只编辑这一个节点 ══════════ */
const scopeNode = computed(() => (focusId.value ? nodesOf.value[focusId.value] : null))

async function delScene(sc) {
  if (roMode.value) return
  if (!(await confirmBox(`删除「${sc.time} ${sc.title}」？`, { body: '指向它的决策会改接到它的后继。', danger: true }))) return
  const wasScope = sc.id === focusId.value
  removeNode(presets.activeId, sc.id)
  if (wasScope) forceBack()
  scheduleRelayout()
}

/* ══════════ 自动保存提示 ══════════ */
const savedFlash = ref(false)
let saveTimer = null
let flashTimer = null
watch(
  presets,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      persistPresets()
      savedFlash.value = true
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => (savedFlash.value = false), 1200)
    }, 400)
  },
  { deep: true },
)

/* ══════════ 生命周期 ══════════ */
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (animatingExpand || focusOn.value || focusId.value) return // 聚焦时画布不可见，跳过重排
    clearTimeout(roTimer)
    roTimer = setTimeout(() => {
      if (focusOn.value || focusId.value) return
      relayout()
      drawEdges()
    }, 160)
  })
  Object.values(nodeEls).forEach((el) => ro.observe(el))
  nextTick(() => {
    relayout()
    drawEdges()
    centerCanvas()
    revealCanvas()
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  detachDragListeners()
  ;[focusTimer, backTimer1, backTimer2, structTimer, smoothTimer, saveTimer, flashTimer, roTimer, expandHTimer].forEach(
    clearTimeout,
  )
})

/* 小卡徽标 */
function nodeBadge(n) {
  if (n.id === activePreset.value.start) return { text: '起点', kind: '' }
  if (isMerge(n.id)) return { text: '合流', kind: 'merge' }
  return null
}
function isTerminal(n) {
  return (n.choices ?? []).length > 0 && n.choices.every((c) => !c.to)
}
</script>

<template>
  <div class="editor">
    <!-- ════════ 画布总览 ════════ -->
    <div class="ed-canvas">
      <header class="e-head">
        <button class="btn ghost back" @click="backOut">‹ 返回</button>
        <div class="e-title serif">剧本节点</div>
        <button
          v-if="!ro && presets.list.length > 1"
          class="e-linkdel"
          @click="delPreset"
        >删除预设</button>
        <span v-else-if="!roMode" class="e-linkdel off">删除预设</span>
      </header>

      <div v-if="!roMode" class="e-presets">
        <button
          v-for="p in presets.list"
          :key="p.id"
          class="p-chip"
          :class="{ on: p.id === presets.activeId }"
          @click="switchPreset(p.id)"
        >
          {{ p.name }}<i>{{ Object.keys(p.nodes).length }}</i>
        </button>
        <button class="p-chip add" title="新建预设" @click="creating = !creating">＋</button>
        <button class="p-chip" title="收起全部展开的节点" @click="collapseAll">收起全部</button>
      </div>

      <div v-if="!ro && creating" class="e-newp">
        <input v-model="newName" class="fi" placeholder="新预设名，如：周末" @keyup.enter="createFromCurrent" />
        <button class="btn ghost" @click="createFromCurrent">复制「{{ activePreset.name }}」创建</button>
      </div>

      <p class="e-hint">
        画布按时刻分行：同一时刻的备选并排，箭头指向更晚的时刻。点小卡聚焦查看节点内部。
      </p>
      <p v-if="!roMode" class="e-hint" style="margin-top: -4px">
        按住 ⠿ 拖动小卡：到同时刻卡上＝互换位置；到更晚的卡上＝把决策连过去；拖到底部红区＝删除节点。
        底部「＋ 新增节点」先造独立节点，再连入剧情。
      </p>

      <!-- 拖动落点的文字提示（蒙版之上） -->
      <div v-if="drag && drag.overId && !drag.overDel" class="drag-tip" :class="{ bad: drag.kind === 'bad' }">
        {{ drag.kind === 'bad' ? '箭头只能指向更晚的时刻' : drag.kind === 'swap' ? '松手：互换两张卡' : '松手：把决策连过去' }}
      </div>

      <div ref="wrapEl" class="canvas-wrap" :class="{ dragging: !!drag, ready: canvasReady }">
        <div ref="zoomerEl" class="zoomer" :class="{ focusing }">
          <div class="canvas" :style="{ height: (layout.addY + 54) + 'px', width: canvasW + 'px' }">
            <svg ref="svgEl" class="edges"></svg>
            <!-- 拖动时原位置的虚影槽位 -->
            <div v-if="ghostStyle" class="drag-ghost" :style="ghostStyle"></div>
            <div
              v-for="n in allNodes"
              :key="n.id"
              class="cnode"
              :class="{
                small: !isExpanded(n),
                wide: isExpanded(n),
                focus: n.id === focusTarget,
                terminal: isTerminal(n),
                dragging: !!drag && drag.id === n.id,
                'drop-hot': !!drag && drag.overId === n.id && drag.kind !== 'bad',
              }"
              :style="[posStyle(n), dragStyle(n)]"
              :ref="(el) => setNodeEl(n.id, el)"
              @click="onNodeTap(n)"
            >
              <button
                class="n-toggle"
                :title="isExpanded(n) ? '收起为小卡' : '展开完整编辑卡'"
                @click.stop="toggleExpand(n)"
              >{{ isExpanded(n) ? '⤡' : '⤢' }}</button>
              <button
                v-if="!roMode && !isExpanded(n)"
                class="n-drag"
                title="拖动：交换位置 / 决策连线 / 拖到底部删除"
                @pointerdown="onHandleDown($event, n)"
              >⠿</button>

              <template v-if="isExpanded(n)">
                <button class="n-zoom" title="聚焦进这个节点" @click.stop="focusNode(n)">⤢</button>
                <div class="cnode-ed" @click.stop>
                  <EventCard :scene="n" mini :ro="roMode" @delete="delScene" />
                </div>
              </template>
              <template v-else>
                <span v-if="nodeBadge(n)" class="n-badge" :class="nodeBadge(n).kind">{{ nodeBadge(n).text }}</span>
                <div class="n-time">{{ n.time }}</div>
                <div class="n-title serif">{{ n.title }}</div>
                <div v-if="isTerminal(n)" class="n-kind">终章 → 夜记</div>
                <div v-else class="n-decs">
                  <span v-for="(c, ci) in n.choices" :key="ci" class="n-dec">决策{{ ci + 1 }}</span>
                </div>
              </template>
            </div>

            <!-- 画布直接新增节点：独立节点，之后拖拽连线接入剧情 -->
            <button
              v-if="!ro && !focusing"
              class="cnode add-card"
              :style="{ left: (canvasW - CARD_W) / 2 + 'px', top: layout.addY + 'px', width: CARD_W + 'px' }"
              @click="addNodeFromCanvas"
            >＋ 新增节点</button>
          </div>
        </div>
      </div>

      <!-- 拖到底部＝删除节点 -->
      <div v-if="drag" ref="delZoneEl" class="drag-del" :class="{ hot: drag.overDel }">
        {{ drag.overDel ? '松手删除这个节点' : '拖到这里删除节点' }}
      </div>

      <!-- 落点面板：同时刻＝只互换；更晚时刻＝只连决策 -->
      <div v-if="dropSheet" class="sheet-mask" @click="dropSheet = null">
        <div class="sheet" @click.stop>
          <p class="sheet-t">
            {{ dropSheet.sameRow ? '和「' + nodeLabel(dropSheet.toId) + '」互换位置？' : '把「' + nodeLabel(dropSheet.fromId) + '」的哪个决策连到「' + nodeLabel(dropSheet.toId) + '」？' }}
          </p>
          <button v-if="dropSheet.sameRow" type="button" class="sheet-i primary" @click="doSwap">⇄ 互换两张卡的位置</button>
          <template v-else>
            <div class="sheet-list">
              <button
                v-for="(c, i) in dropFrom?.choices ?? []"
                :key="i"
                type="button"
                class="sheet-i"
                @click="doConnect(i)"
              >
                <span>{{ ['①', '②', '③', '④'][i] ?? i + 1 }} {{ c.text }}</span>
                <i>{{ c.to === dropSheet.toId ? '✓ 已连接' : c.to == null ? '现：结束' : '现：' + nodeLabel(c.to) }}</i>
              </button>
            </div>
            <p class="sheet-sub">连接后这条箭头会带上对应序号；合流到已有节点也是这样接。</p>
          </template>
          <button type="button" class="sheet-cancel" @click="dropSheet = null">取消</button>
        </div>
      </div>

      <!-- 断开连线面板 -->
      <div v-if="edgeSheet" class="sheet-mask" @click="edgeSheet = null">
        <div class="sheet" @click.stop>
          <p class="sheet-t">断开这条连线？</p>
          <p class="sheet-sub2">{{ nodeLabel(edgeSheet.fromId) }} → {{ nodeLabel(edgeSheet.toId) }}</p>
          <div class="sheet-list">
            <button
              v-for="i in edgeSheet.nums"
              :key="i"
              type="button"
              class="sheet-i danger"
              @click="breakEdge(i)"
            >
              <span>断开 {{ ['①', '②', '③', '④'][i] ?? i + 1 }} {{ nodesOf[edgeSheet.fromId]?.choices?.[i]?.text }}</span>
              <i>→ 结束这一天</i>
            </button>
          </div>
          <button type="button" class="sheet-cancel" @click="edgeSheet = null">取消</button>
        </div>
      </div>
    </div>

    <!-- ════════ 节点内部（聚焦编辑）：每次进入全新挂载，滚动天然从顶开始 ════════ -->
    <div v-if="focusId" class="ed-focus" :class="{ vis: focusVis }">
      <header class="e-head">
        <button class="btn ghost back" @click="back()">‹ 节点总览</button>
        <span class="chip scope">
          {{ scopeNode ? `聚焦 · ${scopeNode.time} ${scopeNode.title}` : '' }}
        </span>
      </header>
      <p class="e-hint">
        你在节点内部：只编辑这一个节点。每个决策旁的 ①② 与画布箭头对应；
        点「走向」可新建分支节点、接到已有节点（合流）或结束这一天。
      </p>
      <div
        ref="focusBodyEl"
        class="focus-body"
        :class="{ 'zoomin-start': zoominStart, zoomout }"
      >
        <EventCard v-if="scopeNode" class="focus-card first" :scene="scopeNode" :ro="roMode" @delete="delScene" />
      </div>
    </div>

    <p v-if="persistError" class="e-quota">
      本机存储已满：最新的照片可能没有保存成功。试着删掉一些旧照片。
    </p>
    <div class="e-save" :class="{ show: savedFlash }">✓ 已保存</div>
  </div>
</template>

<style scoped>
.editor {
  position: relative;
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.ed-canvas { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.e-head { display: flex; align-items: center; gap: 12px; padding: 16px 18px 10px; }
.e-head .back { padding: 7px 14px; font-size: 13px; }
.e-title { font-size: 17px; letter-spacing: 0.14em; flex: 1; text-align: center; }
.e-linkdel {
  border: none; background: none; font: inherit; font-size: 12px;
  color: var(--bad); letter-spacing: 0.08em; cursor: pointer; padding: 4px 0;
}
.e-linkdel.off { color: var(--ink-3); cursor: default; }
.chip.scope { color: var(--ink); background: var(--mist); }

/* 预设切换条 */
.e-presets { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 18px; margin-top: 4px; }
.p-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 13px; letter-spacing: 0.06em;
  padding: 7px 14px; border-radius: 999px; cursor: pointer;
  background: var(--paper); border: 1px solid var(--line); color: var(--ink-2);
  transition: all 0.16s ease;
}
.p-chip i { font-style: normal; font-size: 11px; opacity: 0.7; }
.p-chip.on { background: var(--ink); border-color: var(--ink); color: var(--on-ink); }
.e-newp {
  display: flex; gap: 10px; margin: 12px 18px 0; padding: 12px 14px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
}
.e-newp .fi { flex: 1; }
.e-newp .btn { padding: 8px 14px; font-size: 13px; white-space: nowrap; }
.fi {
  border: none; border-bottom: 1px solid var(--line); border-radius: 0;
  background: transparent; font: inherit; font-size: 14px; color: var(--ink);
  padding: 7px 2px 1px; min-width: 0; /* 底部只留 1px，文字贴住横线 */
}
.fi:focus { outline: none; border-color: var(--ink-2); }

.e-hint { margin: 12px 18px 10px; font-size: 11.5px; color: var(--ink-3); letter-spacing: 0.04em; line-height: 1.7; }

/* ---------- 画布 ---------- */
.canvas-wrap {
  flex: 1;
  overflow: auto;
  padding: 0 14px 30px;
  opacity: 0; /* 首次布局完成前遮住，避免看到节点“顿”一下归位 */
  transition: opacity 0.28s ease;
}
.canvas-wrap.ready { opacity: 1; }
.zoomer { transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1); will-change: transform; }
.canvas { position: relative; margin: 0 auto; } /* 宽由 inline style 按 canvasW 给出 */
.edges { position: absolute; inset: 0; pointer-events: none; overflow: visible; transition: opacity 0.35s ease; }
.zoomer.focusing .cnode:not(.focus) { opacity: 0.1; filter: blur(3px); }
.zoomer.focusing .edges { opacity: 0.05; }
:deep(.edge-num) {
  font-size: 11px; fill: var(--tier-sad); paint-order: stroke; stroke: var(--bg);
  stroke-width: 3.5px; letter-spacing: 0.02em;
}
/* 连线与箭头走主题 token（深色底上提亮一档），类名由 drawEdge 打上 */
:deep(.edge-line) { stroke: var(--edge); }
:deep(.edge-arrow) { fill: var(--edge); }
:deep(.edge-hit) { cursor: pointer; }

.cnode {
  position: absolute;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition:
    left 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), top 0.34s cubic-bezier(0.22, 0.61, 0.36, 1),
    width 0.34s ease, height 0.34s ease,
    opacity 0.35s ease, filter 0.35s ease, box-shadow 0.2s ease,
    transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.cnode:hover { box-shadow: 0 8px 24px var(--shadow); }
.cnode.focus { box-shadow: 0 0 0 2px var(--ink-2); }
.cnode.wide { background: transparent; border: none; cursor: default; }
.cnode.terminal.small { border-style: dashed; }

/* ---------- 拖拽：蒙版 / 浮起 / 落点高亮 / 原位虚影 ---------- */
.canvas-wrap.dragging .cnode:not(.dragging):not(.drop-hot) {
  opacity: 0.18;
  filter: blur(1.5px);
}
.canvas-wrap.dragging .edges { opacity: 0.05; }
.cnode.dragging {
  box-shadow: 0 18px 44px rgba(60, 50, 30, 0.3);
  cursor: grabbing;
}
.cnode.drop-hot {
  opacity: 1 !important;
  filter: none !important;
  box-shadow: 0 0 0 2.5px var(--ink-2), 0 10px 26px rgba(60, 50, 30, 0.18);
}
.cnode.pop { animation: pop-swap 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes pop-swap {
  0% { transform: scale(1); }
  40% { transform: scale(1.09); }
  100% { transform: scale(1); }
}
.drag-ghost {
  position: absolute;
  border: 1.5px dashed var(--line);
  border-radius: 8px;
  background: rgba(60, 50, 30, 0.03);
  pointer-events: none;
}
.n-drag {
  position: absolute; bottom: -10px; left: -10px; width: 24px; height: 24px; border-radius: 50%;
  background: var(--paper); color: var(--ink-2); border: 1px solid var(--line);
  font-size: 12px; line-height: 1; cursor: grab; touch-action: none; user-select: none;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 2;
}
.n-drag:active { background: var(--mist); cursor: grabbing; }
.drag-del {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(16px + env(safe-area-inset-bottom));
  width: min(86%, 400px); z-index: 35;
  text-align: center; font-size: 13px; letter-spacing: 0.1em; color: var(--bad);
  border: 1.5px dashed var(--bad); border-radius: 12px; padding: 14px 10px;
  background: rgba(174, 110, 98, 0.07);
  pointer-events: none; transition: background 0.15s ease, color 0.15s ease;
}
.drag-del.hot {
  background: rgba(174, 110, 98, 0.18);
  font-weight: 600;
}
/* 拖动落点提示（蒙版上的文字） */
.drag-tip {
  position: fixed; top: calc(16px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--on-ink); font-size: 12px; letter-spacing: 0.12em;
  padding: 8px 18px; border-radius: 999px; z-index: 45; pointer-events: none;
  box-shadow: 0 10px 26px rgba(60, 50, 30, 0.25);
}
.drag-tip.bad { background: var(--bad); }

/* 画布「＋ 新增节点」虚线卡 */
.cnode.add-card {
  display: flex; align-items: center; justify-content: center;
  border: 1.5px dashed var(--line); border-radius: 8px;
  background: transparent; color: var(--ink-3);
  font: inherit; font-size: 13px; letter-spacing: 0.12em;
  height: 48px; cursor: pointer;
}
.cnode.add-card:active { border-color: var(--ink-2); color: var(--ink-2); }

/* 底部面板（落点 / 断开连线），与 EventCard 走向弹层同款 */
.sheet-mask {
  position: fixed; inset: 0; z-index: 40;
  background: var(--mask);
  display: flex; align-items: flex-end; justify-content: center;
}
.sheet {
  width: 100%; max-width: 460px; max-height: 68vh; max-height: 68dvh;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 14px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; overflow: hidden;
  animation: sheet-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes sheet-up { from { transform: translateY(40%); opacity: 0.4; } }
.sheet-t { font-size: 13.5px; color: var(--ink); letter-spacing: 0.06em; padding: 2px 2px 8px; }
.sheet-sub { font-size: 10px; color: var(--ink-3); letter-spacing: 0.12em; padding: 10px 2px 4px; }
.sheet-sub2 { font-size: 12px; color: var(--ink-2); padding: 0 2px 8px; letter-spacing: 0.04em; }
.sheet-list { overflow: auto; display: flex; flex-direction: column; min-height: 0; }
.sheet-i {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: none; background: none; font: inherit; font-size: 14px; color: var(--ink);
  text-align: left; padding: 11px 10px; border-radius: 6px; cursor: pointer; min-width: 0;
}
.sheet-i:active { background: var(--mist); }
.sheet-i span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet-i i {
  font-style: normal; font-size: 11px; color: var(--ink-3); flex: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%;
}
.sheet-i.danger { color: var(--bad); }
.sheet-i.danger i { color: var(--bad); opacity: 0.75; }
.sheet-i.primary {
  background: var(--ink); color: var(--on-ink); justify-content: center;
  margin-bottom: 4px; padding: 12px 10px;
}
.sheet-i.primary:active { background: var(--ink-strong); }
.sheet-cancel {
  border: none; background: none; font: inherit; font-size: 13px; color: var(--ink-3);
  padding: 10px; cursor: pointer; letter-spacing: 0.1em;
}

.cnode.small { padding: 10px 12px; }
.cnode.small .n-time { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.cnode.small .n-title { font-family: var(--serif); font-size: 14px; letter-spacing: 0.04em; margin-top: 2px; }
.cnode.small .n-kind { font-size: 9px; letter-spacing: 0.2em; color: var(--ink-3); margin-top: 6px; }
.n-decs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.n-dec {
  font-size: 9px; letter-spacing: 0.06em; color: var(--ink-2);
  border: 1px solid var(--line); border-radius: 999px; padding: 1.5px 7px;
  background: var(--paper);
}
.n-badge {
  position: absolute; top: -9px; left: 10px; font-size: 9px; letter-spacing: 0.12em;
  background: var(--ink); color: var(--on-ink); padding: 2px 8px; border-radius: 999px;
}
.n-badge.merge { background: var(--good); }

.n-toggle {
  position: absolute; top: -10px; right: -10px; width: 24px; height: 24px; border-radius: 50%;
  background: var(--ink); color: var(--on-ink); border: none; font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  z-index: 2;
}
.n-toggle:hover { background: var(--ink-strong); }
.n-zoom {
  position: absolute; top: -10px; left: -10px; width: 24px; height: 24px; border-radius: 50%;
  background: var(--good); color: var(--on-ink); border: none; font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  z-index: 2;
}
.n-zoom:hover { filter: brightness(1.1); }
.cnode-ed { width: 100%; }

/* ---------- 节点内部（聚焦视图）：v-if 全新挂载，淡入前不拦截点击 ---------- */
.ed-focus {
  position: absolute; inset: 0; z-index: 10;
  background: var(--bg); display: flex; flex-direction: column;
  opacity: 0; transition: opacity 0.18s ease; overflow: hidden;
  pointer-events: none;
}
.ed-focus.vis { opacity: 1; pointer-events: auto; }

.focus-body {
  flex: 1; overflow: auto; padding: 4px 18px 40px;
  display: flex; flex-direction: column; gap: 12px;
  transform-origin: 50% 16%;
  transition: transform 0.38s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.24s ease;
}
.focus-body.zoomin-start,
.focus-body.zoomout { transform: scale(1.32); opacity: 0; }
.focus-body.zoomin-start { transition: none; }

.focus-card.first { border-color: var(--ink-2); box-shadow: 0 12px 36px rgba(60, 50, 30, 0.12); }

/* 存储提示 / 保存提示 */
.e-quota {
  position: relative; z-index: 11;
  margin: 12px 18px 0; font-size: 12px; color: var(--bad);
  line-height: 1.8; background: rgba(174, 110, 98, 0.06);
  border: 1px solid rgba(174, 110, 98, 0.25); border-radius: 6px; padding: 10px 14px;
}
.e-save {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(8px);
  background: var(--ink); color: var(--on-ink); font-size: 12px; letter-spacing: 0.15em;
  padding: 8px 18px; border-radius: 999px; opacity: 0; pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease; z-index: 30;
}
.e-save.show { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
