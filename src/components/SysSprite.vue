<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stopSpeak, speakSeq } from '../tts.js'
import { skinState, SKINS } from '../skin.js'

/**
 * 系统小人：独立于面板的漂浮角色（红果短剧式小系统）。
 * mode = 'dock'     随面板召唤，贴着决策卡轮廓的椭圆轨道逆时针绕卡（两次穿到卡后真实遮挡），
 *                   末段落位由皮肤姿态定：站卡沿（crayon）/ 面板头部左侧（classic）（轨道几何按落定后的视觉矩形实测）
 * mode = 'announce' 飞到屏幕中上方，带气泡逐字播报（效果页结算）
 * mood = 'idle' | 'happy' | 'sad'：表情帧切换（有对应 PNG 才生效，见 assets/system/README.md）
 * 气泡文本走打字机 + TTS（与系统面板共用同一个语音开关）。
 */
const props = defineProps({
  mode: { type: String, default: 'dock' },
  text: { type: String, default: '' },
  mood: { type: String, default: 'idle' },
})

const MEASURE_MS = 1020 // 面板飞入（0.95s）+ rise 转场（0.35s）结束后再实测，rect 才是落定的视觉位置
const DOCK_MS = 3770 // dock：实测 1020 + 起飞延迟 150 + 轨道飞行 2600，落进面板头部才停稳
const ANNOUNCE_MS = 1050 // announce：飞入 0.9s + 少许回稳即开播（气泡与 TTS 不必等轨道那套时长）

/* ---------- 美术资源插槽（皮肤优先） ----------
   当前皮肤的图放 src/assets/skins/<皮肤名>/（如 crayon，规范见该目录 README），
   找不到再回落旧插槽 src/assets/system/，都没有就用内置 SVG。
   查表键含 skinState.skin（computed 里读）→ 切皮肤即换图，轨道动画不重触发：
   - sprite.png        主形象（透明背景 PNG，建议 512×512，角色居中占约 70%）
   - sprite-blink.png  可选：眨眼帧（与主形象同构图，仅改眼睛）
   - sprite-happy.png  可选：开心表情（mood='happy' 时替换主形象）
   - sprite-sad.png    可选：低落表情（mood='sad' 时替换主形象）
   飞行/轨道/浮动/眨眼等动画全部由代码驱动，美术只交静态帧 */
const assets = import.meta.glob('../assets/system/sprite*.{png,webp}', { eager: true, import: 'default' })
const skinAssets = import.meta.glob('../assets/skins/*/sprite*.{png,webp}', { eager: true, import: 'default' })
function pickFrame(name) {
  const k = `../assets/skins/${skinState.skin}/${name}`
  const mine = skinAssets[`${k}.png`] ?? skinAssets[`${k}.webp`]
  if (mine) return mine
  return assets[`../assets/system/${name}.png`] ?? assets[`../assets/system/${name}.webp`] ?? null
}
const spriteImg = computed(() => pickFrame(`sprite-${props.mood === 'idle' ? '' : props.mood}`) ?? pickFrame('sprite'))
const blinkImg = computed(() => pickFrame('sprite-blink'))

/* ---------- 停靠姿态（skin.js SKINS.pose 配置） ----------
   'edge' 蜡笔贴纸：dock 坐卡沿（底部约 30% 压在面板顶边）、announce 躲猫猫（下半身藏进气泡）
   'head' 经典：dock 落进面板头部左侧、announce 悬在气泡上方——原行为，像素级不变 */
const pose = computed(() => SKINS[skinState.skin]?.pose ?? 'head')

/* ---------- 轨道实测：绕决策卡飞行 ----------
   面板的 position:fixed 会被带 transform 的容器（.stage-choices 居中层）劫持，
   桌面端整根 app 还居中在 .shell 列里——视口坐标完全不可信。
   所以等面板飞入落定后按「视觉矩形」实测：面板中心 = 轨道圆心，停靠位 =
   面板头部左侧，起飞点 = app 页面右上外缘（不是浏览器窗口外缘）。
   停靠角与伸距据此精确解出，末段螺旋收臂后正好落进面板头部 */
const rootEl = ref(null)
const ready = ref(false) // 实测完成才可见、才起飞（否则会先闪现在错误的兜底位置）
function measureOrbit() {
  const el = rootEl.value
  if (!el || props.mode !== 'dock') return
  const panel = document.querySelector('.sys')
  if (!panel) return
  const stage = document.querySelector('.stage')
  const sRect = stage
    ? stage.getBoundingClientRect()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  const pRect = panel.getBoundingClientRect()
  // 停靠位（全部由实测的 pRect 解出，无任何设备写死值）：
  // edge 姿态 = 面板【左上角】卡沿——小人放大到 64px 站在角上，脚踩面板上沿咬合 1px，
  //   立绘脚部约在盒高 94% 处（生成图脚距下缘 ~6%），故盒顶 = 上沿 - 0.94*盒宽 + 1；
  //   左缘外悬 14px（骑在圆角上），但被页面夹住不出屏；
  // head 姿态 = 面板头部左侧 44px（经典皮肤原行为，像素级不动）
  const sit = pose.value === 'edge'
  const box = sit ? 64 : 44
  const half = box / 2
  const dockL = sit ? Math.max(4, pRect.left - 14) : pRect.left + 8
  const dockT = sit ? pRect.top - Math.round(box * 0.94) + 1 : pRect.top + 6
  const dockX = dockL + half // 小人是方形盒，中心 = 盒左上 + 半宽
  const dockY = dockT + half
  const cx = pRect.left + pRect.width / 2
  const cy = pRect.top + pRect.height / 2
  const dx = dockX - cx
  const dy = dockY - cy
  const endDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  // 起飞点：app 页面右上外缘（桌面端页面是居中一根列，别飞进信纸边里）
  const ex = sRect.right + 60
  const ey = sRect.top - 50
  const startDeg = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI
  const r0 = Math.hypot(ex - cx, ey - cy)
  // 椭圆轨道：贴着卡片轮廓描边（半宽/半高各加一点余量），再被 app 页面边缘夹住
  const rx = Math.max(
    110,
    Math.min(pRect.width / 2 + 20, cx - sRect.left - 30, sRect.right - cx - 30, 260),
  )
  const ry = Math.max(
    90,
    Math.min(pRect.height / 2 + 16, cy - sRect.top - 24, sRect.bottom - cy - 30, 220),
  )
  // 总扫角：逆时针（先掠过卡顶后方 → 正面绕下 → 再绕到卡后 → 迎面落进头部），
  // 至少一整圈；终点角度严格指向停靠位
  const base = (((endDeg - startDeg) % 360) + 360) % 360
  const sweep = base - 720
  const s = el.style
  s.left = `${Math.round(dockL)}px` // 覆盖 CSS 兜底坐标，落进面板头部
  s.top = `${Math.round(dockT)}px`
  s.setProperty('--oa0', `${startDeg}deg`) // 起飞角
  s.setProperty('--oa1', `${startDeg + sweep}deg`) // 停靠角（整圈基准上）
  s.setProperty('--r0', `${Math.round(r0)}px`) // 入场伸距（页面外）
  s.setProperty('--rx', `${Math.round(rx)}px`) // 椭圆横半径（贴卡片左右缘）
  s.setProperty('--ry', `${Math.round(ry)}px`) // 椭圆纵半径（贴卡片上下缘）
  s.setProperty('--osq', `${(ry / rx).toFixed(4)}`) // 纵向压扁系数：圆 → 椭圆
  s.setProperty('--osq-inv', `${(rx / ry).toFixed(4)}`) // 小人反向补偿，保持不变形
  s.setProperty('--rL', `${Math.round(Math.hypot(dx, dy))}px`) // 停靠伸距 = 圆心到停靠位
  s.setProperty('--orbit-cx', `${Math.round(cx - dockL)}px`) // 圆心相对小人盒的偏移
  s.setProperty('--orbit-cy', `${Math.round(cy - dockT)}px`)
  ready.value = true
}
const shown = ref('')
const done = ref(false)
let timer = null
let flyTimer = null
let measureTimer = null
const docked = ref(false)

function play() {
  clearInterval(timer)
  shown.value = ''
  done.value = false
  if (!props.text) {
    done.value = true
    return
  }
  let i = 0
  timer = setInterval(() => {
    i += 1
    shown.value = props.text.slice(0, i)
    if (i >= props.text.length) {
      clearInterval(timer)
      done.value = true
    }
  }, 40)
}
function speak(full) {
  speakSeq([full]) // 开关与音色统一走共享 TTS（tts.js）
}

onMounted(() => {
  if (props.mode === 'announce' && rootEl.value) {
    // 桌面端 app 居中：播报位贴 app 页面左缘而不是浏览器窗口左缘（top 仍走 CSS 的安全区计算）
    const stage = document.querySelector('.stage')
    if (stage) rootEl.value.style.left = `${Math.round(stage.getBoundingClientRect().left + 16)}px`
  }
  if (props.mode === 'dock') measureTimer = setTimeout(measureOrbit, MEASURE_MS)
  flyTimer = setTimeout(
    () => {
      docked.value = true
      play()
      speak(props.text)
    },
    props.mode === 'dock' ? DOCK_MS : ANNOUNCE_MS,
  )
})

/** 播报位的真实坐标（top 走 CSS 的 env 安全区，JS 里用一次性探针取实际 px） */
function announceTarget() {
  const stage = document.querySelector('.stage')
  const left = stage ? Math.round(stage.getBoundingClientRect().left + 16) : 16
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:calc(120px + env(safe-area-inset-top));visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const top = Math.round(probe.getBoundingClientRect().top)
  probe.remove()
  return { left, top }
}

/* 模式切换（舞台级常驻实例：dock → announce 不重挂载）：
   重置入场节奏；从 dock 切来时以「当前停靠位 → 播报位」的距离写入起飞向量，
   小人原地起飞弧线去播报位——连续飞行，不跳变 */
watch(() => props.mode, (m, old) => {
  if (!rootEl.value) return
  clearTimeout(flyTimer)
  clearTimeout(measureTimer)
  docked.value = false
  ready.value = false
  if (m === 'dock') {
    measureTimer = setTimeout(measureOrbit, MEASURE_MS)
    flyTimer = setTimeout(() => {
      docked.value = true
      play()
      speak(props.text)
    }, DOCK_MS)
  } else {
    if (old === 'dock') {
      const t = announceTarget()
      const fromL = parseFloat(rootEl.value.style.left)
      const fromT = parseFloat(rootEl.value.style.top)
      rootEl.value.style.left = `${t.left}px`
      rootEl.value.style.top = `${t.top}px`
      rootEl.value.style.setProperty('--fly-x', `${Math.round((Number.isNaN(fromL) ? t.left + 220 : fromL) - t.left)}px`)
      rootEl.value.style.setProperty('--fly-y', `${Math.round((Number.isNaN(fromT) ? t.top + 90 : fromT) - t.top)}px`)
    }
    flyTimer = setTimeout(() => {
      docked.value = true
      play()
      speak(props.text)
    }, ANNOUNCE_MS)
  }
})
watch(() => props.text, (t) => {
  if (!docked.value) return
  play()
  speak(t)
})
onBeforeUnmount(() => {
  clearTimeout(flyTimer)
  clearTimeout(measureTimer)
  clearInterval(timer)
  stopSpeak()
})
</script>

<template>
  <div ref="rootEl" class="spr" :class="[mode, pose === 'edge' ? 'pose-edge' : 'pose-head', { docked, ready }]">
    <!-- 轨道结构：orbit 绕面板中心旋转 / arm 沿旋转方向伸距 / body 反旋保持直立 / depth 近大远小。
         announce 等非 dock 模式下四层 display:contents 透明化，不影响原布局 -->
    <div class="spr-orbit">
      <div class="spr-arm">
        <div class="spr-body">
          <div class="spr-depth">
            <div class="spr-idle">
              <!-- 美术图（放入 assets/system/sprite*.png 后自动启用，mood 可切换表情帧） -->
              <img v-if="spriteImg" class="spr-img" :src="spriteImg" alt="" />
              <!-- 可选眨眼帧：周期性盖在主图上 -->
              <img v-if="spriteImg && blinkImg" class="spr-img spr-blink" :src="blinkImg" alt="" />

              <!-- 内置手绘小人「墨团小仙官」：日间是墨团、暖夜自动变奶油月光团（配色全走主题变量）。
                   美术图到位后本段即被 sprite.png 整体替换，动画接入点（spr-halo / spr-eyes）保持不变 -->
              <svg v-if="!spriteImg" class="spr-figure" viewBox="0 0 64 64" aria-hidden="true">
      <!-- 头顶日晷徽记：纸面表盘 + 慢旋指时针 -->
      <g class="spr-halo">
        <circle cx="32" cy="7.5" r="4.2" class="spr-halo-dial" />
        <circle cx="32" cy="7.5" r="4.2" fill="none" class="spr-halo-ring" />
        <g class="spr-halo-ticks">
          <line x1="32" y1="4" x2="32" y2="5.1" />
          <line x1="28.5" y1="7.5" x2="29.6" y2="7.5" />
          <line x1="35.5" y1="7.5" x2="34.4" y2="7.5" />
          <line x1="32" y1="11" x2="32" y2="9.9" />
        </g>
        <line x1="32" y1="7.5" x2="36.4" y2="4.5" class="spr-halo-gnomon" />
        <circle cx="32" cy="7.5" r="1" class="spr-halo-pin" />
      </g>

      <!-- 墨团圆身：左上一抹高光造体积 -->
      <ellipse cx="32" cy="38" rx="17.5" ry="19" fill="currentColor" />
      <ellipse cx="26" cy="26.5" rx="8.5" ry="5.5" class="spr-sheen" transform="rotate(-14 26 26.5)" />

      <!-- galgame 高光眼：眼白 + 同身色的瞳 + 瞳上星点；眨眼由代码整组缩放 -->
      <g class="spr-eyes">
        <ellipse cx="25.5" cy="33.5" rx="2.7" ry="3.4" class="spr-eye" />
        <circle cx="26" cy="34.6" r="1.25" fill="currentColor" />
        <circle cx="25.5" cy="34" r="0.62" class="spr-eye" />
        <ellipse cx="38.5" cy="33.5" rx="2.7" ry="3.4" class="spr-eye" />
        <circle cx="39" cy="34.6" r="1.25" fill="currentColor" />
        <circle cx="38.5" cy="34" r="0.62" class="spr-eye" />
      </g>

      <!-- 微笑 + 腮红 -->
      <path d="M29.5 40.6 Q32 42.9 34.5 40.6" class="spr-mouth" />
      <ellipse cx="20.5" cy="38.5" rx="2.4" ry="1.5" class="spr-blush" />
      <ellipse cx="43.5" cy="38.5" rx="2.4" ry="1.5" class="spr-blush" />

      <!-- 怀里微倾的小账本：书签丝带 + 两只墨手扣住上缘 -->
      <g transform="rotate(-3 32 51)">
        <rect x="23.5" y="45.5" width="17" height="11" rx="2" class="spr-book" />
        <path d="M37.6 45.5 h2.2 v5.5 l-1.1 -1.6 l-1.1 1.6 Z" class="spr-ribbon" />
        <line x1="26.5" y1="50.5" x2="36.5" y2="50.5" class="spr-book-line" />
        <line x1="26.5" y1="53.2" x2="33.5" y2="53.2" class="spr-book-line" />
        <circle cx="24.5" cy="46.6" r="2.4" fill="currentColor" />
        <circle cx="39.5" cy="46.6" r="2.4" fill="currentColor" />
      </g>
    </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 播报气泡（announce 模式） -->
    <div v-if="mode === 'announce' && props.text" class="spr-bubble" :class="{ ready: docked }">
      <span class="spr-bubble-t">{{ shown }}<i v-if="!done" class="spr-caret" /></span>
    </div>
  </div>
</template>

<style scoped>
.spr {
  position: fixed;
  z-index: 12;
  pointer-events: none;
  /* 身体用 currentColor：日间墨团 / 暖夜自动变奶油月光团，瞳孔同色 */
  color: var(--ink);
  will-change: transform, filter;
  /* 阴影统一放在容器层：飞行/绕卡时的远近虚影由关键帧整体控制 */
  filter: drop-shadow(0 4px 10px rgba(20, 18, 15, 0.28));
}

/* ---------- dock：贴着决策卡描边的椭圆轨道飞行，带真实遮挡 ----------
   四层嵌套各管一件事，全程纯 transform（GPU 合成，每帧都是椭圆弧线没有直线折角）：
   orbit = scaleY(压扁)∘rotate(θ)：把圆轨迹压成贴卡片的椭圆（起飞角/半径由实测写入变量）
   arm   = 沿旋转方向的伸距：页面外远处 → 收到椭圆半径 → 末段沿卡缘螺旋落进停靠位
   body  = 反向旋转 + 反向压扁：小人全程直立且不变形；depth = 近大远小 + 绕到卡后时的虚焦
   逆时针编排：入场掠过卡顶【后方】(遮挡) → 左缘绕下正面兜底 → 再绕到卡【后】(遮挡最深处)
   → 迎面从左上滑上头部落位。z-index 在 .spr 上离散翻转：前 14 / 卡后 2（选项层 z=3） */
.spr.dock {
  /* 兜底坐标：measureOrbit 落定后会用内联样式覆盖成面板头部的视觉位置 */
  top: calc(64px + env(safe-area-inset-top));
  left: 20px;
  width: 44px;
  z-index: 12;
  /* 实测完成（ready）前隐藏——否则会先闪现在错误的兜底位置再起飞 */
  opacity: 0;
}
/* 蜡笔贴纸姿态放大到 64px，与播报态同尺寸（经典 44px 不动）。
   注意：arm 层实际决定渲染尺寸（orbit=0×0，arm 是唯一有宽的定位层），
   且基础规则是 .spr.dock.ready .spr-arm（0,4,0）——覆盖必须带 .ready 提到 0,5,0，否则输了级联还是 44px */
.spr.pose-edge.dock {
  width: 64px;
}
.spr.pose-edge.dock.ready .spr-arm {
  left: -32px;
  top: -32px;
  width: 64px;
}
.spr.dock.ready {
  opacity: 1;
  animation: spr-z-dock 2.6s linear 0.15s both;
}
@keyframes spr-z-dock {
  /* 卡后段1：入场掠过卡顶（0-25%）→ 左缘翻到正面兜底（25-62%）
     卡后段2：右缘再绕到卡后（65-90%，最深处）→ 迎面翻正面落位（93% 起） */
  0% { z-index: 2; opacity: 0; }
  10% { opacity: 1; }
  25% { z-index: 2; }
  27% { z-index: 14; }
  62% { z-index: 14; }
  65% { z-index: 2; }
  90% { z-index: 2; }
  93% { z-index: 14; }
  100% { z-index: 12; opacity: 1; }
}

/* 结构层默认透明化：announce 等模式下四层包装不参与布局 */
.spr-orbit, .spr-arm, .spr-body, .spr-depth { display: contents; }

.spr.dock.ready .spr-orbit {
  display: block;
  position: absolute;
  left: var(--orbit-cx, calc(min(44vw, 200px) - 8px));
  top: var(--orbit-cy, 139px);
  width: 0;
  height: 0;
  animation: spr-orbit-dock 2.6s linear 0.15s both;
  will-change: transform;
}
@keyframes spr-orbit-dock {
  /* scaleY∘rotate：先转圆轨迹再纵向压扁 = 贴卡椭圆；小人侧用 osq-inv 反向补偿 */
  0% { transform: scaleY(var(--osq, 0.72)) rotate(var(--oa0, -45deg)); animation-timing-function: cubic-bezier(0.55, 0.05, 0.65, 1); }
  22% { transform: scaleY(var(--osq, 0.72)) rotate(calc(var(--oa0, -45deg) + (var(--oa1, 315deg) - var(--oa0, -45deg)) * 0.24)); animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1); }
  /* 绕卡巡航：正面兜底过卡底（匀速段） */
  58% { transform: scaleY(var(--osq, 0.72)) rotate(calc(var(--oa0, -45deg) + (var(--oa1, 315deg) - var(--oa0, -45deg)) * 0.62)); animation-timing-function: linear; }
  84% { transform: scaleY(var(--osq, 0.72)) rotate(calc(var(--oa0, -45deg) + (var(--oa1, 315deg) - var(--oa0, -45deg)) * 0.85)); animation-timing-function: cubic-bezier(0.25, 0, 0.3, 1); }
  /* 沿卡缘螺旋收进停靠位 */
  100% { transform: scaleY(var(--osq, 0.72)) rotate(var(--oa1, 315deg)); }
}

.spr.dock.ready .spr-arm {
  display: block;
  position: absolute;
  left: -22px;
  top: -22px;
  width: 44px;
  animation: spr-arm-dock 2.6s linear 0.15s both;
  will-change: transform;
}
@keyframes spr-arm-dock {
  0% { transform: translateX(var(--r0, 70vw)); animation-timing-function: cubic-bezier(0.4, 0.1, 0.55, 1); }
  22% { transform: translateX(var(--rx, 200px)); }
  76% { transform: translateX(var(--rx, 200px)); animation-timing-function: cubic-bezier(0.45, 0, 0.25, 1); }
  100% { transform: translateX(var(--rL, calc(min(44vw, 200px) + 58px))); }
}

.spr.dock.ready .spr-body {
  display: block;
  width: 100%;
  animation: spr-body-dock 2.6s linear 0.15s both;
  will-change: transform;
}
@keyframes spr-body-dock {
  /* 与 orbit 同步反旋 + 反向压扁（角度严格取负、osq-inv 恰好抵消 osq），小人全程直立不变形 */
  0% { transform: rotate(calc(var(--oa0, -45deg) * -1)) scaleY(var(--osq-inv, 1.39)); animation-timing-function: cubic-bezier(0.55, 0.05, 0.65, 1); }
  22% { transform: rotate(calc((var(--oa0, -45deg) - var(--oa1, 315deg)) * 0.24 - var(--oa0, -45deg))) scaleY(var(--osq-inv, 1.39)); animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1); }
  58% { transform: rotate(calc((var(--oa0, -45deg) - var(--oa1, 315deg)) * 0.62 - var(--oa0, -45deg))) scaleY(var(--osq-inv, 1.39)); animation-timing-function: linear; }
  84% { transform: rotate(calc((var(--oa0, -45deg) - var(--oa1, 315deg)) * 0.85 - var(--oa0, -45deg))) scaleY(var(--osq-inv, 1.39)); animation-timing-function: cubic-bezier(0.25, 0, 0.3, 1); }
  100% { transform: rotate(calc(var(--oa1, 315deg) * -1)) scaleY(var(--osq-inv, 1.39)); }
}

.spr.dock.ready .spr-depth {
  display: block;
  width: 100%;
  animation: spr-depth-dock 2.6s linear 0.15s both;
  will-change: transform, filter;
}
@keyframes spr-depth-dock {
  0% { transform: scale(1.12); filter: blur(0); }
  /* 卡后段1：入场掠过卡顶后方，缩小 + 虚焦（远处感），z 已在 .spr 上翻到卡后 */
  14% { transform: scale(0.92); filter: blur(1px); }
  25% { transform: scale(1); filter: blur(0); }
  /* 正面兜底：恢复清晰 */
  60% { transform: scale(1); filter: blur(0); }
  /* 卡后段2：第二圈绕到卡后，全程最远 */
  70% { transform: scale(0.82); filter: blur(1.8px); }
  80% { transform: scale(0.86); filter: blur(1.2px); }
  90% { transform: scale(1); filter: blur(0); }
  100% { transform: scale(1); filter: blur(0); }
}

/* ---------- announce：从停靠位小幅腾起，仍在左上角播报（与决策面板同位＝身份连续，且不挡正文） ---------- */
.spr.announce {
  top: calc(120px + env(safe-area-inset-top));
  left: 16px;
  width: 60px;
  /* 飞入后的小幅浮动由 .spr-idle 待机动画接管（不再用 margin 位移） */
  animation: spr-fly-announce 0.9s cubic-bezier(0.22, 0.68, 0.32, 1) both;
}
/* 蜡笔贴纸姿态：播报态与停靠态同尺寸 64px（用户拍板两态一致） */
.spr.pose-edge.announce { width: 64px; }
@keyframes spr-fly-announce {
  /* 位移相对播报位（px）：--fly-x/--fly-y = 起飞点偏移。
     从 dock 沿切来时是「卡沿 → 播报位」的真实距离（原地起飞不跳变）；
     fresh 挂载（无 dock 前身）时用默认 220px/90px 的页外入场 */
  0% { transform: translate(var(--fly-x, 220px), var(--fly-y, 90px)) rotate(-9deg) scale(0.85); opacity: 0; }
  20% { opacity: 1; }
  55% { transform: translate(calc(var(--fly-x, 220px) * 0.4), calc(var(--fly-y, 90px) * 0.45)) rotate(-3deg) scale(0.95); } /* 弧线中段：先沉后扬，不走直线 */
  80% { transform: translate(calc(var(--fly-x, 220px) * 0.05), calc(var(--fly-y, 90px) * 0.07)) rotate(-1deg) scale(0.98); }
  100% { transform: translate(0, 0) rotate(0) scale(1); }
}

/* ---------- 角色本体动画 ---------- */
.spr-figure { width: 100%; height: auto; display: block; overflow: visible; }
/* 美术图形态：动画由代码驱动（飞行轨迹/浮动/旋转都作用在整图上） */
.spr-img {
  width: 100%;
  height: auto;
  display: block;
}
/* 待机动画（QQ秀式活人感）：呼吸起伏 + 轻微摇晃，绕脚跟为轴；
   独立一层包装使它与飞行/轨道层的 transform 互不冲突，飞行途中也在呼吸 */
.spr-idle {
  display: block;
  position: relative;
  transform-origin: 50% 90%;
  animation: spr-idle 3.6s ease-in-out infinite;
  will-change: transform;
}
@keyframes spr-idle {
  0%   { transform: translateY(0) rotate(0.4deg) scaleY(1); }
  25%  { transform: translateY(-1.2px) rotate(1deg) scaleY(1.012); }
  50%  { transform: translateY(-2.2px) rotate(0deg) scaleY(1.02); }
  75%  { transform: translateY(-1.2px) rotate(-0.8deg) scaleY(1.012); }
  100% { transform: translateY(0) rotate(0.4deg) scaleY(1); }
}
.spr-blink {
  position: absolute;
  inset: 0;
  /* 与内置 SVG 同节奏：4.4s 一轮，只在 4%~6% 时间窗露出眨眼帧 */
  animation: spr-blink-frame 4.4s steps(1) infinite;
  opacity: 0;
}
@keyframes spr-blink-frame { 0%, 4%, 6%, 100% { opacity: 0; } 5% { opacity: 1; } }
/* ---------- 内置形象配色（墨团小仙官）：全走主题变量，深浅主题免维护 ---------- */
.spr-halo-dial { fill: var(--paper); }
.spr-halo-ring { stroke: var(--ink-2); stroke-width: 1.3; }
.spr-halo-ticks line { stroke: var(--ink-3); stroke-width: 1; stroke-linecap: round; }
.spr-halo-gnomon { stroke: var(--ink); stroke-width: 1.6; stroke-linecap: round; }
.spr-halo-pin { fill: var(--ink-2); }
.spr-sheen { fill: #FFFFFF; opacity: 0.13; }
.spr-eye { fill: var(--on-ink); }
.spr-mouth { fill: none; stroke: var(--on-ink); stroke-width: 1.5; stroke-linecap: round; opacity: 0.9; }
.spr-blush { fill: var(--bad); opacity: 0.45; }
.spr-book { fill: var(--on-ink); }
.spr-book-line { stroke: var(--ink-2); stroke-width: 1; stroke-linecap: round; }
.spr-ribbon { fill: var(--bad); }

.spr-halo { transform-origin: 32px 7.5px; animation: spr-halo-spin 9s linear infinite; }
@keyframes spr-halo-spin { to { transform: rotate(360deg); } }
.spr-eyes { transform-origin: 32px 33.5px; animation: spr-blink 4.4s steps(1) infinite; }
@keyframes spr-blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }

/* ---------- 播报气泡：挂在小人下方、左对齐（宽度自适应，最长到屏幕 72%） ---------- */
.spr-bubble {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  transform: translateY(8px);
  width: max-content;
  max-width: 72vw;
  background: var(--deep-glass);
  color: var(--on-deep);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13.5px;
  letter-spacing: 0.04em;
  line-height: 1.8;
  white-space: pre-line;
  box-shadow: 0 10px 30px rgba(20, 18, 15, 0.35);
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.spr-bubble.ready { opacity: 1; transform: translateY(0); }
.spr-bubble::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 18px;
  transform: rotate(45deg);
  width: 12px;
  height: 12px;
  background: var(--deep-glass);
}
.spr-caret {
  display: inline-block;
  width: 1px;
  height: 12px;
  background: var(--on-deep);
  margin-left: 2px;
  vertical-align: -1px;
  animation: spr-blink-caret 1s steps(1) infinite;
}
@keyframes spr-blink-caret { 50% { opacity: 0; } }

/* ---------- 蜡笔贴纸姿态：announce 躲猫猫 ----------
   气泡上移叠进小人下半身（深底不透明度足够当遮挡板），小人压在气泡之后＝只露上半身探头；
   64px 盒：小人可见部分到 ~42px，气泡文字区从其下开始不受挡 */
.spr.pose-edge.announce .spr-img { position: relative; z-index: 1; }
.spr.pose-edge.announce .spr-bubble { top: 42px; z-index: 2; }
</style>
