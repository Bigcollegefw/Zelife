<script setup>
/* 分享管理弹层（Teleport 到 body）：分享当前剧本 + 管理历史分享（复制/停用/恢复/删除）。
   由 share.js 的 shareState.open 控制，挂载在 App.vue。 */
import { onMounted, ref } from 'vue'
import { apiUpload } from '../api.js'
import { useGame } from '../store.js'
import { shareState, myWorks, revokeWork, deleteWork, copyShareLink, buildWorkUpload } from '../share.js'
import { confirmBox } from '../confirm.js'

const { activePreset } = useGame()

const list = ref([])
const loading = ref(true)
const err = ref('')
const flash = ref('')
const busy = ref(false)
const progress = ref(0)
const fallbackUrl = ref('')

function close() {
  shareState.open = false
  fallbackUrl.value = ''
}

function fmtDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

async function refresh() {
  loading.value = true
  err.value = ''
  try {
    list.value = (await myWorks()).list
  } catch (e) {
    err.value = e.message
  }
  loading.value = false
}
onMounted(refresh)

async function shareCurrent() {
  if (busy.value) return
  err.value = ''
  flash.value = ''
  fallbackUrl.value = ''
  busy.value = true
  progress.value = 0
  try {
    const { files, presetJson, title } = await buildWorkUpload(activePreset.value)
    const fd = new FormData()
    fd.append('title', title)
    fd.append('preset', presetJson)
    for (const [slot, blob] of files) fd.append(slot, blob, slot)
    const res = await apiUpload('/works', fd, (p) => (progress.value = p))
    flash.value = `已分享「${res.title}」`
    await copyShareLink(res.code).then((r) => {
      if (!r.ok) fallbackUrl.value = r.url
      else flash.value = `已分享「${res.title}」，链接已复制，去粘贴给朋友吧`
    })
    await refresh()
  } catch (e) {
    err.value = e.message
  }
  busy.value = false
}

async function onCopy(w) {
  const r = await copyShareLink(w.code)
  if (r.ok) {
    flash.value = '链接已复制，去粘贴给朋友吧'
    fallbackUrl.value = ''
  } else {
    fallbackUrl.value = r.url
    flash.value = ''
  }
}

async function onToggle(w) {
  err.value = ''
  try {
    await revokeWork(w.code, w.status === 'active')
    await refresh()
  } catch (e) {
    err.value = e.message
  }
}

async function onDelete(w) {
  if (
    !(await confirmBox(`删除分享「${w.title}」？`, { body: '链接立即失效，照片视频一并删除，不可恢复。', danger: true }))
  )
    return
  err.value = ''
  try {
    await deleteWork(w.code)
    await refresh()
  } catch (e) {
    err.value = e.message
  }
}

function onPickFallback() {
  event?.target?.select?.()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="shareState.open" class="ss-mask" @click="close">
      <div class="ss-sheet" @click.stop>
        <div class="ss-head">
          <span class="ss-t">分享</span>
          <button class="ss-x" @click="close">✕</button>
        </div>

        <button class="ss-share-btn" :disabled="busy" @click="shareCurrent">
          {{ busy ? `上传中 ${progress}%` : `把「${activePreset?.name ?? ''}」分享出去` }}
        </button>
        <p class="ss-sub">照片 + 视频 ≤ 50MB · 最多同时保留 5 个分享 · 对方可完整体验与回溯</p>

        <p v-if="flash" class="ss-flash">{{ flash }}</p>
        <p v-if="err" class="ss-err">{{ err }}</p>
        <div v-if="fallbackUrl" class="ss-fallback">
          <input class="ss-url" :value="fallbackUrl" readonly @focus="onPickFallback" />
          <p class="ss-sub">自动复制不可用：长按上方链接手动复制</p>
        </div>

        <div class="ss-list">
          <p v-if="loading" class="ss-sub">载入中…</p>
          <p v-else-if="!list.length" class="ss-sub">还没有分享过作品</p>
          <div v-for="w in list" :key="w.code" class="ss-item">
            <div class="ss-item-main">
              <span class="ss-item-title">{{ w.title }}</span>
              <span class="ss-item-meta">
                {{ fmtDate(w.created_at) }} · {{ w.views }} 次浏览 ·
                <b :class="w.status === 'active' ? 'ok' : 'off'">{{ w.status === 'active' ? '分享中' : '已停用' }}</b>
              </span>
            </div>
            <div class="ss-item-act">
              <button v-if="w.status === 'active'" class="ss-act" @click="onCopy(w)">复制链接</button>
              <button class="ss-act" @click="onToggle(w)">{{ w.status === 'active' ? '停用' : '恢复' }}</button>
              <button class="ss-act danger" @click="onDelete(w)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ss-mask {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.ss-sheet {
  width: 100%; max-width: 460px; max-height: 80vh; max-height: 80dvh;
  overflow: auto;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
  animation: ss-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes ss-up { from { transform: translateY(40%); opacity: 0.4; } }
.ss-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ss-t { font-size: 14px; letter-spacing: 0.2em; color: var(--ink); }
.ss-x {
  border: none; background: none; font: inherit; font-size: 14px;
  color: var(--ink-3); cursor: pointer; padding: 4px 8px;
}
.ss-share-btn {
  width: 100%; border: none; border-radius: 3px; cursor: pointer;
  background: var(--ink); color: #FBFAF7; font: inherit; font-size: 14px;
  letter-spacing: 0.1em; padding: 13px 20px;
}
.ss-share-btn:disabled { opacity: 0.6; }
.ss-sub { margin: 8px 0 0; font-size: 10.5px; color: var(--ink-3); letter-spacing: 0.05em; line-height: 1.7; }
.ss-flash { margin: 10px 0 0; font-size: 12px; color: var(--good); letter-spacing: 0.04em; }
.ss-err { margin: 10px 0 0; font-size: 12px; color: var(--bad); letter-spacing: 0.04em; }
.ss-fallback { margin-top: 8px; }
.ss-url {
  width: 100%; border: 1px solid var(--line); border-radius: 6px; background: var(--mist);
  font: inherit; font-size: 12px; color: var(--ink); padding: 9px 10px;
}
.ss-list { margin-top: 14px; display: flex; flex-direction: column; }
.ss-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border-top: 1px solid var(--line); padding: 11px 2px;
}
.ss-item-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ss-item-title { font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-item-meta { font-size: 11px; color: var(--ink-3); letter-spacing: 0.03em; }
.ss-item-meta b.ok { color: var(--good); font-weight: 600; }
.ss-item-meta b.off { color: var(--ink-3); font-weight: 600; }
.ss-item-act { display: flex; gap: 6px; flex: none; }
.ss-act {
  border: 1px solid var(--line); background: var(--paper); font: inherit; font-size: 11.5px;
  color: var(--ink-2); border-radius: 999px; padding: 5px 10px; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ss-act:active { background: var(--mist); }
.ss-act.danger { color: var(--bad); }
</style>
