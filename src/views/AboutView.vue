<script setup>
/* 关于（设置页右上角 ⓘ 进入）：铭牌 + 版本 + 协议入口 + 反馈 + 页脚（版权/备案位）。
   本人、访客同款——访客的协议入口就从这里走。
   鼓励一下/版本更新是原生 App 的事，H5 阶段不放；打包上架后再补。 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGame, guest } from '../store.js'
import { APP_NAME, WORDMARK } from '../brand.js'

const router = useRouter()
const { state } = useGame()

const base = computed(() => (guest.on ? `/w/${guest.work?.code}` : ''))
const backTo = computed(() =>
  guest.on ? base.value + '/stage' : state.started ? '/stage' : '/intro',
)

const APP_VERSION = '0.1.0 演示版' // 发版时手动同步 package.json 的 version
const INTRO = '编辑剧本、走到时刻、做出选择，夜里收下一封信——把一天过成一部 galgame。'

/* 反馈邮箱：填上即显示（空则整行隐藏） */
const FEEDBACK_EMAIL = ''
/* 备案号：境内 ICP 备案通过后填这里（如「某ICP备XXXXXXXX号-1」），
   自动显示在页脚并链接到工信部网站；留空则整行不显示——绝不放假号 */
const ICP = ''

const icpHref = 'https://beian.miit.gov.cn/'
const year = new Date().getFullYear()
</script>

<template>
  <div class="ab">
    <header class="ab-head">
      <button class="btn ghost back" @click="router.push(base + '/settings')">‹ 返回</button>
      <div class="ab-title serif">设置</div>
    </header>

    <div class="ab-body">
      <div class="ab-brand">
        <img v-if="WORDMARK" class="ab-logo-img" :src="WORDMARK" :alt="APP_NAME" />
        <div v-else class="ab-logo serif">{{ APP_NAME }}</div>
        <div class="ab-ver">版本 {{ APP_VERSION }}</div>
      </div>

      <p class="ab-intro serif">{{ INTRO }}</p>

      <section class="ab-sec">
        <button class="ab-row" @click="router.push(base + '/settings/doc/terms')">
          <span class="ab-name serif">用户协议</span>
          <i class="ab-arrow">›</i>
        </button>
        <button class="ab-row" @click="router.push(base + '/settings/doc/privacy')">
          <span class="ab-name serif">隐私政策</span>
          <i class="ab-arrow">›</i>
        </button>
      </section>

      <div v-if="FEEDBACK_EMAIL" class="ab-feed">
        <div class="ab-feed-t">欢迎反馈</div>
        <a class="ab-mail serif" :href="`mailto:${FEEDBACK_EMAIL}`">{{ FEEDBACK_EMAIL }}</a>
      </div>

      <footer class="ab-foot">
        <p v-if="ICP">
          <a :href="icpHref" target="_blank" rel="noreferrer">{{ ICP }}</a>
        </p>
        <p>Copyright © 2026–{{ year }} {{ APP_NAME }}. All Rights Reserved.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ab {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 24px 26px 26px;
}
.ab-head { display: flex; align-items: center; gap: 12px; }
.ab-head .back { padding: 7px 14px; font-size: 13px; }
.ab-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }
.ab-body { margin: auto 0; display: flex; flex-direction: column; }

.ab-brand { text-align: center; }
.ab-logo {
  font-size: 30px;
  line-height: 1.45;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
  font-weight: 600;
}
/* 字标图（assets/brand/wordmark.png 放图即启用）：横版等比，不超卡片宽 */
.ab-logo-img {
  display: block;
  width: min(200px, 60%);
  margin: 0 auto;
}
.ab-ver {
  margin-top: 10px;
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.16em;
}

.ab-intro {
  margin: 22px auto 0;
  max-width: 30em;
  font-size: 13.5px;
  line-height: 2.1;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  text-align: center;
}

.ab-sec { margin-top: 30px; display: flex; flex-direction: column; }
.ab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 2px;
  border: none;
  border-top: 1px solid var(--line);
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ab-sec .ab-row:last-child { border-bottom: 1px solid var(--line); }
.ab-row:active { background: var(--mist); }
.ab-name { font-size: 14px; letter-spacing: 0.12em; }
.ab-arrow { font-style: normal; color: var(--ink-3); font-size: 16px; }

.ab-feed { margin-top: 40px; text-align: center; }
.ab-feed-t { font-size: 11px; color: var(--ink-3); letter-spacing: 0.24em; }
.ab-mail {
  display: inline-block;
  margin-top: 10px;
  font-size: 13.5px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--mist);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 22px;
  text-decoration: none;
}

.ab-foot {
  margin-top: 56px;
  text-align: center;
}
.ab-foot p {
  margin: 2px 0;
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}
.ab-foot a { color: var(--ink-3); text-decoration: none; }
</style>
