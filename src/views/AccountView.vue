<script setup>
/* 账号与协议（设置 › 账号）：同步本机数据 / 用户协议 / 隐私政策 / 注销账号。
   仅本人可见（访客的设置页里协议直接内联）。注销是真实接口：删云端全部痕迹，
   本机剧本与进度不受影响（账号只为分享服务）。 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { authState, clearToken } from '../auth.js'
import { confirmBox } from '../confirm.js'

const router = useRouter()
const busy = ref(false)
const err = ref('')

async function onDeleteAccount() {
  if (
    !(await confirmBox('注销账号？', {
      body: `云端将删除账号「${authState.user?.email ?? ''}」：分享的作品与照片视频一并删除，无法恢复。本机的剧本与进度不受影响。`,
      danger: true,
    }))
  )
    return
  if (busy.value) return
  busy.value = true
  err.value = ''
  try {
    await api('/me', { method: 'DELETE' })
    clearToken() // 会话已被服务端删除，本地登录态一并清掉
    router.push('/intro')
  } catch (e) {
    err.value = e.message
    busy.value = false
  }
}
</script>

<template>
  <div class="acc">
    <header class="acc-head">
      <button class="btn ghost back" @click="router.push('/settings')">‹ 返回</button>
      <div class="acc-title serif">设置</div>
    </header>

    <div class="acc-body">
      <section class="acc-sec">
        <button class="acc-row" @click="router.push('/settings/sync')">
          <span class="acc-name serif">同步本机数据</span>
          <i class="acc-arrow">›</i>
        </button>
        <button class="acc-row" @click="router.push('/settings/doc/terms')">
          <span class="acc-name serif">用户协议</span>
          <i class="acc-arrow">›</i>
        </button>
        <button class="acc-row" @click="router.push('/settings/doc/privacy')">
          <span class="acc-name serif">隐私政策</span>
          <i class="acc-arrow">›</i>
        </button>
        <button class="acc-row danger" :disabled="busy" @click="onDeleteAccount">
          <span class="acc-name serif">{{ busy ? '注销中…' : '注销账号' }}</span>
          <i class="acc-arrow">›</i>
        </button>
      </section>
      <p v-if="err" class="acc-err">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.acc {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 24px 26px 26px;
}
.acc-head { display: flex; align-items: center; gap: 12px; }
.acc-head .back { padding: 7px 14px; font-size: 13px; }
.acc-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }
.acc-body { margin-top: 26px; }

.acc-sec { display: flex; flex-direction: column; }
.acc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 15px 2px;
  border: none;
  border-top: 1px solid var(--line);
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.acc-sec .acc-row:last-child { border-bottom: 1px solid var(--line); }
.acc-row:active { background: var(--mist); }
.acc-row:disabled { opacity: 0.6; }
.acc-name { font-size: 14.5px; letter-spacing: 0.1em; }
.acc-arrow { font-style: normal; color: var(--ink-3); font-size: 17px; }
.acc-row.danger .acc-name { color: var(--bad); }

.acc-err { font-size: 12px; color: var(--bad); margin: 12px 2px 0; }
</style>
