<script setup>
/* 侧边抽屉（Teleport 到 body）：全局导航枢纽，左上角 ☰ 唤出。
   原独立「汇总」页已并入这里：今日状态卡 + 时间轴 + 模式切换 + 分享。
   本人空间另含 剧本库 与 夜记集/画布 入口；访客沙箱 = 精简导航 + 退出分享。
   由 drawer.js 的 drawerState.open 控制，挂载在 App.vue。 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGame } from '../store.js'
import { fmtDelta } from '../gloom.js'
import { useAuth, openLogin } from '../auth.js'
import { openShare } from '../share.js'
import { drawerState } from '../drawer.js'
import { confirmBox } from '../confirm.js'
import GloomMeter from './GloomMeter.vue'
import ModeSwitch from './ModeSwitch.vue'
import ThemeSwitch from './ThemeSwitch.vue'

const route = useRoute()
const router = useRouter()
const { state, presets, frontier, tier, guest, startDay, setActivePreset, exitGuest } = useGame()
const { authState } = useAuth()

function close() {
  drawerState.open = false
}

/* 跳转后抽屉必须收起：点条目会换路由，系统返回键也可能换——统一盯路由 */
watch(() => route.fullPath, close)

/* ---------- 顶行：本人 = 头像问候（未登录即登录入口）；访客 = 作品铭牌 ---------- */
const hasAvatar = computed(() => !!authState.user?.avatar_version)
const avatarUrl = computed(() =>
  hasAvatar.value ? `/api/users/${authState.user.id}/avatar?v=${authState.user.avatar_version}` : ''
)

function onMe() {
  if (!authState.user) {
    close()
    openLogin()
    return
  }
  close()
  router.push('/me')
}

/* ---------- 今日块：原汇总页的时间轴 ---------- */
const dateLabel = computed(() => {
  const d = state.date ? new Date(state.date) : new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${wd}`
})

const walked = computed(() =>
  state.log.map((e) => ({
    key: e.sceneId,
    time: e.snap?.time ?? '',
    title: e.snap?.title ?? '',
    text: e.missed && !e.late ? null : e.snap?.choiceText ?? '……',
    delta: e.delta,
    missed: e.missed && !e.late,
    late: !!e.late,
  }))
)
const deltaClass = (d) => (d > 0 ? 'good' : d < 0 ? 'bad' : 'zero')

function beginDay() {
  close()
  startDay()
  // 带 nonce：人可能就在舞台页（开抽屉切模式/重开），同路径跳转默认会被忽略，靠 query 变化强制重挂载
  const base = guest.on && guest.work ? `/w/${guest.work.code}` : ''
  router.push({ path: base + '/stage', query: { b: Date.now().toString(36) } })
}

/* 分享此剧本：登录是唯一前置（同原汇总页）。先收抽屉——分享层与抽屉同层，不收会被盖住 */
function onShare() {
  close()
  if (authState.user) openShare()
  else openLogin()
}

/* ---------- 导航项：随所在页变化——主页给「回到此刻」，别处给「回到主页」（用户拍板） ---------- */
const navItems = computed(() => {
  if (guest.on) {
    const base = '/w/' + guest.work?.code
    return [
      { key: 'stage', label: '舞台', to: base + '/stage' },
      { key: 'editor', label: '剧本画布', to: base + '/editor' },
    ]
  }
  const items = []
  if (state.started) {
    if (route.path === '/intro') items.push({ key: 'stage', label: '回到此刻', to: '/stage' })
    else items.push({ key: 'home', label: '回到主页', to: '/intro' })
  }
  items.push({ key: 'letters', label: '夜记集', to: '/letters' }, { key: 'editor', label: '剧本画布', to: '/editor' })
  return items
})

function go(item) {
  close()
  router.push(item.to)
}

/* ---------- 剧本库（访客不显示）。语义同 EditorView.switchPreset：切换 = 新的一天 ---------- */
async function pickPreset(p) {
  if (p.id === presets.activeId) {
    close()
    return
  }
  if (state.started && state.log.length && !(await confirmBox('切换预设会开始新的一天，当前进度将清空。'))) return
  setActivePreset(p.id)
  close()
  if (route.path !== '/intro') router.push('/intro') // 进度已清空，回首页重新开始
}

function leaveGuest() {
  close()
  exitGuest()
  router.push('/intro')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sd">
      <div v-if="drawerState.open" class="sd-mask" @click="close" @touchmove.self.prevent>
        <div class="sd-wrap">
          <aside class="sd-panel" @click.stop>
            <button v-if="!guest.on" class="sd-me" @click="onMe">
              <img v-if="hasAvatar" class="sd-ava" :src="avatarUrl" alt="" />
              <span v-else class="sd-ava serif">{{ authState.user ? (authState.user.nickname || '玩')[0] : '客' }}</span>
              <span class="sd-hi serif">{{ authState.user ? `hi，${authState.user.nickname}` : 'hi，点这里登录' }}</span>
              <i class="sd-gear">⚙</i>
            </button>
            <div v-else class="sd-me sd-me-static">
              <span class="sd-ava serif">客</span>
              <span class="sd-mecol">
                <span class="sd-hi serif">体验作品</span>
                <span class="sd-worktitle">{{ guest.work?.title }}</span>
              </span>
            </div>

            <!-- 今日（原汇总页内嵌） -->
            <section class="sd-today">
              <div class="sd-today-head">
                <div class="sd-date serif">{{ dateLabel }}</div>
                <ModeSwitch v-if="!guest.on" @restarted="beginDay" />
              </div>

              <div class="sd-hero">
                <GloomMeter :value="state.gloom" :tier="tier" />
              </div>

              <div v-if="!state.started" class="sd-empty">今天还没开始。走过一段之后，时刻会记在这里。</div>
              <section v-else class="tl">
                <article v-for="w in walked" :key="w.key" class="tl-item" :class="w.missed ? 'missed' : 'done'">
                  <div class="tl-time">{{ w.time }}</div>
                  <div class="tl-node"><span class="tl-dot" /></div>
                  <div class="tl-main">
                    <div class="tl-title serif">{{ w.title }}</div>
                    <div class="tl-status">
                      <template v-if="w.missed">顺流而去 · 状态 {{ fmtDelta(w.delta) }}</template>
                      <template v-else>
                        已选「{{ w.text }}」<i v-if="w.late" class="tl-late">补做</i>
                        <b class="delta" :class="deltaClass(w.delta)">{{ fmtDelta(w.delta) }}</b>
                      </template>
                    </div>
                  </div>
                  <div class="tl-act">{{ w.missed ? '·' : '✓' }}</div>
                </article>

                <article v-if="frontier" class="tl-item current">
                  <div class="tl-time">{{ frontier.time }}</div>
                  <div class="tl-node"><span class="tl-dot" /></div>
                  <div class="tl-main">
                    <div class="tl-title serif">{{ frontier.title }}</div>
                    <div class="tl-status">现在轮到你</div>
                  </div>
                  <div class="tl-act">现在</div>
                </article>
              </section>

              <p v-if="!guest.on && state.mode === 'real'" class="sd-note">
                真实模式：直接跳到当前时间；处于分流中时，从最近的合流节点补选择
              </p>

              <div v-if="!guest.on" class="sd-actions">
                <button class="btn ghost big" @click="onShare">分享此剧本</button>
              </div>
            </section>

            <nav class="sd-nav">
              <button v-for="it in navItems" :key="it.key" class="sd-item" @click="go(it)">
                <span class="sd-item-label serif">{{ it.label }}</span>
                <i class="sd-arrow">›</i>
              </button>
            </nav>

            <!-- 剧本库（仅本人） -->
            <template v-if="!guest.on">
              <div class="sd-sec">我的剧本</div>
              <button
                v-for="p in presets.list"
                :key="p.id"
                class="sd-preset"
                :class="{ on: p.id === presets.activeId }"
                @click="pickPreset(p)"
              >
                <span class="sd-preset-name serif">{{ p.name }}</span>
                <i v-if="p.id === presets.activeId" class="sd-check">✓</i>
              </button>
            </template>

            <!-- 外观：显示偏好只存本机，与进度/账号无关，访客也能换 -->
            <div class="sd-theme">
              <i class="sd-theme-label serif">外观</i>
              <ThemeSwitch />
            </div>

            <button v-if="guest.on" class="sd-leave" @click="leaveGuest">退出分享</button>
          </aside>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sd-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: var(--mask);
  display: flex;
  justify-content: center;
}
/* 面板对齐 .shell 的左缘（桌面端 shell 居中时抽屉不贴屏幕边） */
.sd-wrap {
  width: 100%;
  max-width: 480px;
  height: 100%;
  position: relative;
}
.sd-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(84%, 340px);
  background: var(--paper);
  border-right: 1px solid var(--line);
  box-shadow: 8px 0 30px var(--shadow);
  padding: calc(14px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 只动 transform 与 mask 底色（iOS 标准），面板本体不淡入淡出 */
.sd-enter-active,
.sd-leave-active {
  transition: background-color 0.24s ease;
}
.sd-enter-active .sd-panel,
.sd-leave-active .sd-panel {
  transition: transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sd-enter-from,
.sd-leave-to {
  background-color: rgba(28, 24, 18, 0);
}
.sd-enter-from .sd-panel,
.sd-leave-to .sd-panel {
  transform: translateX(-100%);
}

/* ---- 顶行 ---- */
.sd-me {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: var(--ink);
  padding: 6px 2px 14px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  text-align: left;
  flex: none;
  -webkit-tap-highlight-color: transparent;
}
.sd-me-static { cursor: default; }
.sd-ava {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--mist);
  object-fit: cover;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}
.sd-hi {
  font-size: 16px;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-gear {
  font-style: normal;
  margin-left: auto;
  color: var(--ink-2);
  font-size: 15px;
}
.sd-mecol {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sd-worktitle {
  font-size: 12px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 今日块 ---- */
.sd-today { flex: none; }
.sd-today-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 2px 10px;
}
.sd-date {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.sd-hero {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 4px;
}
.sd-empty {
  padding: 14px 2px;
  font-size: 12px;
  color: var(--ink-3);
  letter-spacing: 0.05em;
  line-height: 1.9;
}
.sd-note {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.05em;
  line-height: 1.8;
}
.sd-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sd-actions .btn { padding: 11px 24px; font-size: 14px; }

/* ---- 时间轴（自原汇总页移植，时间列收窄适配抽屉） ---- */
.tl { list-style: none; margin: 8px 0 0; padding: 0; }
.tl-item {
  display: grid;
  grid-template-columns: 44px 18px 1fr auto;
  gap: 0 8px;
  padding: 11px 0;
  align-items: start;
}
.tl-time {
  font-size: 12px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  padding-top: 3px;
}
.tl-node { position: relative; display: flex; justify-content: center; }
.tl-node::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.tl-item:first-child .tl-node::before { top: 8px; }
.tl-item:last-child .tl-node::before { bottom: auto; height: 8px; }
.tl-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bg);
  border: 1.5px solid var(--ink-3);
  margin-top: 5px;
}
.tl-item.done .tl-dot { background: var(--good); border-color: var(--good); }
.tl-item.missed .tl-dot { background: var(--bad); border-color: var(--bad); }
.tl-item.current .tl-dot {
  border-color: var(--ink);
  animation: sd-tl-pulse 2.4s ease infinite;
}
@keyframes sd-tl-pulse {
  0% { box-shadow: 0 0 0 0 var(--pulse); }
  70% { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.tl-title { font-size: 14px; letter-spacing: 0.04em; }
.tl-status { font-size: 11px; color: var(--ink-2); margin-top: 3px; letter-spacing: 0.02em; }
.tl-late {
  font-style: normal;
  font-size: 10px;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 5px;
  margin: 0 2px;
}
.tl-act {
  font-size: 11px;
  color: var(--ink);
  align-self: center;
  letter-spacing: 0.08em;
}

/* ---- 剧本库 ---- */
.sd-sec {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.3em;
  margin: 20px 2px 8px;
}
.sd-preset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--line);
  background: var(--bg);
  font: inherit;
  color: var(--ink);
  border-radius: 6px;
  padding: 11px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.sd-preset.on {
  border-color: var(--ink);
  background: var(--paper);
}
.sd-preset-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-check {
  font-style: normal;
  color: var(--good);
}

/* ---- 导航 ---- */
.sd-nav {
  margin-top: 18px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.sd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  font: inherit;
  color: var(--ink);
  padding: 13px 4px;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.sd-item:active { background: var(--mist); }
.sd-item-label {
  font-size: 15px;
  letter-spacing: 0.1em;
}
.sd-arrow {
  font-style: normal;
  color: var(--ink-3);
  font-size: 16px;
}

/* ---- 外观（显示偏好） ---- */
.sd-theme {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.sd-theme-label {
  font-style: normal;
  font-size: 14px;
  letter-spacing: 0.2em;
  color: var(--ink);
}

/* ---- 访客退出 ---- */
.sd-leave {
  margin-top: auto;
  border: 1px solid var(--line);
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--ink-2);
  border-radius: 3px;
  padding: 11px;
  cursor: pointer;
  letter-spacing: 0.14em;
  -webkit-tap-highlight-color: transparent;
}
</style>
