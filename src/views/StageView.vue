<script>
// 舞台记忆：离开舞台（去汇总）时记住停在哪，回来直接续上、不重放过场卡
const memory = { activeId: null, phase: '', logLen: -1, guest: false }
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGame, nowMinutes, bgKeyOf } from '../store.js'
import { bundledPhoto } from '../scenes-bg.js'
import { isMedia, delMedia, fileToMedia } from '../media.js'
import { MISSED_DELTA, fmtDelta } from '../gloom.js'
import { confirmBox } from '../confirm.js'
import GloomMeter from '../components/GloomMeter.vue'
import DialogueBox from '../components/DialogueBox.vue'
import ChoiceList from '../components/ChoiceList.vue'
import SceneBackground from '../components/SceneBackground.vue'
import TimingSheet from '../components/TimingSheet.vue'
import { openDrawer } from '../drawer.js'

const router = useRouter()
const { state, presets, activePreset, frontier, tier, isEnterable, choose, backfill, catchUp, patchScene, persistPresets, guest } =
  useGame()

/* ---------- 推进状态机 ---------- */
// interlude(过场序列) → choose(旁白打字 + 选项同时在场) → effect(选择后的全屏效果过场) → 下一个 interlude / waiting / finale
const phase = ref('interlude')
const activeId = ref(null)
const dialogue = ref('')
const dialogueTag = ref('')
const lastDelta = ref(0)
const deltaKey = ref(0)
const displayGloom = ref(state.gloom)
const dbRef = ref(null)
const now = ref(nowMinutes())

const activeScene = computed(() => activePreset.value.nodes[activeId.value] ?? null)

const clockLabel = computed(() => {
  const m = now.value
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

/* ---------- 背景：统一走 SceneBackground（渐变 / 照片 / 视频描述符） ----------
   结局页（finale）优先用「结算背景」（按预设保存），没有则沿用最后一幕 */
const bgMedia = computed(() => {
  if (phase.value === 'finale') {
    return activePreset.value?.finale?.photo ?? activeScene.value?.photo ?? bundledPhoto(activeScene.value?.id)
  }
  return activeScene.value?.photo ?? bundledPhoto(activeScene.value?.id)
})
const bgKey = computed(() => bgKeyOf(activeScene.value)) // 基调按时刻自动定，不再存手选值
const bgStyle = computed(() => ({
  filter: `saturate(${Math.min(1, 0.72 + displayGloom.value * 0.004).toFixed(3)})`,
}))
const fogOpacity = computed(() =>
  // 状态越低雾越浓：≥18 无雾，-10 时约 0.31
  Math.max(0, Math.min(0.42, (18 - displayGloom.value) / 90)),
)

/* ---------- 流程 ---------- */
/* 引子序列：每个时刻开场可以排多段无选项文字（各配照片），逐段轻触推进。
   只统计真的有内容（文字或照片）的段——没写过就不播，也不出默认卡 */
const introDbRef = ref(null)
const introDone = ref(false)
const introIndex = ref(0)
const intros = computed(() =>
  (activeScene.value?.intros ?? []).filter((it) => (it.text ?? '').trim() || it.photo),
)
const introText = computed(() => intros.value[introIndex.value]?.text?.trim() ?? '')
const introBg = computed(() => intros.value[introIndex.value]?.photo ?? '') // dataURL 或视频描述符

/* 访客空间跳转：访客的 汇总/夜记 走 /w/:code/*，本人走原路由 */
function nav(path) {
  router.push((guest.on && guest.work ? '/w/' + guest.work.code : '') + path)
}

function beginScene(scene) {
  activeId.value = scene.id
  dialogueTag.value = scene.title
  dialogue.value = scene.narration
  introIndex.value = 0
  introDone.value = false
  // 写过引子才进引子阶段，否则直接到选项现场
  phase.value = intros.value.length ? 'interlude' : 'choose'
}

function endInterlude() {
  if (phase.value !== 'interlude') return
  phase.value = 'choose'
}

/** 回到未完成的时刻：不重放过场卡，直接进选项现场 */
function resumeScene(scene) {
  activeId.value = scene.id
  dialogueTag.value = scene.title
  dialogue.value = scene.narration
  phase.value = 'choose'
}

/* ---------- 选择后的效果过场：全屏演出，照片与文字可自定义 ---------- */
const effectDbRef = ref(null)
const effectDone = ref(false)
const effectChoiceIndex = ref(-1)
const effectChoice = computed(() => activeScene.value?.choices?.[effectChoiceIndex.value] ?? null)
const effectText = computed(
  () => (effectChoice.value?.effect?.text?.trim() || effectChoice.value?.feedback || '').trim(),
)
const effectBg = computed(() => effectChoice.value?.effect?.photo ?? '') // dataURL 或视频描述符

function pick(i) {
  if (phase.value !== 'choose' || !activeScene.value) return
  const scene = activeScene.value
  lastDelta.value = choose(scene, i)
  deltaKey.value++
  animateGloom()
  effectChoiceIndex.value = i
  effectDone.value = false
  phase.value = 'effect'
}

function animateGloom() {
  const from = displayGloom.value
  const to = state.gloom
  if (from === to) return
  const t0 = performance.now()
  const dur = 700
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur)
    const e = 1 - Math.pow(1 - p, 3)
    displayGloom.value = Math.round(from + (to - from) * e)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** 轻触屏幕任意处推进（galgame 的经典交互） */

/* ---------- 沉浸模式：点 UI 之外隐藏全部界面，完整看图 ---------- */
const immersive = ref(false)
let lastTapAt = 0

function onStageTap() {
  const now = performance.now()
  const dbl = now - lastTapAt < 300
  lastTapAt = now
  if (immersive.value) {
    immersive.value = false // 沉浸中任何点按＝唤回界面
    return
  }
  if (dbl) {
    immersive.value = true // 双击空白＝沉浸（适用于过场/效果等轻触会推进的阶段）
    return
  }
  if (phase.value === 'choose' && dbRef.value?.isTyping?.()) {
    advance() // 旁白还在打字：先补全
    return
  }
  if (['choose', 'waiting', 'finale'].includes(phase.value)) {
    immersive.value = true // 稳定阶段：单击空白＝沉浸看图
    return
  }
  advance() // 过场 / 效果 / 错过摘要：轻触推进
}

function advance() {
  if (phase.value === 'interlude') {
    if (introText.value && !introDone.value) {
      introDbRef.value?.skip() // 第一击补全本段文字
    } else if (introIndex.value < intros.value.length - 1) {
      introIndex.value += 1 // 下一段过场
      introDone.value = false
    } else {
      endInterlude()
    }
  } else if (phase.value === 'choose') {
    dbRef.value?.skip() // 跳过旁白打字；已完成则是 no-op
  } else if (phase.value === 'effect') {
    if (!effectDone.value && effectText.value) effectDbRef.value?.skip()
    else settle()
  } else if (phase.value === 'missed') {
    settle()
  }
}

/** 决定下一步：沿图走到前沿节点 → 进入 / 等待 / 收尾 */
function settle() {
  const f = frontier.value
  if (f && isEnterable(f, now.value)) beginScene(f)
  else if (f) enterWaiting()
  else enterFinale()
}

function enterWaiting() {
  const f = frontier.value
  if (!f) {
    enterFinale()
    return
  }
  activeId.value = f.id
  dialogueTag.value = '时间'
  dialogue.value = `现在 ${clockLabel.value}。离下一个时刻——${f.time}，${f.title}——还有一会儿。到点，这里会出现新的选择。`
  phase.value = 'waiting'
}

function enterFinale() {
  dialogueTag.value = '一日终了'
  dialogue.value = `一天到此为止。${tier.value.label}——${tier.value.phrase}。`
  phase.value = 'finale'
}

/* ---------- 追赶摘要：合流之前顺流而去的时刻，一句旁白带过。
   文案是响应式的：回看里补做后，「真没回答」的剩余数实时变化 ---------- */
const missedShown = ref(0) // 摘要初次弹出时的顺流数（补做后数量变少即换措辞）
const trueMissedCount = computed(() => state.log.filter((e) => e.missed && !e.late).length)
const missedSummary = computed(() => {
  const n = trueMissedCount.value
  if (!n) return ''
  const fresh = n === missedShown.value
  return `（有 ${n} 个时刻${fresh ? '没有' : '还没有'}等到你的回答，顺流而去了。${fresh ? `状态 ${n * MISSED_DELTA}。` : ''}）`
})

function showMissedSummary(count) {
  missedShown.value = count
  dialogueTag.value = '时间'
  lastDelta.value = count * MISSED_DELTA
  deltaKey.value++
  animateGloom() // 状态值已被追赶扣过：顶栏药片同步动画，否则停在旧值
  phase.value = 'missed'
}

/* ---------- 生命周期与轮询 ---------- */
let ticker = null

onMounted(() => {
  // 真实模式 / 跨天追赶：直接跳到当前时间节点；
  // 若处于分流之中，则从最近一个确定的合流节点开始补选择（合流之前顺流而去）
  const r = state.mode === 'real' ? catchUp() : { missed: 0 }

  const f = frontier.value
  if (r.missed > 0) {
    showMissedSummary(r.missed)
  } else if (f && memory.phase === 'choose' && memory.activeId === f.id && memory.logLen === state.log.length && memory.guest === guest.on) {
    // 从汇总回来：停在同一个未选的时刻 → 直接续上，不重放过场卡
    resumeScene(f)
  } else {
    settle()
  }

  ticker = setInterval(() => {
    now.value = nowMinutes()
    if (state.mode !== 'real' || phase.value !== 'waiting') return
    const wf = frontier.value
    if (wf && isEnterable(wf, now.value)) beginScene(wf)
  }, 15000)
})

onBeforeUnmount(() => {
  clearInterval(ticker)
})

// 持续记录舞台位置，供返回时续播
watch(
  [phase, activeId],
  () => {
    memory.activeId = activeId.value
    memory.phase = phase.value
    memory.logLen = state.log.length
    memory.guest = guest.on
  },
  { immediate: true },
)

/* ---------- 换背景：照片或视频（视频存 IndexedDB，默认定格结尾） ---------- */
const fileEl = ref(null)
const finalePhotoEl = ref(null)
const showPhotoCtl = computed(() =>
  ['interlude', 'choose', 'effect', 'finale'].includes(phase.value),
)
const hasPhoto = computed(() => !!activeScene.value?.photo)
const bgIsVideo = computed(() => isMedia(activeScene.value?.photo) && activeScene.value.photo.kind === 'video')

/** 换背景：照片或视频统一走 fileToMedia（含格式/大小校验）。视频默认定格结尾 */
async function pickBgFile(slot, e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const media = await fileToMedia(f)
    if (media) {
      await applyBg(slot, media)
      // 场景视频上传完弹一次「选项时机」（结算背景没有选项，不弹）
      if (slot === 'scene' && media.kind === 'video') timingSheet.value = true
    }
  } catch {
    /* 读取失败则放弃 */
  }
}

async function applyBg(slot, media) {
  if (slot === 'finale') {
    const p = presets.list.find((x) => x.id === presets.activeId)
    if (!p) return
    if (isMedia(p.finale?.photo)) delMedia(p.finale.photo.id).catch(() => {})
    p.finale = { ...(p.finale ?? {}), photo: media }
    persistPresets()
  } else {
    const s = activeScene.value
    if (!s) return
    if (isMedia(s.photo)) delMedia(s.photo.id).catch(() => {})
    patchScene(presets.activeId, s.id, { photo: media })
  }
}

/** 当前场景背景是视频时，一键在 循环 ⇄ 定格 之间切换 */
function toggleLoop() {
  const s = activeScene.value
  if (!s || !isMedia(s.photo) || s.photo.kind !== 'video') return
  patchScene(presets.activeId, s.id, { photo: { ...s.photo, loop: !s.photo.loop } })
}

async function togglePhoto() {
  const s = activeScene.value
  if (!s) return
  if (s.photo) {
    const label = isMedia(s.photo) && s.photo.kind === 'video' ? '移除这段背景视频？' : '移除这个时刻的照片？'
    if (await confirmBox(label, { danger: true })) {
      if (isMedia(s.photo)) delMedia(s.photo.id).catch(() => {})
      patchScene(presets.activeId, s.id, { photo: null })
    }
  } else {
    fileEl.value?.click()
  }
}

/* 上传场景视频后弹一次「选项时机」；之后随时在节点编辑卡里改 */
const timingSheet = ref(false)
function applyWaitEnd(v) {
  const s = activeScene.value
  if (!s || !isMedia(s.photo) || s.photo.kind !== 'video') return
  patchScene(presets.activeId, s.id, { photo: { ...s.photo, waitEnd: v } })
  timingSheet.value = false
}

/* ---------- 选项等视频播完（galgame 式）：进选择页视频从头播，播完才弹选项；
   循环视频由 SceneBackground 手动续播，第一遍播完同样 emit ended ---------- */
const bgVideoEnded = ref(false)
// 换节点 / 重进选择页 / 换了视频 → 重新等；切循环⇄定格（id 不变）不打断
watch(
  () => [activeId.value, phase.value, isMedia(bgMedia.value) ? bgMedia.value.id : ''],
  () => {
    bgVideoEnded.value = false
  },
)
const choicesWaitVideo = computed(
  () => phase.value === 'choose' && bgIsVideo.value && !!activeScene.value?.photo?.waitEnd && !bgVideoEnded.value,
)

/* ---------- 结算背景：与其他背景同款交互（文案随内容变 / 移除确认 / 视频循环切换） ---------- */
const finaleMedia = computed(() => activePreset.value?.finale?.photo ?? null)
const finaleIsVideo = computed(() => isMedia(finaleMedia.value) && finaleMedia.value.kind === 'video')

/** 结算背景按钮：已有 → 确认移除（移除后回落到最后一幕的背景）；没有 → 打开选图/选视频 */
async function onFinalePhotoBtn() {
  if (!finaleMedia.value) {
    finalePhotoEl.value?.click()
    return
  }
  const label = finaleIsVideo.value ? '移除结算背景视频？' : '移除结算背景照片？'
  if (!(await confirmBox(label, { danger: true }))) return
  const p = presets.list.find((x) => x.id === presets.activeId)
  if (!p) return
  if (isMedia(finaleMedia.value)) delMedia(finaleMedia.value.id).catch(() => {})
  p.finale = { ...(p.finale ?? {}), photo: null }
  persistPresets()
}

/** 结算背景是视频时，一键在 循环 ⇄ 定格 之间切换 */
function toggleFinaleLoop() {
  const m = finaleMedia.value
  const p = presets.list.find((x) => x.id === presets.activeId)
  if (!isMedia(m) || m.kind !== 'video' || !p) return
  p.finale = { ...(p.finale ?? {}), photo: { ...m, loop: !m.loop } }
  persistPresets()
}

/* ---------- 在引子画面上直接换当前段的背景（图/视频，写进预设） ---------- */
const introPhotoEl = ref(null)
async function onIntroPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  const s = activeScene.value
  if (!f || !s) return
  try {
    const media = await fileToMedia(f)
    if (!media) return
    // 当前段用引用比对定位（intros 是过滤后的列表）；一段都没有就当场补一段
    const cur = intros.value[introIndex.value]
    if (isMedia(cur?.photo)) delMedia(cur.photo.id).catch(() => {})
    const list = cur
      ? s.intros.map((it) => (it === cur ? { ...it, photo: media } : it))
      : [...(s.intros ?? []), { text: '', photo: media }]
    patchScene(presets.activeId, s.id, { intros: list })
  } catch {
    /* 放弃 */
  }
}

/* ---------- 在效果演出上直接换背景（图/视频，写进该选项） ---------- */
const effectPhotoEl = ref(null)
async function onEffectPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  const s = activeScene.value
  const ci = effectChoiceIndex.value
  if (!f || !s || ci < 0) return
  try {
    const media = await fileToMedia(f)
    if (!media) return
    if (isMedia(s.choices[ci].effect?.photo)) delMedia(s.choices[ci].effect.photo.id).catch(() => {})
    const choices = s.choices.map((c, i) =>
      i === ci ? { ...c, effect: { text: c.effect?.text ?? '', photo: media } } : c,
    )
    patchScene(presets.activeId, s.id, { choices })
  } catch {
    /* 放弃 */
  }
}

/* ---------- 展示辅助 ---------- */
const topLabel = computed(() => {
  if (phase.value === 'waiting') return clockLabel.value
  if (phase.value === 'finale') return '一日终了'
  const s = activeScene.value
  return s ? `${s.time} · ${s.title.split(' · ')[1]}` : ''
})

/* ---------- 回看：把今天按当时的顺序完整重演——引子 → 选择 → 效果 →（结局），只读 ---------- */
const replayOn = ref(false)
const rpPos = ref(0) // rpTimeline 下标
const rpDbRef = ref(null)
const canReplay = computed(() => state.log.length > 0)
const showReplayCtl = canReplay // 任何一幕都能进回看，落点跟着当下所在的幕走
const canBackfill = computed(() => !!frontier.value) // 当天未走完才能补做（走完夜记已生成，不再收回答）

// 时间线：每段引子一步、每次决定两步（选择现场 + 效果过场）、错过一步；
// 尽头是「此刻」尾巴——当下这幕已经看过的引子（没做的选择不进回看），今天走完则补一步结局
const rpTimeline = computed(() => {
  const steps = []
  state.log.forEach((e, ei) => {
    const node = activePreset.value.nodes[e.sceneId] ?? null
    const intros = (node?.intros ?? []).filter((it) => (it.text ?? '').trim() || it.photo)
    intros.forEach((it, i) => steps.push({ kind: 'intro', e, ei, node, sceneId: e.sceneId, it, i, n: intros.length }))
    // 补做（late）的条目按已选重演：选择现场 + 效果过场；真错过（missed 且未补）只有一步
    steps.push({ kind: e.missed && !e.late ? 'missed' : 'choose', e, ei, node, sceneId: e.sceneId })
    if ((!e.missed || e.late) && node) steps.push({ kind: 'effect', e, ei, node, sceneId: e.sceneId })
  })
  const f = frontier.value
  if (f) {
    // 「此刻」尾巴：只排已经看过的引子——引子中排到当前段为止，选择页排全部引子；
    // 等待 / 效果等还没开场的时刻一个都不排。没做的选择永远翻不到，不剧透
    const node = activePreset.value.nodes[f.id] ?? null
    const all = (node?.intros ?? []).filter((it) => (it.text ?? '').trim() || it.photo)
    let seen = []
    if (phase.value === 'interlude' && activeId.value === f.id) seen = all.slice(0, introIndex.value + 1)
    else if (phase.value === 'choose') seen = all
    seen.forEach((it, i) => steps.push({ kind: 'intro', node, sceneId: f.id, it, i, n: all.length, now: true }))
  } else if (state.log.length) {
    steps.push({ kind: 'finale', sceneId: state.log[state.log.length - 1]?.sceneId ?? null })
  }
  return steps
})
const rpStep = computed(() => rpTimeline.value[rpPos.value] ?? null)
const rpTailStart = computed(() => rpTimeline.value.findIndex((s) => s.now))
/* 页签与计数都以「节点」为单位：已做决定 + 尾巴里有内容的此刻 */
const rpNodeCount = computed(() => state.log.length + (rpTailStart.value >= 0 ? 1 : 0))

/** 进入回看时的落点：跟着当下所在的幕走 */
function rpEntryIndex() {
  const t = rpTimeline.value
  if (!t.length) return 0
  if (t[t.length - 1].kind === 'finale') return t.length - 1 // 今天走完：停在结局
  if (phase.value === 'effect') {
    // 效果过场：停在眼前这个效果
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i].kind === 'effect' && t[i].sceneId === activeId.value) return i
    }
    return t.length - 1
  }
  if (phase.value === 'interlude') {
    // 引子过场：停在眼前这一段（尾巴只排到这一段为止，翻不过去）
    const at = t.findIndex((s) => s.now && s.kind === 'intro' && s.sceneId === activeId.value && s.i === introIndex.value)
    if (at >= 0) return at
    const first = t.findIndex((s) => s.now && s.kind === 'intro' && s.sceneId === activeId.value)
    if (first >= 0) return first
  }
  // 决定页：停在上一幕的收尾；等待 / 错过摘要：停在最后一条已记录的步
  const tail = t.findIndex((s) => s.now)
  return tail > 0 ? tail - 1 : t.length - 1
}

function enterReplay() {
  rpPos.value = rpEntryIndex()
  replayOn.value = true
}

/** 页签跳转：直接翻到第 i 个决定的开头 */
function rpJumpEntry(i) {
  const at = rpTimeline.value.findIndex((s) => s.ei === i)
  if (at >= 0) rpPos.value = at
}

/** 回看补做：给顺流而去的时刻补上回答。条目翻转为 late 后，
    当前步原地变选择现场（高亮补做的选项），轻触继续会走效果过场 */
function rpBackfill(i) {
  const s = rpStep.value
  if (!s || !canBackfill.value) return
  backfill(s.sceneId, i)
}

/* 回看里把错过的全部补完：退出回看时摘要页已无存在的意义，直接落到当前时刻 */
watch([replayOn, trueMissedCount], ([on]) => {
  if (on || phase.value !== 'missed' || trueMissedCount.value > 0) return
  settle()
})

/** 轻触推进，与正常演出一致：先补全打字，再下一段 */
function rpAdvance() {
  if (rpDbRef.value?.isTyping?.()) {
    rpDbRef.value.skip()
    return
  }
  if (rpPos.value < rpTimeline.value.length - 1) rpPos.value += 1
}

/* 各步的画面与文案：画面取现在的剧本，文字优先取当时快照（改剧本不污染回看） */
const rpMedia = computed(() => {
  const s = rpStep.value
  if (!s) return ''
  if (s.kind === 'intro') return s.it.photo ?? ''
  if (s.kind === 'effect') return s.node?.choices?.[s.e?.choiceIndex]?.effect?.photo ?? ''
  if (s.kind === 'finale') {
    const last = state.log[state.log.length - 1]
    const n = activePreset.value.nodes[last?.sceneId]
    return activePreset.value?.finale?.photo ?? n?.photo ?? bundledPhoto(last?.sceneId) ?? ''
  }
  return s.node?.photo ?? bundledPhoto(s.sceneId) ?? ''
})
const rpBgKey = computed(() => {
  const s = rpStep.value
  const n = s?.node ?? activePreset.value.nodes[state.log[state.log.length - 1]?.sceneId]
  return n ? bgKeyOf(n) : 'noon'
})
const rpTime = computed(() => rpStep.value?.e?.snap?.time ?? rpStep.value?.node?.time ?? '')
const rpTitle = computed(() => rpStep.value?.e?.snap?.title ?? rpStep.value?.node?.title ?? '')
const rpIntroText = computed(() => (rpStep.value?.kind === 'intro' ? (rpStep.value.it.text ?? '').trim() : ''))
const rpNarr = computed(() => rpStep.value?.node?.narration ?? '')
const rpChoiceText = computed(() => {
  const s = rpStep.value
  if (!s) return ''
  return s.node?.choices?.[s.e?.choiceIndex]?.text ?? s.e?.snap?.choiceText ?? '……'
})
const rpChoices = computed(() => {
  const s = rpStep.value
  if (s?.kind !== 'choose') return []
  const list = s.node?.choices ?? []
  return list.length ? list : [{ text: s.e?.snap?.choiceText ?? '……' }]
})
const rpChosen = computed(() => {
  const s = rpStep.value
  if (s?.kind !== 'choose' || !s.e) return -1 // 「此刻」还没选：都不高亮
  return s.node?.choices?.length ? s.e.choiceIndex : 0
})
const rpEffectText = computed(() => {
  const s = rpStep.value
  if (s?.kind !== 'effect') return ''
  const c = s.node?.choices?.[s.e?.choiceIndex]
  return (c?.effect?.text?.trim() || c?.feedback || '').trim()
})
const rpReflect = computed(() => rpStep.value?.e?.snap?.reflect ?? '')
/* 补做可用性：当天未走完、当前步是未补的错过步、且该节点有选项可选 */
const rpCanPick = computed(
  () => canBackfill.value && rpStep.value?.kind === 'missed' && !!rpStep.value.node?.choices?.length,
)
const rpMissedText = computed(() => {
  if (rpStep.value?.kind !== 'missed') return ''
  if (rpCanPick.value) return '这个时刻已经过去，你的回答迟到了。要现在补上吗？'
  return `（这个时刻没有等到你的回答，顺流而去了。状态 ${fmtDelta(rpStep.value.e.delta)}。）`
})
const rpFinaleText = computed(() => `一天到此为止。${tier.value.label}——${tier.value.phrase}。`)
/* 底部小标签：现在翻到第几个节点（与页签一一对应） */
const rpWhere = computed(() => {
  const s = rpStep.value
  if (!s) return ''
  if (s.kind === 'finale') return '一日终了'
  const seg = s.kind === 'intro' ? ` · 引子 ${s.i + 1}/${s.n}` : ''
  if (s.now) return `此刻${seg}`
  return `回溯 ${(s.ei ?? 0) + 1} / ${rpNodeCount.value}${seg}`
})
const showDeltaFloat = computed(() =>
  deltaKey.value > 0 && ['effect', 'missed'].includes(phase.value),
)
const deltaClass = computed(() =>
  lastDelta.value > 0 ? 'good' : lastDelta.value < 0 ? 'bad' : 'zero',
)
</script>

<template>
  <div class="stage" :class="{ immersive }" @click="onStageTap">
    <SceneBackground
      :media="bgMedia"
      :bg-key="bgKey"
      :replay="activeId + ':' + phase"
      :style="bgStyle"
      class="scene-bg"
      @ended="bgVideoEnded = true"
    />
    <div class="scene-fog" :style="{ opacity: fogOpacity }" />

    <header class="stage-top">
      <button class="chip ghost stage-menu" aria-label="菜单" @click.stop="openDrawer()">☰</button>
      <span class="chip">{{ topLabel }}</span>
      <GloomMeter :value="displayGloom" :tier="tier" compact class="grow" />
    </header>

    <div v-if="showPhotoCtl && !guest.on" class="stage-photo-ctl" :class="{ down: showReplayCtl }">
      <template v-if="phase === 'finale'">
        <button class="chip ghost small" @click.stop="onFinalePhotoBtn">
          {{ !finaleMedia ? '换背景（图/视频）' : finaleIsVideo ? '移除视频' : '移除照片' }}
        </button>
        <button v-if="finaleIsVideo" class="chip ghost small" @click.stop="toggleFinaleLoop">
          播放：{{ finaleMedia.loop ? '循环' : '定格' }}
        </button>
      </template>
      <template v-else>
        <button class="chip ghost small" @click.stop="togglePhoto">
          {{ !hasPhoto ? '换背景（图/视频）' : bgIsVideo ? '移除视频' : '移除照片' }}
        </button>
        <button v-if="bgIsVideo" class="chip ghost small" @click.stop="toggleLoop">
          播放：{{ activeScene.photo.loop ? '循环' : '定格' }}
        </button>
      </template>
      <input ref="fileEl" type="file" accept="image/*,video/*" hidden @click.stop @change="pickBgFile('scene', $event)" />
      <input ref="introPhotoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="onIntroPhoto" />
      <input ref="effectPhotoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="onEffectPhoto" />
      <input ref="finalePhotoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="pickBgFile('finale', $event)" />
    </div>
    <!-- 上传视频背景后的「选项时机」弹层（内部 Teleport 到 body） -->
    <TimingSheet v-if="timingSheet && !guest.on" @pick="applyWaitEnd" @close="timingSheet = false" />
    <!-- 回看入口：任何一幕都在，进回看时落在当前这一幕 -->
    <button v-if="showReplayCtl" class="chip ghost small rp-enter" @click.stop="enterReplay">‹ 回溯</button>

    <div v-if="showDeltaFloat" :key="deltaKey" class="delta-float" :class="deltaClass">
      状态 {{ fmtDelta(lastDelta) }}
    </div>

    <transition name="cut">
      <div
        v-if="phase === 'interlude'"
        class="interlude"
        :class="{ 'has-photo': !!introBg, 'has-text': !!introText }"
      >
        <SceneBackground
          v-if="introBg"
          :media="introBg"
          :bg-key="bgKeyOf(activeScene)"
          :replay="'in:' + introIndex"
          class="in-bg"
        />
        <template v-if="introText">
          <div class="in-head">
            <div class="in-time small serif">{{ activeScene?.time }}</div>
            <div class="in-title small">{{ activeScene?.title }}</div>
            <div v-if="intros.length > 1" class="in-count">引子 {{ introIndex + 1 }} / {{ intros.length }}</div>
          </div>
          <DialogueBox
            ref="introDbRef"
            variant="bare"
            :text="introText"
            :speed="42"
            @done="introDone = true"
          />
        </template>
        <template v-else>
          <div class="in-time serif">{{ activeScene?.time }}</div>
          <div class="in-line" />
          <div class="in-title serif">{{ activeScene?.title }}</div>
        </template>
        <div v-if="!guest.on" class="in-tools">
          <button class="chip dark small" @click.stop="introPhotoEl?.click()">换引子背景</button>
        </div>
        <div class="in-hint">轻触继续</div>
      </div>
    </transition>

    <!-- 选择后的效果演出：全屏演出，照片/视频与文字随选项定制 -->
    <transition name="cut">
      <div
        v-if="phase === 'effect'"
        class="interlude"
        :class="{ 'has-photo': !!effectBg, 'has-text': !!effectText }"
      >
        <SceneBackground
          v-if="effectBg"
          :media="effectBg"
          :bg-key="bgKeyOf(activeScene)"
          :replay="'ef:' + effectChoiceIndex"
          class="in-bg"
        />
        <div v-if="effectChoice" class="in-head">
          <div class="in-title small">「{{ effectChoice.text }}」</div>
        </div>
        <DialogueBox
          v-if="effectText"
          ref="effectDbRef"
          variant="bare"
          :text="effectText"
          :speed="38"
          @done="effectDone = true"
        />
        <div class="in-tools two">
          <button v-if="!guest.on" class="chip dark small" @click.stop="effectPhotoEl?.click()">换效果背景</button>
          <button
            v-if="effectDone || !effectText"
            class="chip dark small go"
            @click.stop="settle()"
          >继续 ▸</button>
        </div>
        <div v-if="!effectDone && effectText" class="in-hint">轻触继续</div>
      </div>
    </transition>

    <!-- 选项：屏幕正中，与旁白同时出现 -->
    <div class="stage-choices">
      <transition name="rise">
        <ChoiceList
          v-if="phase === 'choose' && activeScene && !choicesWaitVideo"
          :choices="activeScene.choices"
          @choose="pick"
        />
      </transition>
    </div>

    <footer class="stage-bottom">
      <DialogueBox ref="dbRef" :text="phase === 'missed' ? missedSummary : dialogue" :tag="dialogueTag" />
      <div v-if="phase === 'missed'" class="under">
        <button class="btn primary" @click.stop="advance">继续 ▸</button>
      </div>
      <div v-else-if="phase === 'waiting'" class="under">
        <button class="btn ghost" @click.stop="openDrawer()">查看汇总</button>
      </div>
      <div v-else-if="phase === 'finale'" class="under">
        <button class="btn primary" @click.stop="nav('/report')">查看今日总结 ›</button>
      </div>
    </footer>

    <!-- 回看：按当时的顺序完整重演——引子 → 选择 → 效果 →（结局），只读，轻触推进 -->
    <transition name="rise">
      <div v-if="replayOn && rpStep" class="replay" @click.stop="rpAdvance">
        <!-- 选择现场：当时的旁白与选项，选中的那支高亮；「此刻」还没选则都不亮 -->
        <template v-if="rpStep.kind === 'choose'">
          <SceneBackground :media="rpMedia" :bg-key="rpBgKey" :replay="'rp:' + rpPos" class="rp-scene" />
          <div class="rp-choose">
            <span v-if="rpStep.e?.late" class="rp-late">补做</span>
            <div class="stage-choices">
              <ChoiceList :choices="rpChoices" :chosen="rpChosen" readonly />
            </div>
            <div class="rp-dialog">
              <DialogueBox :key="'c' + rpPos" ref="rpDbRef" :text="rpNarr" :tag="rpTitle" />
            </div>
          </div>
        </template>

        <!-- 引子段：与正常过场同款 -->
        <div v-else-if="rpStep.kind === 'intro'" class="interlude" :class="{ 'has-photo': !!rpMedia, 'has-text': !!rpIntroText }">
          <SceneBackground v-if="rpMedia" :media="rpMedia" :bg-key="rpBgKey" :replay="'rp:' + rpPos" class="in-bg" />
          <template v-if="rpIntroText">
            <div class="in-head">
              <div class="in-time small serif">{{ rpTime }}</div>
              <div class="in-title small">{{ rpTitle }}</div>
              <div v-if="rpStep.n > 1" class="in-count">引子 {{ rpStep.i + 1 }} / {{ rpStep.n }}</div>
            </div>
            <DialogueBox :key="'i' + rpPos" ref="rpDbRef" variant="bare" :text="rpIntroText" :speed="42" />
          </template>
          <template v-else>
            <div class="in-time serif">{{ rpTime }}</div>
            <div class="in-line" />
            <div class="in-title serif">{{ rpTitle }}</div>
          </template>
        </div>

        <!-- 效果过场：与正常演出同款 -->
        <div v-else-if="rpStep.kind === 'effect'" class="interlude" :class="{ 'has-photo': !!rpMedia, 'has-text': !!rpEffectText }">
          <SceneBackground v-if="rpMedia" :media="rpMedia" :bg-key="rpBgKey" :replay="'rp:' + rpPos" class="in-bg" />
          <div class="in-head">
            <div class="in-title small">「{{ rpChoiceText }}」</div>
          </div>
          <DialogueBox v-if="rpEffectText" :key="'e' + rpPos" ref="rpDbRef" variant="bare" :text="rpEffectText" :speed="38" />
          <p class="rp-delta" :class="rpStep.e.delta > 0 ? 'good' : rpStep.e.delta < 0 ? 'bad' : 'zero'">
            状态 {{ fmtDelta(rpStep.e.delta) }}<template v-if="rpStep.e?.late">（顺流时已计入）</template>
          </p>
          <p v-if="rpReflect" class="rp-reflect">{{ rpReflect }}</p>
        </div>

        <!-- 错过：顺流而去的时刻。当天未走完时可当场补上回答（补做） -->
        <div v-else-if="rpStep.kind === 'missed'" class="interlude" :class="{ 'has-photo': !!rpMedia }">
          <SceneBackground v-if="rpMedia" :media="rpMedia" :bg-key="rpBgKey" :replay="'rp:' + rpPos" class="in-bg" />
          <div class="in-time serif">{{ rpTime }}</div>
          <div class="in-line" />
          <div class="in-title serif">{{ rpTitle }}</div>
          <DialogueBox :key="'m' + rpPos" ref="rpDbRef" variant="bare" :text="rpMissedText" :speed="38" />
          <div v-if="rpCanPick" class="rp-backfill" @click.stop>
            <ChoiceList :choices="rpStep.node?.choices ?? []" @choose="rpBackfill" />
          </div>
          <div v-else-if="rpStep.node?.choices?.length" class="in-hint">轻触继续</div>
        </div>

        <!-- 结局：一天走完时的收尾 -->
        <div v-else class="interlude" :class="{ 'has-photo': !!rpMedia }">
          <SceneBackground v-if="rpMedia" :media="rpMedia" :bg-key="rpBgKey" :replay="'rp:' + rpPos" class="in-bg" />
          <div class="in-time serif">一日终了</div>
          <div class="in-line" />
          <DialogueBox :key="'f' + rpPos" ref="rpDbRef" variant="bare" :text="rpFinaleText" :speed="38" />
        </div>

        <!-- 底部控制坞：进度、页签、按钮全部收在中下 -->
        <footer class="rp-dock" @click.stop>
          <p class="rp-where">{{ rpWhere }}</p>
          <div class="rp-nav">
            <button class="btn ghost" :disabled="rpPos === 0" @click.stop="rpPos -= 1">‹ 早一步</button>
            <span class="rp-dots">
              <i
                v-for="(e, i) in state.log"
                :key="i"
                :class="{ on: rpStep.ei === i }"
                @click.stop="rpJumpEntry(i)"
              />
              <i v-if="rpTailStart >= 0" class="now" :class="{ on: !!rpStep.now }" @click.stop="rpPos = rpTailStart" />
            </span>
            <button class="btn ghost" :disabled="rpPos === rpTimeline.length - 1" @click.stop="rpPos += 1">
              晚一步 ›
            </button>
          </div>
          <button class="btn primary big rp-back" @click.stop="replayOn = false">回到此刻</button>
        </footer>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

/* 沉浸模式：点 UI 之外隐藏全部界面，完整看图 */
.stage-top,
.stage-photo-ctl,
.rp-enter,
.stage-choices,
.stage-bottom,
.delta-float,
.interlude {
  transition: opacity 0.3s ease;
}
.stage.immersive .stage-top,
.stage.immersive .stage-photo-ctl,
.stage.immersive .rp-enter,
.stage.immersive .stage-choices,
.stage.immersive .stage-bottom,
.stage.immersive .delta-float,
.stage.immersive .interlude {
  opacity: 0;
  pointer-events: none;
}

/* ---- 背景层（渐变/照片/视频统一在 SceneBackground 组件里） ---- */
.scene-bg { transition: filter 0.8s ease; }

.scene-fog {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 80% at 50% 110%, rgba(235, 232, 225, 0.9), rgba(235, 232, 225, 0.35) 60%, rgba(235, 232, 225, 0.1)),
    linear-gradient(180deg, rgba(226, 223, 216, 0.55), rgba(226, 223, 216, 0.75));
  transition: opacity 1s ease;
}

/* ---- 顶栏与控件 ---- */
.stage-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(14px + env(safe-area-inset-top)) 16px 10px;
}
.grow { margin-left: auto; }
/* ☰ 抽屉入口：方形一点，手指点按友好 */
.stage-menu {
  font-size: 14px;
  padding: 5px 13px 5px;
  line-height: 1;
}
.chip {
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(51, 48, 43, 0.12);
  border-radius: 999px;
  padding: 5px 12px;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  cursor: pointer;
  white-space: nowrap;
}
.chip.ghost { background: rgba(255, 255, 255, 0.55); }
.chip.small { font-size: 11px; padding: 4px 10px; color: var(--ink-2); }
.chip.dark {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(245, 241, 232, 0.3);
  color: #F5F1E8;
}
.stage-photo-ctl {
  position: absolute;
  top: calc(56px + env(safe-area-inset-top));
  right: 16px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.stage-photo-ctl.down { top: calc(94px + env(safe-area-inset-top)); } /* 上面让位给「回看」入口 */
/* 回看入口：任何一幕都在（过场页 z-index 更高，所以要盖过它） */
.rp-enter {
  position: absolute;
  top: calc(56px + env(safe-area-inset-top));
  right: 16px;
  z-index: 6;
}

/* ---- 状态变化浮标 ---- */
.delta-float {
  position: absolute;
  top: calc(96px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  padding: 7px 16px;
  border-radius: 999px;
  color: #FBFAF7;
  font-size: 13px;
  letter-spacing: 0.12em;
  box-shadow: 0 8px 22px rgba(60, 50, 30, 0.18);
  animation: delta-float 2.2s ease forwards;
  pointer-events: none;
}
.delta-float.good { background: var(--good); }
.delta-float.bad { background: var(--bad); }
.delta-float.zero { background: var(--ink-2); }
@keyframes delta-float {
  0% { opacity: 0; transform: translate(-50%, 8px); }
  12% { opacity: 1; transform: translate(-50%, 0); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -14px); }
}

/* ---- 过场：时刻切换（可自定义照片背景与文字） ---- */
.interlude {
  position: absolute;
  inset: 0;
  z-index: 5;
  background-color: #2B2823;
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 16px;
  /* 底部预留按钮区（换背景/继续 + 提示），长文字居中也不会钻进去 */
  padding: 0 34px calc(104px + env(safe-area-inset-bottom));
  text-align: center;
  color: #F5F1E8;
}
.interlude.has-photo::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(30, 27, 23, 0.42);
}
.interlude > *:not(.in-bg):not(.in-tools):not(.in-hint) { position: relative; }
.in-time { font-size: 40px; letter-spacing: 0.2em; text-indent: 0.2em; }
.in-time.small { font-size: 15px; letter-spacing: 0.24em; opacity: 0.85; }
.in-line { width: 34px; height: 1px; background: rgba(245, 241, 232, 0.35); }
.in-title { font-size: 14px; letter-spacing: 0.4em; text-indent: 0.4em; color: rgba(245, 241, 232, 0.72); }
.in-title.small { font-size: 12px; }
.in-head { display: flex; flex-direction: column; gap: 8px; align-items: center; margin-bottom: 26px; }
.in-count { font-size: 10px; letter-spacing: 0.2em; color: rgba(245, 241, 232, 0.45); }
.in-tools {
  position: absolute;
  bottom: calc(62px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
}
.in-tools.two { gap: 10px; }
.in-hint {
  position: absolute;
  bottom: calc(30px + env(safe-area-inset-bottom));
  font-size: 11px;
  letter-spacing: 0.3em;
  color: rgba(245, 241, 232, 0.38);
  animation: in-hint 2s ease infinite;
}
@keyframes in-hint { 50% { opacity: 0.4; } }
/* 过场/效果页：进入时瞬间不透明（电影硬切，避免淡入时透出底下已切换的场景照片），离开时淡出揭示场景 */
.cut-leave-active { transition: opacity 0.45s ease; }
.cut-leave-to { opacity: 0; }

/* ---- 回看层：按当时顺序完整重演（只读，轻触推进）；控制全收在底部坞里 ---- */
.replay {
  position: absolute;
  inset: 0;
  z-index: 8;
  overflow: hidden;
  background: #2B2823; /* 与过场底色一致：没配照片的画面不露底 */
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
}
.rp-scene { position: absolute; inset: 0; }
/* 过场画面抬高底部留白，给控制坞让位 */
.replay .interlude { padding-bottom: calc(158px + env(safe-area-inset-bottom)); }
/* 选择现场：选项居中同主舞台，旁白抬到控制坞上方 */
.rp-choose {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(152px + env(safe-area-inset-bottom));
}
/* 补做徽标 */
.rp-late {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(245, 241, 232, 0.85);
  border: 1px solid rgba(245, 241, 232, 0.4);
  border-radius: 999px;
  padding: 3px 10px;
  z-index: 2;
}
/* 补做选项：搁在提示行上方，点选项不触发轻触翻页 */
.rp-backfill {
  margin-top: 14px;
  width: min(100%, 340px);
  align-self: center;
}
.rp-dialog { position: relative; margin-top: auto; padding: 0 16px; }
/* 回看里旁白框不拦截点击：轻触统一走「先补全打字、再翻页」 */
.rp-dialog :deep(.dbox) { pointer-events: none; }
/* 底部控制坞：进度在哪、页签、回到此刻，全部集中在中下 */
.rp-dock {
  position: relative;
  z-index: 6;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 6px 18px calc(14px + env(safe-area-inset-bottom));
}
.rp-where {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-2);
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border-radius: 999px;
  padding: 3px 12px;
}
.rp-nav { display: flex; align-items: center; justify-content: center; gap: 12px; }
/* 覆盖 btn.ghost 的透明底：照片背景上必须看得清 */
.rp-nav .btn.ghost {
  padding: 9px 16px;
  font-size: 13px;
  color: var(--ink);
  background: rgba(252, 250, 246, 0.88);
  border: 1px solid rgba(51, 48, 43, 0.14);
  border-radius: 999px;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.rp-nav .btn.ghost:hover { border-color: var(--ink-2); background: rgba(255, 255, 255, 0.95); }
.rp-nav .btn:disabled { opacity: 0.35; cursor: default; }
/* 页签：一颗＝一个决定，可点跳转；末尾一颗＝此刻 */
.rp-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 46%;
  overflow: hidden;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.rp-dots i {
  box-sizing: content-box;
  width: 6px;
  height: 6px;
  padding: 5px 4px; /* 可点范围放大，视觉上仍是一颗小点 */
  background-clip: content-box;
  border-radius: 999px;
  background-color: var(--line);
  flex: none;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}
.rp-dots i.on { background-color: var(--ink); transform: scale(1.15); }
.rp-back { flex: none; }
/* 效果 / 错过页的深底文字 */
.rp-delta {
  margin: 4px 0 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
  color: rgba(245, 241, 232, 0.55);
}
.rp-delta.good { color: #9CC5BE; }
.rp-delta.bad { color: #D89A8C; }
.rp-reflect {
  margin: 10px 0 0;
  max-width: 30em;
  font-size: 12.5px;
  line-height: 1.9;
  color: rgba(245, 241, 232, 0.62);
}

/* ---- 居中选项层 ---- */
.stage-choices {
  position: absolute;
  left: 50%;
  top: 43%;
  transform: translate(-50%, -50%);
  width: min(400px, calc(100% - 44px));
  z-index: 3;
}

/* ---- 底部：对话框 ---- */
.stage-bottom {
  position: relative;
  margin-top: auto;
  padding: 0 16px calc(18px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.under { display: flex; justify-content: flex-end; }
</style>
