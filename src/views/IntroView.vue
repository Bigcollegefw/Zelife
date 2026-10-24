<script setup>
import { useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { useAuth } from '../auth.js'

const router = useRouter()
const { state, startDay } = useGame()
const { authState, openLogin } = useAuth()

function begin() {
  startDay()
  router.push('/stage')
}

function onAuth() {
  // 已登录 → 主页；未登录 → 登录弹层（登录成功后按钮自动变昵称）
  if (authState.user) router.push('/me')
  else openLogin()
}
</script>

<template>
  <div class="intro">
    <div class="intro-core">
      <span class="mark" aria-hidden="true" />
      <div class="wordmark serif">galplan</div>
      <p class="tagline serif">把一天，过成一场<br />可以选择的游戏。</p>

      <ul class="intro-list">
        <li>
          <i>时刻</i>
          <span>一天被拆成几个「决定点」。内置工作日 / 周末两套预设，也可以编辑成你自己的剧本。</span>
        </li>
        <li>
          <i>选项</i>
          <span>到了时刻，生活的场景里浮出选项——起，还是不起，由你按下。</span>
        </li>
        <li>
          <i>状态值</i>
          <span>每次选择都在为这一天着色。-10 到 100，坏、哀、尚可、好、爽——五档，看你把日子过成哪一档。</span>
        </li>
      </ul>

      <button class="btn primary big" @click="begin">
        {{ state.started ? '继续今天' : '开始今天' }}
      </button>
      <div class="intro-sub">
        <button class="btn ghost small" @click="router.push('/editor')">编辑剧本</button>
        <button class="btn ghost small" @click="router.push('/letters')">夜记集</button>
        <button class="btn ghost small intro-auth" @click="onAuth">
          {{ authState.user ? authState.user.nickname : '登录' }}
        </button>
      </div>
    </div>
    <footer class="intro-foot">demo 原型 · 进度只保存在本机浏览器 · 登录不影响你的进度</footer>
  </div>
</template>

<style scoped>
.intro {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 56px 30px 26px;
}
.intro-core { margin: auto 0; text-align: center; }
.intro-sub { display: flex; justify-content: center; gap: 10px; margin-top: 14px; }
.intro-sub .btn { padding: 7px 16px; font-size: 13px; }
/* 昵称可能比固定文案长：限宽省略，防止三颗按钮挤换行 */
.intro-auth { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mark {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  margin-bottom: 14px;
}
.wordmark { font-size: 15px; letter-spacing: 0.5em; text-indent: 0.5em; color: var(--ink-2); }
.tagline {
  font-size: 26px;
  line-height: 1.8;
  letter-spacing: 0.08em;
  margin: 18px 0 0;
}
.intro-list {
  list-style: none;
  margin: 30px 0 34px;
  padding: 0;
  text-align: left;
}
.intro-list li {
  display: grid;
  grid-template-columns: 66px 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 13px 2px;
  border-top: 1px solid var(--line);
}
.intro-list li:last-child { border-bottom: 1px solid var(--line); }
.intro-list i {
  font-style: normal;
  font-family: var(--serif);
  font-size: 14px;
  letter-spacing: 0.2em;
  color: var(--ink);
}
.intro-list span { font-size: 13px; color: var(--ink-2); line-height: 1.8; }
.intro-foot {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.15em;
  text-align: center;
}
</style>
