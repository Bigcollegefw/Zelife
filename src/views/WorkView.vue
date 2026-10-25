<script setup>
/* 访客落地页：打开分享链接的第一站。
   拉取作品 → 进入访客沙箱 → 开始体验 / 查看画布。
   右上角小旗 = 举报；作者本人打开显示「管理分享」入口。 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { useGame, enterGuestWork } from '../store.js'
import { isMyWork, openShare } from '../share.js'
import { openDrawer } from '../drawer.js'

const router = useRouter()
const route = useRoute()
const { state, startDay, exitGuest } = useGame()

const phase = ref('loading') // loading | ready | closed | missing
const info = ref(null) // { code, title, nickname, owner_id, created_at, preset }
const reportOpen = ref(false)
const reportReason = ref('')
const reportDetail = ref('')
const reportDone = ref(false)
const reportSending = ref(false)
const REASONS = ['违规内容', '侵权', '垃圾广告']

const meta = computed(() => {
  if (!info.value) return null
  const nodes = Object.keys(info.value.preset?.nodes ?? {}).length
  return `${nodes} 个时刻`
})
const isOwner = computed(() => isMyWork(info.value))

async function load() {
  phase.value = 'loading'
  info.value = null
  try {
    const data = await api(`/works/${route.params.code}`)
    info.value = data
    enterGuestWork({ code: data.code, title: data.title, nickname: data.nickname, owner_id: data.owner_id }, data.preset)
    phase.value = 'ready'
  } catch (e) {
    exitGuest() // 关单/失效：清掉访客沙箱，返回键不再回到已失效的演出
    phase.value = String(e.message ?? '').includes('关闭') ? 'closed' : 'missing'
  }
}
load()

function begin() {
  startDay()
  router.push(`/w/${route.params.code}/stage`)
}
function toCanvas() {
  router.push(`/w/${route.params.code}/editor`)
}
function leave() {
  exitGuest()
  router.push('/intro')
}

async function submitReport() {
  if (!reportReason.value || reportSending.value) return
  reportSending.value = true
  try {
    await api('/reports', { method: 'POST', body: { code: route.params.code, reason: reportReason.value, detail: reportDetail.value } })
    reportDone.value = true
  } catch {
    reportDone.value = true // 提交失败也温和收尾，不打断访客
  }
  reportSending.value = false
}
</script>

<template>
  <div class="work">
    <header class="w-top">
      <button class="w-menu" aria-label="菜单" @click="openDrawer()">☰</button>
      <button class="w-quit" @click="leave">‹ 退出</button>
      <button v-if="isOwner" class="w-own" @click="openShare()">这是你分享的作品 · 管理</button>
      <button class="w-flag" title="举报" @click="reportOpen = true">⚑ 举报</button>
    </header>

    <div v-if="phase === 'loading'" class="w-body">
      <p class="w-note">正在打开…</p>
    </div>

    <div v-else-if="phase === 'closed'" class="w-body">
      <span class="mark" aria-hidden="true" />
      <h1 class="w-title serif">作者已关闭这份作品的分享</h1>
      <p class="w-note">也许过段时间会重新开放。</p>
    </div>

    <div v-else-if="phase === 'missing'" class="w-body">
      <span class="mark" aria-hidden="true" />
      <h1 class="w-title serif">链接不存在或已被删除</h1>
      <p class="w-note">请和作者确认一下链接。</p>
  <button class="btn ghost big w-trybtn" @click="load()">重试</button>
  </div>

    <div v-else class="w-body">
      <span class="mark" aria-hidden="true" />
      <div class="w-kicker serif">galplan · 分享作品</div>
      <h1 class="w-title serif">{{ info.title }}</h1>
      <p class="w-by">作者 {{ info.nickname }} · {{ meta }} · 演出进度不会保存</p>
      <button class="btn primary big" @click="begin">开始体验</button>
      <button class="btn ghost big w-canvas-btn" @click="toCanvas">查看剧本画布</button>
    </div>

    <!-- 举报：底部弹层（手指点按友好） -->
    <div v-if="reportOpen" class="w-sheet-mask" @click="reportOpen = false">
      <div class="w-sheet" @click.stop>
        <template v-if="!reportDone">
          <p class="w-sheet-t">举报这份作品</p>
          <button
            v-for="r in REASONS"
            :key="r"
            type="button"
            class="w-reason"
            :class="{ on: reportReason === r }"
            @click="reportReason = r"
          >
            {{ r }}<i v-if="reportReason === r">✓</i>
          </button>
          <textarea
            v-model="reportDetail"
            class="w-detail"
            rows="1"
            placeholder="补充说明（可选）"
          />
          <button class="btn primary big w-send" :disabled="!reportReason || reportSending" @click="submitReport">
            {{ reportSending ? '提交中…' : '提交举报' }}
          </button>
          <button class="w-cancel" @click="reportOpen = false">取消</button>
        </template>
        <template v-else>
          <p class="w-sheet-t">已收到你的举报，感谢反馈</p>
          <button class="w-cancel" @click="reportFlowReset">好的</button>
        </template>
      </div>
    </div>
  </div>
</template>


<style scoped>
.work {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 30px;
}
.w-top { display: flex; align-items: center; gap: 8px; }
.w-menu {
  border: 1px solid var(--line);
  background: var(--paper);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  color: var(--ink);
  border-radius: 999px;
  padding: 6px 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.w-quit {
  border: none; background: none; font: inherit; font-size: 13px;
  color: var(--ink-2); cursor: pointer; padding: 6px 2px; letter-spacing: 0.06em;
  -webkit-tap-highlight-color: transparent;
}
.w-own {
  margin-left: auto; border: 1px solid var(--line); background: var(--paper);
  font: inherit; font-size: 11px; color: var(--ink-2);
  border-radius: 999px; padding: 5px 12px; cursor: pointer;
  max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}
.w-flag {
  border: none; background: none; font: inherit; font-size: 11px;
  color: var(--ink-3); cursor: pointer; padding: 6px 2px; letter-spacing: 0.08em;
  -webkit-tap-highlight-color: transparent;
}
.w-flag + .w-own { margin-left: 0; }
.w-top .w-own { order: 3; }
.w-top .w-flag { order: 2; margin-left: auto; }

.w-body {
  margin: auto 0; text-align: center;
  display: flex; flex-direction: column; align-items: center;
}
.mark {
  width: 11px; height: 11px; border-radius: 50%;
  border: 1.5px solid var(--ink); margin-bottom: 14px;
}
.w-kicker { font-size: 11px; letter-spacing: 0.4em; text-indent: 0.4em; color: var(--ink-2); }
.w-title { font-size: 24px; letter-spacing: 0.06em; margin: 12px 0 10px; font-weight: 600; max-width: 15em; overflow-wrap: anywhere; }
.w-by { font-size: 12px; color: var(--ink-2); margin: 0 0 30px; letter-spacing: 0.04em; }
.w-body .btn { max-width: 320px; width: 100%; }
.w-canvas-btn { margin-top: 10px; }
.w-trybtn { margin-top: 18px; }
.w-note { font-size: 13px; color: var(--ink-2); letter-spacing: 0.06em; line-height: 2; }

.w-sheet-mask {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.w-sheet {
  width: 100%; max-width: 460px;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 14px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column;
  animation: w-sheet-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes w-sheet-up { from { transform: translateY(40%); opacity: 0.4; } }
.w-sheet-t { font-size: 13px; color: var(--ink-2); letter-spacing: 0.08em; padding: 2px 2px 8px; }
.w-reason {
  display: flex; align-items: center; justify-content: space-between;
  border: 1px solid var(--line); background: var(--paper); font: inherit; font-size: 14px;
  color: var(--ink); text-align: left; padding: 11px 12px; border-radius: 6px;
  cursor: pointer; margin-bottom: 8px;
}
.w-reason.on { border-color: var(--ink); }
.w-reason i { font-style: normal; color: var(--good); }
.w-detail {
  border: none; border-bottom: 1px solid var(--line); background: transparent;
  font: inherit; font-family: var(--serif); font-size: 13.5px; color: var(--ink);
  padding: 10px 2px 1px; margin-bottom: 14px; resize: none;
}
.w-detail:focus { outline: none; border-color: var(--ink-2); }
.w-send { margin-bottom: 4px; }
.w-cancel {
  border: none; background: none; font: inherit; font-size: 13px; color: var(--ink-3);
  padding: 10px; cursor: pointer; letter-spacing: 0.1em;
}
</style>
