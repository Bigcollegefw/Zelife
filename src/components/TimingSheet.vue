<script setup>
/* 上传视频背景后弹一次：选择选项的弹出时机（立即 / 等视频播完）。
   Teleport 到 body：画布 .zoomer 带 will-change:transform，其下 fixed 后代
   会退化成相对画布定位——挂到 body 才永远贴屏幕正下方 */
const emit = defineEmits(['pick', 'close'])
</script>

<template>
  <Teleport to="body">
    <div class="ts-mask" @click="emit('close')">
      <div class="ts-sheet" @click.stop>
        <div class="ts-t">选项时机</div>
        <button class="ts-i" @click="emit('pick', false)">
          <span>与旁白同时出现 <i>默认</i></span>
          <small>进入选择页立即显示选项</small>
        </button>
        <button class="ts-i" @click="emit('pick', true)">
          <span>视频播完再弹出</span>
          <small>循环视频在第一遍播完时弹出</small>
        </button>
        <button class="ts-cancel" @click="emit('close')">暂不选择</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ts-mask {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.ts-sheet {
  width: 100%; max-width: 460px;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 14px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column;
  animation: ts-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes ts-up { from { transform: translateY(40%); opacity: 0.4; } }
.ts-t { font-size: 13px; color: var(--ink-2); letter-spacing: 0.08em; padding: 2px 2px 8px; }
.ts-i {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  border: none; background: none; font: inherit; color: var(--ink);
  text-align: left; padding: 11px 10px; border-radius: 6px; cursor: pointer;
}
.ts-i:active { background: var(--mist); }
.ts-i span { font-size: 14px; }
.ts-i i {
  font-style: normal; font-size: 10px; color: var(--ink-3);
  border: 1px solid var(--line); border-radius: 4px; padding: 1px 4px; margin-left: 2px;
}
.ts-i small { font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; }
.ts-cancel {
  border: none; background: none; font: inherit; font-size: 13px; color: var(--ink-3);
  padding: 10px; cursor: pointer; letter-spacing: 0.1em;
}
</style>
