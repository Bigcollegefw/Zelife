<script setup>
import { computed, ref } from 'vue'
import { useGame, toMinutes, bgKeyOf } from '../store.js'
import { confirmBox } from '../confirm.js'
import { isMedia, delMedia, fileToMedia } from '../media.js'
import TimingSheet from './TimingSheet.vue'

/** 缩略图：视频用首帧 poster，照片用原图；视频加 ▶ 角标 */
const srcOf = (p) => (isMedia(p) ? p.poster || '' : p || '')
const isVid = (p) => isMedia(p) && p.kind === 'video'
const photoSrc = computed(() => srcOf(props.scene.photo))

// 单个时刻的完整编辑卡：聚焦视图（全尺寸）与画布展开态（mini）共用。
const props = defineProps({
  scene: { type: Object, required: true },
  mini: { type: Boolean, default: false }, // 画布展开态的紧凑版
  ro: { type: Boolean, default: false }, // 访客只读：一切编辑入口禁用（M2 分享）
})
const emit = defineEmits(['delete'])

// 基调不再手选：按时刻自动定（晨光/午后/暮色/夜色），照片占位色与运行时背景共用一套推导
const bgKey = computed(() => bgKeyOf(props.scene))

const { presets, allNodes, isMerge, patchScene, addNode } = useGame()

/* ---------- 文本域自动增高：手机上完整显示，不用翻动 ----------
   挂载时同步量高、一帧后复核，输入时即时量高（勿用 updated 钩子——曾致量测回环卡死）。
   画布展开卡挂载时还处于收窄宽度（卡宽有过渡动画），换行数随后才变：
   用 ResizeObserver 监宽度变化后重新量高——只认宽度变化触发，
   量高自身引起的高度变化不会再触发，无回环 ---------- */
function sizeTextarea(el) {
  el.style.height = 'auto'
  // 下限只防极小字号：单行按内容收紧，不留人为空隙（空隙会把文字顶离横线）
  el.style.height = Math.max(el.scrollHeight, 28) + 'px'
}
const vAutogrow = {
  mounted(el) {
    const size = () => sizeTextarea(el)
    el.__autogrow = size
    el.addEventListener('input', size)
    el.__lastW = el.clientWidth
    el.__ro = new ResizeObserver(() => {
      if (el.clientWidth !== el.__lastW) {
        el.__lastW = el.clientWidth
        size()
      }
    })
    el.__ro.observe(el)
    size()
    requestAnimationFrame(size)
  },
  unmounted(el) {
    el.removeEventListener('input', el.__autogrow)
    el.__ro?.disconnect()
  },
}

/* ---------- 走向：底部弹层（手指点按友好） ---------- */
const OPT_NUMS = ['①', '②', '③', '④']
// 只列更晚的时刻：箭头永远向前，不会绕回过去
const gotoOptions = computed(() => {
  const t = toMinutes(props.scene.time)
  return allNodes.value
    .filter((n) => toMinutes(n.time) > t)
    .map((n) => ({
      v: n.id,
      label: `${n.time} · ${n.title}${isMerge(n.id) ? '（合流）' : ''}`,
    }))
})
const gotoSheet = ref(null) // { choice } 当前在设置走向的决策

function gotoLabel(c) {
  if (c.to == null) return '结束这一天（夜记）'
  const n = allNodes.value.find((x) => x.id === c.to)
  return n ? `${n.time} · ${n.title}${isMerge(n.id) ? '（合流）' : ''}` : '未接续…'
}

function setGoto(v) {
  const c = gotoSheet.value?.choice
  if (!c) return
  if (v === '__new') {
    // 新分支默认接在 30 分钟后，保证时刻向前
    const t = Math.min(toMinutes(props.scene.time) + 30, 23 * 60 + 59)
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    const id = addNode(presets.activeId, { time: `${hh}:${mm}` })
    if (id) c.to = id
  } else if (v === '__end') {
    c.to = null
  } else {
    c.to = v
  }
  gotoSheet.value = null
}

/* ---------- 改时刻：改完后所有箭头仍必须指向更晚 ----------
   不影响任何连线（如下午五点改到四点）→ 直接改；
   会让某条箭头指回更早 → 提示，确认则断开那些连线，取消则还原 */
async function onTimeChange(e) {
  const nt = e.target.value
  const old = props.scene.time
  if (!nt || nt === old) return
  const t = toMinutes(nt)
  const p = presets.list.find((x) => x.id === presets.activeId)
  if (!p) return
  const breaks = []
  // 出边：目标时刻不得早于或等于新时刻
  for (const c of props.scene.choices ?? []) {
    const to = c.to && p.nodes[c.to] ? p.nodes[c.to] : null
    if (to && toMinutes(to.time) <= t) breaks.push({ c, line: `本节点 → ${to.time} ${to.title}` })
  }
  // 入边：来源时刻必须严格早于新时刻
  for (const n of Object.values(p.nodes)) {
    if (n.id === props.scene.id) continue
    for (const c of n.choices ?? []) {
      if (c.to === props.scene.id && toMinutes(n.time) >= t) {
        breaks.push({ c, line: `${n.time} ${n.title} → 本节点` })
      }
    }
  }
  if (!breaks.length) {
    props.scene.time = nt // 不影响正常连线，直接改
    props.scene.bgKey = bgKeyOf(props.scene) // 基调跟着时刻走
    return
  }
  const body =
    '这些箭头会指向不更晚的时刻（不被允许）：\n' +
    breaks.map((b) => `· ${b.line}`).join('\n') +
    '\n\n断开后这些决策将改为「结束这一天」。'
  if (await confirmBox(`改成 ${nt} 需要断开 ${breaks.length} 条连线`, { body, danger: true })) {
    props.scene.time = nt
    props.scene.bgKey = bgKeyOf(props.scene)
    breaks.forEach((b) => (b.c.to = null))
  } else {
    e.target.value = old
  }
}

/* ---------- 背景：场景 / 引子 / 选项效果（照片或视频，统一入 IndexedDB） ---------- */
const photoEl = ref(null)
async function onPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const media = await fileToMedia(f) // 含格式 / 大小校验；视频默认定格结尾
    if (!media) return
    if (isMedia(props.scene.photo)) delMedia(props.scene.photo.id).catch(() => {})
    patchScene(presets.activeId, props.scene.id, { photo: media })
    // 传的是视频 → 弹一次「选项时机」（照片不弹；之后随时用下方开关改）
    if (media.kind === 'video') timingSheet.value = true
  } catch {
    /* 放弃 */
  }
}
async function clearPhoto() {
  const p = props.scene.photo
  if (p && (await confirmBox(isMedia(p) ? '移除这个时刻的背景？' : '移除这个时刻的照片？', { danger: true }))) {
    if (isMedia(p)) delMedia(p.id).catch(() => {})
    patchScene(presets.activeId, props.scene.id, { photo: null })
  }
}
/** 背景视频专设：选项等视频播完再弹出（galgame 式演出）；循环视频在第一遍播完时弹 */
function toggleWaitEnd() {
  const p = props.scene.photo
  if (!isVid(p)) return
  patchScene(presets.activeId, props.scene.id, { photo: { ...p, waitEnd: !p.waitEnd } })
}
/* 上传视频后的一次性「选项时机」选择 */
const timingSheet = ref(false)
function applyWaitEnd(v) {
  const p = props.scene.photo
  if (!isVid(p)) return
  patchScene(presets.activeId, props.scene.id, { photo: { ...p, waitEnd: v } })
  timingSheet.value = false
}

const introPhotoEl = ref(null)
const introIdx = ref(0)
function setIntroPhoto(idx, photo) {
  const intros = (props.scene.intros ?? []).map((it, i) => (i === idx ? { ...it, photo } : it))
  patchScene(presets.activeId, props.scene.id, { intros })
}
async function onIntroPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const media = await fileToMedia(f)
    if (!media) return
    const old = props.scene.intros?.[introIdx.value]?.photo
    if (isMedia(old)) delMedia(old.id).catch(() => {})
    setIntroPhoto(introIdx.value, media)
  } catch {
    /* 放弃 */
  }
}
async function clearIntroPhoto(idx) {
  const old = props.scene.intros?.[idx]?.photo
  if (old && (await confirmBox(isVid(old) ? '移除这段引子的背景视频？' : '移除这段引子的照片？', { danger: true }))) {
    if (isMedia(old)) delMedia(old.id).catch(() => {})
    setIntroPhoto(idx, null)
  }
}

const effectPhotoEl = ref(null)
const effectIdx = ref(0)
function setEffectPhoto(idx, photo) {
  const choices = (props.scene.choices ?? []).map((c, i) =>
    i === idx ? { ...c, effect: { text: c.effect?.text ?? '', photo } } : c,
  )
  patchScene(presets.activeId, props.scene.id, { choices })
}
async function onEffectPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const media = await fileToMedia(f)
    if (!media) return
    const old = props.scene.choices?.[effectIdx.value]?.effect?.photo
    if (isMedia(old)) delMedia(old.id).catch(() => {})
    setEffectPhoto(effectIdx.value, media)
  } catch {
    /* 放弃 */
  }
}
async function clearEffectPhoto(idx) {
  const old = props.scene.choices?.[idx]?.effect?.photo
  if (old && (await confirmBox(isVid(old) ? '移除这个选项的效果视频？' : '移除这个选项的效果照片？', { danger: true }))) {
    if (isMedia(old)) delMedia(old.id).catch(() => {})
    setEffectPhoto(idx, null)
  }
}
</script>

<template>
  <section class="card ev" :class="{ mini }">
    <!-- 引子在运行时最先播放（逐段轻触推进），编辑区放在整张卡最前面；
         rows=1 同旁白：空框只占一行，文字贴住横线 -->
    <div class="ev-intros">
      <div v-for="(it, idx) in scene.intros" :key="idx" class="ev-intro">
        <button
          type="button"
          class="ev-photo intro"
          :class="{ has: it.photo }"
          style="width: 48px; height: 64px"
          @click="!ro && (it.photo ? clearIntroPhoto(idx) : ((introIdx = idx), introPhotoEl?.click()))"
          :title="it.photo ? '点按可移除引子背景' : '点按上传引子照片/视频'"
        >
          <img v-if="srcOf(it.photo)" :src="srcOf(it.photo)" alt="" />
          <span v-else class="ev-photo-add">＋引子</span>
          <i v-if="isVid(it.photo)" class="ev-vid-mark">▶</i>
        </button>
        <textarea
          v-model="it.text"
          v-autogrow
          rows="1"
          class="fi"
          :readonly="ro"
          :placeholder="`引子 ${idx + 1}：抉择前的一段叙述（逐段轻触播放）`"
        />
        <button v-if="!ro" class="ev-del" title="删除这段引子" @click="scene.intros.splice(idx, 1)">✕</button>
      </div>
      <button v-if="!ro" class="ev-addc" @click="scene.intros.push({ text: '', photo: null })">＋ 添加引子</button>
    </div>

    <div class="ev-top">
      <button
        type="button"
        class="ev-photo"
        :class="[`sw-${bgKey}`, { has: scene.photo }]"
        style="width: 64px; height: 84px"
        @click="!ro && (scene.photo ? clearPhoto() : photoEl?.click())"
        :title="scene.photo ? '点按可移除背景' : '点按上传照片/视频'"
      >
        <img v-if="photoSrc" :src="photoSrc" alt="" />
        <span v-else class="ev-photo-add">＋背景</span>
        <i v-if="isVid(scene.photo)" class="ev-vid-mark">▶ 视频</i>
      </button>
      <div class="ev-meta">
        <div class="ev-row">
          <input :value="scene.time" type="time" class="fi time" :readonly="ro" @change="onTimeChange" />
          <textarea v-model="scene.title" v-autogrow rows="1" class="fi grow" :readonly="ro" placeholder="标题，如 清晨 · 卧室" />
        </div>
        <!-- 旁白占原基调下拉的位置；基调按时刻自动定。rows=1：空框只占一行，文字贴住横线 -->
        <textarea v-model="scene.narration" v-autogrow rows="1" class="fi" :readonly="ro" placeholder="旁白：这个时刻的场景与处境" />
      </div>
      <button class="ev-del" title="删除时刻" @click="emit('delete', scene)">✕</button>
    </div>

    <!-- 背景是视频时的选项弹出时机：立即（默认）或等视频播完（循环视频=第一遍播完） -->
    <div v-if="!ro && isVid(scene.photo)" class="ev-crow ev-waitend">
      <span class="ev-delta-label">选项时机</span>
      <button type="button" class="ev-waitend-btn" :class="{ on: scene.photo.waitEnd }" @click="toggleWaitEnd">
        {{ scene.photo.waitEnd ? '视频播完再弹出' : '与旁白同时出现' }}
      </button>
    </div>

    <!-- 节点 = 引子 + 选项 + 效果：选项区开头标出来；块旁的 ①② 与画布箭头序号对应 -->
    <span class="ev-sec">选项</span>

    <div v-for="(c, i) in scene.choices" :key="i" class="ev-choice">
      <div class="ev-crow">
        <span class="ev-optnum" :title="`决策 ${i + 1}（与画布箭头对应）`">{{ OPT_NUMS[i] ?? i + 1 }}</span>
        <textarea v-model="c.text" v-autogrow rows="1" class="fi grow" :readonly="ro" :placeholder="`决策 ${i + 1}`" />
        <button v-if="!ro && scene.choices.length > 2" class="ev-del small" @click="scene.choices.splice(i, 1)">✕</button>
      </div>
      <div class="ev-crow">
        <span class="ev-delta-label">状态</span>
        <input
          v-model.number="c.delta"
          type="number"
          min="-50"
          max="50"
          step="1"
          class="fi delta-input"
          :readonly="ro"
          title="正数状态回升，负数状态下滑，可直接输入"
        />
        <span class="delta-hint" :class="c.delta > 0 ? 'good' : c.delta < 0 ? 'bad' : 'zero'">
          {{ c.delta > 0 ? '回升' : c.delta < 0 ? '下滑' : '无影响' }}
        </span>
      </div>
      <div class="ev-crow ev-goto">
        <span class="ev-goto-label">走向</span>
        <button type="button" class="ev-goto-btn grow" :disabled="ro" @click="gotoSheet = { choice: c }">
          <span>{{ gotoLabel(c) }}</span><i>›</i>
        </button>
      </div>
      <textarea v-model="c.feedback" v-autogrow rows="1" class="fi" :readonly="ro" placeholder="选择后的反馈旁白" />
      <div class="ev-crow ev-effect">
        <button
          type="button"
          class="ev-photo effect"
          :class="{ has: c.effect?.photo }"
          style="width: 40px; height: 52px"
          @click="!ro && (c.effect?.photo ? clearEffectPhoto(i) : ((effectIdx = i), effectPhotoEl?.click()))"
          :title="c.effect?.photo ? '点按可移除效果背景' : '点按上传效果照片/视频'"
        >
          <img v-if="srcOf(c.effect?.photo)" :src="srcOf(c.effect?.photo)" alt="" />
          <span v-else class="ev-photo-add">＋效果</span>
          <i v-if="isVid(c.effect?.photo)" class="ev-vid-mark">▶</i>
        </button>
        <textarea v-model="c.effect.text" v-autogrow rows="1" class="fi grow" :readonly="ro" placeholder="效果演出文字（选择后全屏播放，留空用反馈旁白）" />
      </div>
    </div>

    <button
      v-if="!ro && scene.choices.length < 4"
      class="ev-addc"
      @click="scene.choices.push({ text: '新的选项', delta: 0, feedback: '……', reflect: '', effect: { text: '', photo: null }, to: null })"
    >
      ＋ 添加选项
    </button>

    <input ref="photoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="onPhoto" />
    <input ref="introPhotoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="onIntroPhoto" />
    <input ref="effectPhotoEl" type="file" accept="image/*,video/*" hidden @click.stop @change="onEffectPhoto" />

    <!-- 上传视频背景后的「选项时机」弹层（内部 Teleport 到 body，画布 transform 下也能贴屏幕底部） -->
    <TimingSheet v-if="timingSheet" @pick="applyWaitEnd" @close="timingSheet = false" />

    <!-- 走向底部弹层：新建分支 / 合到已有节点 / 结束这一天。
         Teleport 到 body：画布 .zoomer 带 will-change:transform，其后代里的
         position:fixed 会退化成相对画布定位——展开卡偏左/画布滚动时弹层跟着偏。
         挂到 body 才永远贴屏幕正下方。scoped 样式随元素属性生效，不受影响 -->
    <Teleport to="body">
      <div v-if="gotoSheet" class="ev-sheet-mask" @click="gotoSheet = null">
        <div class="ev-sheet" @click.stop>
          <p class="ev-sheet-t">这个决策通向哪里？</p>
          <button type="button" class="ev-sheet-i primary" @click="setGoto('__new')">＋ 新建分支节点</button>
          <button
            type="button"
            class="ev-sheet-i"
            :class="{ cur: gotoSheet.choice.to == null }"
            @click="setGoto('__end')"
          >—— 结束这一天（夜记）<i v-if="gotoSheet.choice.to == null">✓</i></button>
          <p class="ev-sheet-sub">或合到更晚的节点（合流）</p>
          <div class="ev-sheet-list">
            <button
              v-for="o in gotoOptions.filter((x) => x.v !== scene.id)"
              :key="o.v"
              type="button"
              class="ev-sheet-i"
              :class="{ cur: gotoSheet.choice.to === o.v }"
              @click="setGoto(o.v)"
            >{{ o.label }}<i v-if="gotoSheet.choice.to === o.v">✓</i></button>
          </div>
          <button type="button" class="ev-sheet-cancel" @click="gotoSheet = null">取消</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.card { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 18px; }
.ev { display: flex; flex-direction: column; gap: 12px; }
.ev-top { display: flex; gap: 12px; align-items: flex-start; }
.ev-photo {
  width: 64px; min-width: 64px; flex: 0 0 64px; height: 84px;
  border-radius: 4px; cursor: pointer;
  border: 1px dashed var(--ink-3); overflow: hidden; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
.ev-photo.has { border-style: solid; border-color: var(--line); position: relative; }
.ev-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ev-photo-add { font-size: 11px; color: var(--ink-3); letter-spacing: 0.1em; }
.ev-vid-mark {
  position: absolute; right: 3px; bottom: 3px; font-style: normal;
  font-size: 8px; letter-spacing: 0.05em; line-height: 1.5; color: #FBFAF7;
  background: rgba(34, 30, 24, 0.62); border-radius: 3px; padding: 0 3px;
  pointer-events: none;
}
.sw-dawn { background: linear-gradient(180deg, #F4E9DA, #E6D7C1); }
.sw-street { background: linear-gradient(180deg, #E4EEEC, #E8DFC9); }
.sw-noon { background: linear-gradient(180deg, #F5F1E4, #E9DFC6); }
.sw-dusk { background: linear-gradient(180deg, #E9E2E2, #D3BFA9); }
.sw-night { background: linear-gradient(180deg, #4A5060, #2C303A); }
.ev-meta { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; min-width: 0; }
.ev-row { display: flex; gap: 10px; }
.grow { flex: 1; }
.ev-del {
  border: none; background: none; cursor: pointer; align-self: flex-start;
  color: var(--ink-3); font-size: 14px; padding: 6px;
}
.ev-del:hover { color: var(--bad); }
.ev-del.small { align-self: center; padding: 2px 6px; }

.fi {
  border: none; border-bottom: 1px solid var(--line); border-radius: 0;
  background: transparent; font-size: 14px; font-family: var(--serif); color: var(--ink);
  padding: 7px 2px 1px; min-width: 0; line-height: 1.8; /* 底部只留 1px：行距自带的半行空隙已够，再加会把文字顶离横线 */
}
.fi:focus { outline: none; border-color: var(--ink-2); }
.fi.time { width: 104px; letter-spacing: 0.05em; }
textarea.fi {
  width: 100%; resize: none; overflow: hidden; display: block;
  line-height: 1.8; font-family: var(--serif); font-size: 14px;
  min-height: 28px; /* 只防极小字号的量高兜底；再高会让单行文字顶在上面、远离横线 */
}
.ev-delta-label { font-size: 10px; letter-spacing: 0.2em; color: var(--ink-3); flex: none; }
.delta-input {
  width: 64px; flex: none; text-align: center;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield; appearance: textfield;
}
.delta-input::-webkit-outer-spin-button,
.delta-input::-webkit-inner-spin-button {
  -webkit-appearance: none; margin: 0;
}
.delta-hint { font-size: 11px; letter-spacing: 0.08em; }
.delta-hint.good { color: var(--good); }
.delta-hint.bad { color: var(--bad); }
.delta-hint.zero { color: var(--ink-3); }
/* 分界小标签：选项区开头（引子区靠「＋引子／添加引子」自明） */
.ev-sec { font-size: 10px; letter-spacing: 0.2em; color: var(--ink-3); }

.ev-intros { display: flex; flex-direction: column; gap: 10px; }
.ev-intro { display: flex; gap: 12px; align-items: stretch; }
.ev-intro .fi { flex: 1; align-self: center; }
.ev-photo.intro { width: 48px; min-width: 48px; flex: 0 0 48px; height: 64px; }
.ev-photo.intro .ev-photo-add { font-size: 10px; letter-spacing: 0.05em; }

.ev-choice { display: flex; flex-direction: column; gap: 8px; padding: 10px 10px 12px; background: var(--mist); border-radius: 4px; }
.ev-crow { display: flex; gap: 8px; align-items: center; }
.ev-photo.effect { width: 40px; min-width: 40px; flex: 0 0 40px; height: 52px; }
.ev-photo.effect .ev-photo-add { font-size: 10px; letter-spacing: 0.05em; }
.ev-effect { align-items: center; }

.ev-goto { margin-top: 2px; }
.ev-goto-label { font-size: 10px; letter-spacing: 0.2em; color: var(--ink-3); flex: none; }

/* 决策序号（与画布箭头上的 ①② 对应） */
.ev-optnum {
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--line); color: var(--ink-2); background: var(--paper);
  display: flex; align-items: center; justify-content: center; font-size: 12px;
}

/* 走向按钮 */
.ev-goto-btn {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font: inherit; font-size: 13px; font-family: var(--serif); color: var(--ink-2);
  background: var(--mist); border: none; border-radius: 6px;
  padding: 9px 10px; cursor: pointer; min-width: 0; text-align: left;
}
.ev-goto-btn:active { filter: brightness(0.96); }
.ev-goto-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-goto-btn i { font-style: normal; color: var(--ink-3); flex: none; }

/* 视频背景的选项弹出时机开关 */
.ev-waitend { margin-top: 2px; }
.ev-waitend-btn {
  font: inherit; font-size: 12px; color: var(--ink-2);
  background: var(--mist); border: 1px solid transparent; border-radius: 6px;
  padding: 6px 10px; cursor: pointer; min-width: 0; flex: 1; text-align: left;
}
.ev-waitend-btn.on {
  color: var(--ink);
  background: #F0E9D8;
  border-color: var(--line);
}

/* 走向底部弹层 */
.ev-sheet-mask {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.ev-sheet {
  width: 100%; max-width: 460px; max-height: 68vh; max-height: 68dvh;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 14px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; overflow: hidden;
  animation: ev-sheet-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes ev-sheet-up { from { transform: translateY(40%); opacity: 0.4; } }
.ev-sheet-t { font-size: 13px; color: var(--ink-2); letter-spacing: 0.08em; padding: 2px 2px 8px; }
.ev-sheet-sub { font-size: 10px; color: var(--ink-3); letter-spacing: 0.12em; padding: 10px 2px 4px; }
.ev-sheet-list { overflow: auto; display: flex; flex-direction: column; min-height: 0; }
.ev-sheet-i {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border: none; background: none; font: inherit; font-size: 14px; color: var(--ink);
  text-align: left; padding: 11px 10px; border-radius: 6px; cursor: pointer;
}
.ev-sheet-i:active { background: var(--mist); }
.ev-sheet-i.cur { font-weight: 600; }
.ev-sheet-i.primary {
  background: var(--ink); color: #FBFAF7; justify-content: center;
  margin-bottom: 4px; padding: 12px 10px;
}
.ev-sheet-i.primary:active { background: #211E1A; }
.ev-sheet-i i { font-style: normal; color: var(--good); font-size: 13px; flex: none; }
.ev-sheet-cancel {
  border: none; background: none; font: inherit; font-size: 13px; color: var(--ink-3);
  padding: 10px; cursor: pointer; letter-spacing: 0.1em;
}

.ev-addc {
  align-self: flex-start; border: none; background: none; cursor: pointer;
  font: inherit; font-size: 12px; color: var(--ink-2); letter-spacing: 0.1em; padding: 2px;
}
.ev-addc:hover { color: var(--ink); }

.delta { font-style: normal; font-weight: 600; font-variant-numeric: tabular-nums; }
.delta.good { color: var(--good); }
.delta.bad { color: var(--bad); }
.delta.zero { color: var(--ink-2); }

/* 画布展开态的紧凑版 */
.ev.mini { padding: 12px; gap: 9px; box-shadow: 0 10px 30px rgba(60, 50, 30, 0.12); }
.ev.mini .fi { font-size: 12.5px; padding: 5px 2px 1px; }
.ev.mini textarea.fi { font-size: 12.5px; }
.ev.mini .ev-choice { padding: 8px; gap: 6px; }
/* mini 头部竖排：卡宽 208 放不下「照片＋时间(固定104px)＋标题」一行，标题会被挤到 0 宽。
   照片与 ✕ 一行，时间/标题/旁白依次整行铺开（聚焦视图宽度足够，保持原横排） */
.ev.mini .ev-top { gap: 9px; flex-wrap: wrap; justify-content: space-between; }
.ev.mini .ev-del { order: 1; }
.ev.mini .ev-meta { order: 2; flex: 1 1 100%; }
.ev.mini .ev-row { flex-wrap: wrap; }
.ev.mini .ev-row .fi.grow { flex: 1 1 100%; }
</style>
