<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { letters, updateLetter, deleteLetter } from '../letters.js'
import { confirmBox } from '../confirm.js'

const router = useRouter()
const { state } = useGame()

const selId = ref(null)
const editing = ref(false)
const draft = ref('')
const taEl = ref(null)

// 列表 ⇄ 详情切换时回到顶部（页面滚动会保留上一状态的位置）
watch(selId, () => window.scrollTo(0, 0))

const backTo = computed(() => (state.started ? '/stage' : '/intro'))
const sel = computed(() => letters.find((x) => x.id === selId.value) ?? null)
const excerpt = (t) => (t ?? '').replace(/\s+/g, ' ').slice(0, 52) + '……'

function open(id) {
  selId.value = id
  editing.value = false
}

function sizeTa() {
  const el = taEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(el.scrollHeight, 200) + 'px'
}

function startEdit() {
  draft.value = sel.value?.text ?? ''
  editing.value = true
  nextTick(sizeTa)
}

function saveEdit() {
  if (!sel.value) return
  updateLetter(sel.value.id, draft.value)
  editing.value = false
}

async function del() {
  if (!sel.value) return
  if (await confirmBox(`删除「${sel.value.dateLabel}」的夜记？`, { danger: true })) {
    deleteLetter(sel.value.id)
    selId.value = null
  }
}
</script>

<template>
  <div class="letters">
    <header class="l-head">
      <button class="btn ghost back" @click="router.push(backTo)">‹ 返回</button>
      <div class="l-title serif">夜记集</div>
      <span class="l-count">{{ letters.length }} 封</span>
    </header>

    <!-- 列表 -->
    <div v-if="!sel" class="l-list">
      <button v-for="lt in letters" :key="lt.id" class="l-item" @click="open(lt.id)">
        <span class="l-dot" :class="lt.tierKey" />
        <span class="l-main">
          <span class="l-date serif">{{ lt.dateLabel }}</span>
          <span class="l-excerpt">{{ excerpt(lt.text) }}</span>
        </span>
        <span class="l-meta">
          <b>{{ lt.tierLabel }} {{ lt.state }}</b>
          <i v-if="lt.edited">已编辑</i>
          <i v-else>{{ lt.presetName }} · {{ lt.choices }} 选</i>
        </span>
      </button>
      <p v-if="!letters.length" class="l-empty">还没有夜记。过完一天，那天的信会来到这里。</p>
    </div>

    <!-- 详情 -->
    <div v-else class="l-detail">
      <button class="btn ghost back small" @click="selId = null">‹ 全部夜记</button>
      <div class="d-date serif">{{ sel.dateLabel }}</div>
      <p class="d-meta">
        {{ sel.presetName }} · {{ sel.choices }} 次决定<template v-if="sel.missed"> · 顺流 {{ sel.missed }}</template>
        · 收笔状态 {{ sel.tierLabel }} {{ sel.state }}<template v-if="sel.edited"> · 已编辑</template>
      </p>

      <textarea
        v-if="editing"
        ref="taEl"
        v-model="draft"
        class="d-edit serif"
        @input="sizeTa"
      ></textarea>
      <p v-else class="d-text serif">{{ sel.text }}</p>

      <div class="d-actions">
        <template v-if="!editing">
          <button class="btn ghost" @click="startEdit">编辑</button>
          <button class="btn ghost" @click="del">删除</button>
        </template>
        <template v-else>
          <button class="btn ghost" @click="editing = false">取消</button>
          <button class="btn primary" @click="saveEdit">保存</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.letters {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 30px;
}
.l-head { display: flex; align-items: center; gap: 12px; }
.l-head .back { padding: 7px 14px; font-size: 13px; }
.l-title { font-size: 17px; letter-spacing: 0.14em; flex: 1; text-align: center; }
.l-count { font-size: 12px; color: var(--ink-3); letter-spacing: 0.08em; }

.l-list { margin-top: 18px; display: flex; flex-direction: column; }
.l-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 4px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.l-item:active { background: var(--mist); }
.l-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
.l-dot.great, .l-dot.good { background: #4F7D78; }
.l-dot.ok { background: #7E8F7C; }
.l-dot.sad { background: #8A7454; }
.l-dot.bad { background: #8C5A50; }
.l-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.l-date { font-size: 15px; letter-spacing: 0.04em; }
.l-excerpt {
  font-size: 12px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.l-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.l-meta b { font-size: 12px; font-weight: 500; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.l-meta i { font-style: normal; font-size: 10px; color: var(--ink-3); letter-spacing: 0.05em; }
.l-empty { margin-top: 30vh; text-align: center; font-size: 13px; color: var(--ink-3); letter-spacing: 0.06em; }

.l-detail { margin-top: 14px; display: flex; flex-direction: column; flex: 1; }
.l-detail .back.small { align-self: flex-start; padding: 6px 12px; font-size: 12px; }
.d-date { margin-top: 14px; font-size: 18px; letter-spacing: 0.1em; text-align: center; }
.d-meta { margin: 8px 0 18px; text-align: center; font-size: 11px; color: var(--ink-3); letter-spacing: 0.05em; }
.d-text {
  margin: 0;
  flex: 1;
  font-size: 15px;
  line-height: 2.25;
  letter-spacing: 0.02em;
  text-align: justify;
  white-space: pre-line;
  color: var(--ink);
}
.d-edit {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  font-family: var(--serif);
  font-size: 15px;
  line-height: 2.1;
  color: var(--ink);
  resize: none;
  overflow: hidden;
  padding: 0 0 2px; /* 底部只留 2px：2.1 行距的半行空隙已够，文字贴住横线 */
  min-height: 200px;
}
.d-edit:focus { outline: none; border-color: var(--ink-2); }
.d-actions { display: flex; justify-content: center; gap: 10px; margin-top: 16px; }
.d-actions .btn { padding: 8px 20px; font-size: 13px; }
</style>
