<script setup>
/* 设置（独立页面）：账号 / 通用偏好 / 通知 / 关于（协议）。
   入口 = 侧边抽屉顶行齿轮。偏好全部只存本机（与进度、账号无关）：
   主题 theme.js、打字速度 prefs.js、语音 tts.js、到点提醒 notify.js。
   访客从 /w/:code/settings 进（沙箱内换肤/演出/通知/协议均可用），只是没有「账号」区。 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGame, guest } from '../store.js'
import { useAuth, openLogin } from '../auth.js'
import ThemeSwitch from '../components/ThemeSwitch.vue'
import SkinSwitch from '../components/SkinSwitch.vue'
import { typeState, setTypeSpeed } from '../prefs.js'
import { voiceState, setVoice, setVoiceRate } from '../tts.js'
import { notifState, setNotify } from '../notify.js'
import { APP_NAME } from '../brand.js'

const router = useRouter()
const { state } = useGame()
const { authState } = useAuth()

const base = computed(() => (guest.on ? `/w/${guest.work?.code}` : ''))
const backTo = computed(() =>
  guest.on ? base.value + '/stage' : state.started ? '/stage' : '/intro',
)

/* 账号与协议：已登录进子页（同步本机数据/协议/注销账号）；未登录就地弹登录 */
function onAccount() {
  if (authState.user) router.push('/settings/account')
  else openLogin()
}

const speedOpts = [
  { v: 'slow', label: '悠缓' },
  { v: 'normal', label: '标准' },
  { v: 'fast', label: '飞快' },
]
const rateOpts = [
  { v: 'slow', label: '舒缓' },
  { v: 'normal', label: '标准' },
  { v: 'fast', label: '明快' },
]

/* 通知能力：按浏览器支持与授权状态如实展示，不假装能发 */
const notifDesc = computed(() => {
  if (!notifState.supported) return '此浏览器不支持通知（iOS Safari 内暂无，App 打包后支持）'
  if (notifState.permission === 'denied') return '浏览器已拒绝通知，请到浏览器设置里允许后回来开启'
  return '真实模式到点、页面在后台时，用系统通知提醒你'
})
const notifDisabled = !notifState.supported || notifState.permission === 'denied'
</script>

<template>
  <div class="set">
    <header class="set-head">
      <button class="btn ghost back" @click="router.push(backTo)">‹ 返回</button>
      <div class="set-title serif">设置</div>
      <button class="set-about" aria-label="关于" @click="router.push(base + '/settings/about')">
        <i>i</i>
      </button>
    </header>

    <div class="set-body">
      <!-- 账号（访客沙箱无账号区，协议在下方「关于」内联） -->
      <section v-if="!guest.on" class="set-sec">
        <div class="set-sec-t">账号</div>
        <button class="set-row" @click="onAccount">
          <span class="set-name serif">账号与协议</span>
          <span class="set-val">
            {{ authState.user ? authState.user.email : '未登录' }}
            <i class="set-arrow">›</i>
          </span>
        </button>
      </section>

      <!-- 通用偏好 -->
      <section class="set-sec">
        <div class="set-sec-t">通用</div>
        <div class="set-row">
          <div class="set-info">
            <span class="set-name serif">皮肤</span>
            <small>蜡笔杂货的手作感，或回到经典纸面</small>
          </div>
          <SkinSwitch />
        </div>
        <div class="set-row">
          <div class="set-info">
            <span class="set-name serif">主题</span>
            <small>夜里想暖一点，就换成暖夜</small>
          </div>
          <ThemeSwitch />
        </div>
        <div class="set-row">
          <div class="set-info">
            <span class="set-name serif">打字速度</span>
            <small>旁白与系统播报的节奏</small>
          </div>
          <div class="set-seg" role="radiogroup" aria-label="打字速度">
            <button
              v-for="o in speedOpts"
              :key="o.v"
              :class="{ on: typeState.speed === o.v }"
              @click="setTypeSpeed(o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
        <div class="set-row">
          <div class="set-info">
            <span class="set-name serif">系统语音</span>
            <small>用本机内置语音朗读旁白与选项</small>
          </div>
          <button
            class="set-toggle"
            :class="{ on: voiceState.on }"
            role="switch"
            :aria-checked="voiceState.on"
            aria-label="系统语音"
            @click="setVoice(!voiceState.on)"
          >
            <i />
          </button>
        </div>
        <div class="set-row" :class="{ dim: !voiceState.on }">
          <div class="set-info">
            <span class="set-name serif">朗读语速</span>
          </div>
          <div class="set-seg" role="radiogroup" aria-label="朗读语速">
            <button
              v-for="o in rateOpts"
              :key="o.v"
              :class="{ on: voiceState.rate === o.v }"
              :disabled="!voiceState.on"
              @click="setVoiceRate(o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
      </section>

      <!-- 通知 -->
      <section class="set-sec">
        <div class="set-sec-t">通知</div>
        <div class="set-row" :class="{ dim: notifDisabled && !notifState.on }">
          <div class="set-info">
            <span class="set-name serif">到点提醒</span>
            <small>{{ notifDesc }}</small>
          </div>
          <button
            class="set-toggle"
            :class="{ on: notifState.on }"
            role="switch"
            :aria-checked="notifState.on"
            aria-label="到点提醒"
            :disabled="notifDisabled"
            @click="setNotify(!notifState.on)"
          >
            <i />
          </button>
        </div>
      </section>

      <!-- 关于页：设置右上角 ⓘ（本人/访客统一），协议入口都在那里 -->
      <p class="set-foot">{{ APP_NAME }} · 演示版</p>
    </div>
  </div>
</template>

<style scoped>
.set {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 24px 26px 26px;
}
.set-head { display: flex; align-items: center; gap: 12px; }
.set-head .back { padding: 7px 14px; font-size: 13px; }
.set-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }
.set-about {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: none;
  font: inherit;
  font-size: 14px;
  color: var(--ink-2);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.set-about:active { background: var(--mist); }
.set-about i { font-style: italic; font-family: var(--serif); }
.set-body { margin-top: 18px; }

/* ---- 分区与行（同「我的」页的清单语言） ---- */
.set-sec { margin-bottom: 20px; }
.set-sec-t {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.3em;
  padding: 4px 2px 2px;
}
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 13px 2px;
  border: none;
  border-top: 1px solid var(--line);
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.set-sec .set-row:last-child { border-bottom: 1px solid var(--line); }
button.set-row:active { background: var(--mist); }
.set-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.set-name { font-size: 14px; letter-spacing: 0.08em; }
.set-info small {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
  line-height: 1.6;
}
.set-val {
  font-size: 12px;
  color: var(--ink-2);
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.set-arrow { font-style: normal; color: var(--ink-3); font-size: 16px; }
.set-row.dim .set-toggle { opacity: 0.45; }
.set-row.dim { cursor: default; }

/* ---- 分段胶囊（与 ThemeSwitch 同构） ---- */
.set-seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  background: var(--mist);
  flex: none;
}
.set-seg button {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  padding: 5px 11px;
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}
.set-seg button.on { background: var(--ink); color: var(--on-ink); }

/* ---- 开关（只动 transform 与底色） ---- */
.set-toggle {
  flex: none;
  width: 46px;
  height: 27px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--mist);
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
.set-toggle i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--line);
  transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.set-toggle.on { background: var(--good); border-color: var(--good); }
.set-toggle.on i { transform: translateX(19px); border-color: var(--good); }
.set-toggle:disabled { cursor: default; }

.set-foot {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.12em;
  text-align: center;
}
</style>
