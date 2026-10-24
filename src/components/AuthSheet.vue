<script setup>
/* 登录底部弹层（骨架照抄 TimingSheet：Teleport + z-40 + 仅进场动画）。
   步骤机：email 输邮箱 → code 输验证码。已登录视图在「我的」页（ProfileView），
   这里只管登录。iOS 要点：输入框 16px（<16px 聚焦触发自动放大）；visualViewport
   键盘补偿把 sheet 顶到键盘上方；不做 autofocus；novalidate + @submit.prevent
   让桌面回车可提交。 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { authState, closeLogin, requestCode, verifyCode } from '../auth.js'

const router = useRouter()

const step = ref('email') // 'email' | 'code'
const email = ref('')
const code = ref('')
const err = ref('')
const pending = ref(false) // 提交中：按钮禁用，防双击重复请求
const devCode = ref('') // DEV_FALLBACK 下服务端带回的开发验证码
const cooldown = ref(0) // 重发倒计时（秒）；服务端 60s 节流才是真闸门
let timer = null

// 键盘补偿：iOS 上 fixed 弹层不随键盘收缩布局视口，监听可视视口手动垫高
const kbPad = ref(0)
function onVV() {
  const vv = window.visualViewport
  if (!vv) return
  kbPad.value = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}
function watchVV(on) {
  const vv = window.visualViewport
  if (!vv) return
  if (on) {
    vv.addEventListener('resize', onVV)
    vv.addEventListener('scroll', onVV)
  } else {
    vv.removeEventListener('resize', onVV)
    vv.removeEventListener('scroll', onVV)
    kbPad.value = 0
  }
}

watch(
  () => authState.loginOpen,
  (open) => {
    if (open) {
      step.value = 'email'
      err.value = ''
      code.value = ''
      devCode.value = ''
      pending.value = false
      cooldown.value = 0
      watchVV(true)
    } else {
      watchVV(false)
      clearInterval(timer)
    }
  }
)

onBeforeUnmount(() => {
  watchVV(false)
  clearInterval(timer)
})

function close(result) {
  closeLogin(result)
}

function startCooldown() {
  cooldown.value = 60
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function sendCode() {
  if (pending.value || !email.value.trim()) return
  pending.value = true
  err.value = ''
  try {
    const data = await requestCode(email.value)
    devCode.value = data.devCode || ''
    code.value = devCode.value // 开发模式自动预填
    step.value = 'code'
    startCooldown()
  } catch (e) {
    err.value = e.message
  } finally {
    pending.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  err.value = ''
  code.value = ''
}

async function submitCode() {
  if (pending.value || code.value.replace(/\D/g, '').length !== 6) return
  pending.value = true
  err.value = ''
  try {
    await verifyCode(email.value, code.value)
    close(true)
    router.push('/me') // 登录成功直接进个人页（换头像/改昵称）
  } catch (e) {
    err.value = e.message
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="authState.loginOpen"
      class="au-mask"
      :style="kbPad ? { paddingBottom: kbPad + 'px' } : null"
      @click="close(false)"
    >
      <div class="au-sheet" @click.stop>
        <template v-if="step === 'email'">
          <div class="au-t">登录 / 注册</div>
          <p class="au-desc">只需一个邮箱验证码。剧本和进度都保存在本机，登录不影响它们。</p>
          <form novalidate @submit.prevent="sendCode">
            <input
              v-model="email"
              class="au-fi"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="you@example.com"
            />
            <div v-if="err" class="au-err">{{ err }}</div>
            <button class="btn primary big au-go" :disabled="pending || !email.trim()">
              {{ pending ? '发送中…' : '发送验证码' }}
            </button>
          </form>
        </template>

        <template v-else-if="step === 'code'">
          <div class="au-t">输入验证码</div>
          <p class="au-desc">验证码已发送至 <b class="au-strong">{{ email }}</b></p>
          <form novalidate @submit.prevent="submitCode">
            <input
              v-model="code"
              class="au-fi au-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="6 位数字"
            />
            <div v-if="devCode" class="au-dev">开发模式：验证码已自动填入</div>
            <div v-if="err" class="au-err">{{ err }}</div>
            <button
              class="btn primary big au-go"
              :disabled="pending || code.replace(/\D/g, '').length !== 6"
            >
              {{ pending ? '登录中…' : '登录' }}
            </button>
          </form>
          <div class="au-row">
            <button class="au-link" :disabled="cooldown > 0 || pending" @click="sendCode">
              {{ cooldown > 0 ? `重新发送（${cooldown}s）` : '重新发送' }}
            </button>
            <button class="au-link" @click="backToEmail">返回修改邮箱</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.au-mask {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.au-sheet {
  width: 100%; max-width: 460px;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px calc(14px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column;
  animation: au-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes au-up { from { transform: translateY(40%); opacity: 0.4; } }
.au-t { font-size: 13px; color: var(--ink-2); letter-spacing: 0.08em; padding: 2px 2px 8px; }
.au-desc { font-size: 13px; color: var(--ink-2); line-height: 1.7; margin: 0 2px 16px; }
.au-strong { color: var(--ink); font-weight: 600; word-break: break-all; }
/* 下划线输入框：16px 是 iOS 防聚焦放大的底线，不能再小 */
.au-fi {
  width: 100%;
  border: none; border-bottom: 1px solid var(--line); border-radius: 0;
  background: none; outline: none;
  font-family: var(--serif); font-size: 16px; color: var(--ink);
  padding: 4px 2px 5px;
}
.au-fi:focus { border-bottom-color: var(--ink-3); }
.au-code { letter-spacing: 0.3em; }
.au-err { font-size: 12px; color: var(--bad); margin: 10px 2px 0; }
.au-dev { font-size: 11px; color: var(--ink-3); margin-top: 10px; letter-spacing: 0.04em; }
.au-go { margin-top: 18px; }
.au-row { display: flex; justify-content: space-between; margin-top: 8px; }
.au-link {
  border: none; background: none; font: inherit;
  font-size: 12px; color: var(--ink-3); letter-spacing: 0.05em;
  padding: 8px 2px; cursor: pointer;
}
.au-link:disabled { opacity: 0.5; cursor: default; }
</style>
