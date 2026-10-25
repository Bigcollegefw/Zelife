<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { nightNote } from '../night.js'
import { letters, saveLetter, updateLetter } from '../letters.js'

const router = useRouter()
const { state, activePreset, allNodes, tier, reset, startDay, guest } = useGame()

const dateLabel = computed(() => {
  const d = state.date ? new Date(state.date) : new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${wd}`
})

const dateKey = computed(() => {
  const d = state.date ? new Date(state.date) : new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
})

/** 夜记：demo 为本地模板撰写，正式版由 AI 根据当天数据生成 */
const generated = computed(() => nightNote(state.log, allNodes.value, tier.value.key, dateLabel.value))

const entry = ref(null) // 当天在夜记集里的存档（保留用户编辑）
const editing = ref(false)
const draft = ref('')
const taEl = ref(null)

onMounted(() => {
  if (guest.on) return // 访客：夜记只在内存里，不进本机夜记集
  // 生成即存档（同一天不覆盖已编辑的正文），展示以存档为准
  saveLetter({
    id: dateKey.value,
    dateLabel: dateLabel.value,
    text: generated.value,
    tierKey: tier.value.key,
    tierLabel: tier.value.label,
    state: state.gloom,
    presetName: activePreset.value?.name ?? '',
    choices: state.log.filter((e) => !e.missed || e.late).length,
    missed: state.log.filter((e) => e.missed && !e.late).length,
  })
  const saved = letters.find((x) => x.id === dateKey.value)
  entry.value = saved ? { ...saved } : null
})

function sizeTa() {
  const el = taEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(el.scrollHeight, 180) + 'px'
}

function startEdit() {
  draft.value = entry.value?.text ?? generated.value
  editing.value = true
  nextTick(sizeTa)
}

function saveEdit() {
  if (!entry.value) return
  updateLetter(entry.value.id, draft.value)
  entry.value.text = draft.value
  editing.value = false
}

/* 访客空间跳转 */
function nav(path) {
  router.push((guest.on && guest.work ? '/w/' + guest.work.code : '') + path)
}

function replay() {
  reset()
  if (guest.on) {
    // 访客「再体验一遍」：重开同一天，不回开场页
    startDay()
    nav('/stage')
    return
  }
  router.push('/intro')
}
</script>

<template>
  <div class="report">
    <header class="r-head">
      <div class="r-date serif">{{ dateLabel }}</div>
      <div class="r-rule" />
    </header>

    <section class="letter">
      <textarea
        v-if="editing"
        ref="taEl"
        v-model="draft"
        class="letter-edit serif"
        @input="sizeTa"
      ></textarea>
      <p v-else class="letter-text serif">{{ entry?.text ?? generated }}</p>
    </section>

    <p class="r-tag">{{ guest.on ? '夜记 · 体验版，不会保存' : '夜记 · 生成后可编辑 · 已存入夜记集' }}</p>

    <div class="r-actions">
      <button v-if="!guest.on" class="btn ghost small" @click="router.push('/letters')">夜记集</button>
      <template v-if="!editing && !guest.on">
        <button class="btn ghost small" @click="startEdit">编辑这封信</button>
      </template>
      <template v-else>
        <button class="btn ghost small" @click="editing = false">取消</button>
        <button class="btn primary small" @click="saveEdit">保存</button>
      </template>
    </div>

    <footer v-if="!editing" class="r-foot">
      <button class="btn ghost big" @click="nav('/stage')">回到此刻</button>
      <button class="btn primary big" @click="replay">再过一天</button>
    </footer>
  </div>
</template>

<style scoped>
.report {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 44px 26px 30px;
}
.r-head { text-align: center; }
.r-date { font-size: 17px; letter-spacing: 0.24em; text-indent: 0.24em; }
.r-rule {
  width: 26px;
  height: 1px;
  background: var(--ink-3);
  margin: 18px auto 26px;
}

.letter { flex: 1; }
.letter-text {
  margin: 0;
  font-size: 15.5px;
  line-height: 2.3;
  letter-spacing: 0.02em;
  text-align: justify;
  white-space: pre-line;
  color: var(--ink);
}
.letter-edit {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  font-family: var(--serif);
  font-size: 15.5px;
  line-height: 2.2;
  letter-spacing: 0.02em;
  color: var(--ink);
  resize: none;
  overflow: hidden;
  padding: 0 0 8px;
  min-height: 180px;
}
.letter-edit:focus { outline: none; border-color: var(--ink-2); }

.r-tag {
  margin: 22px 0 0;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  text-align: center;
}

.r-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}
.r-actions .btn { padding: 7px 16px; font-size: 13px; }

.r-foot {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}
.r-foot .btn { flex: 1; }
</style>
