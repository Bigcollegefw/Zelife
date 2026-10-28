<script setup>
import { useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { openDrawer } from '../drawer.js'
import { confirmBox } from '../confirm.js'
import ModeSwitch from '../components/ModeSwitch.vue'

const router = useRouter()
const { state, presets, startDay, setActivePreset } = useGame()

function begin() {
  startDay()
  router.push('/stage')
}

/* 主页选剧本：语义与抽屉/编辑器一致——中途切换＝确认后清空重开 */
async function pickPreset(p) {
  if (p.id === presets.activeId) return
  if (state.started && state.log.length && !(await confirmBox('切换预设会开始新的一天，当前进度将清空。'))) return
  setActivePreset(p.id)
}
</script>

<template>
  <div class="intro">
    <button class="intro-menu" aria-label="菜单" @click="openDrawer()">☰</button>
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

      <!-- 开始区：先定剧本和模式，再按下开始 -->
      <div class="intro-setup">
        <div class="su-row">
          <i class="su-label serif">剧本</i>
          <div class="su-presets">
            <button
              v-for="p in presets.list"
              :key="p.id"
              class="su-chip"
              :class="{ on: p.id === presets.activeId }"
              @click="pickPreset(p)"
            >
              {{ p.name }}<i v-if="p.id === presets.activeId"> ✓</i>
            </button>
          </div>
        </div>
        <div class="su-row">
          <i class="su-label serif">模式</i>
          <ModeSwitch />
        </div>
      </div>

      <button class="btn primary big" @click="begin">
        {{ state.started ? '继续今天' : '开始今天' }}
      </button>
    </div>
    <footer class="intro-foot">demo 原型 · 进度只保存在本机浏览器 · 登录不影响你的进度</footer>
  </div>
</template>

<style scoped>
.intro {
  position: relative;
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 56px 30px 26px;
}
.intro-core { margin: auto 0; text-align: center; }
/* 左上角 ☰：全局抽屉入口，绝对定位不挤居中排版 */
.intro-menu {
  position: absolute;
  top: 14px;
  left: 16px;
  border: none;
  background: none;
  font: inherit;
  font-size: 21px;
  line-height: 1;
  color: var(--ink);
  cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}
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
/* 开始区：剧本 + 模式，按下开始前定清楚 */
.intro-setup {
  margin: 0 0 26px;
  border-top: 1px solid var(--line);
}
.su-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--line);
}
.su-label {
  font-style: normal;
  font-size: 14px;
  letter-spacing: 0.2em;
  color: var(--ink);
  flex: none;
}
.su-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  flex: 1;
  min-width: 0;
}
.su-chip {
  border: 1px solid var(--line);
  background: var(--paper);
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}
.su-chip.on {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}
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
