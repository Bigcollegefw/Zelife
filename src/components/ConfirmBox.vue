<script setup>
import { confirmState, closeConfirm } from '../confirm.js'
</script>

<template>
  <div v-if="confirmState.open" class="cb-mask" @click="closeConfirm(false)">
    <div class="cb" @click.stop>
      <p class="cb-title serif">{{ confirmState.title }}</p>
      <p v-if="confirmState.body" class="cb-body">{{ confirmState.body }}</p>
      <div class="cb-btns">
        <button type="button" class="cb-btn" @click="closeConfirm(false)">取消</button>
        <button type="button" class="cb-btn go" :class="{ danger: confirmState.danger }" @click="closeConfirm(true)">
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cb-mask {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(28, 24, 18, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
}
.cb {
  width: 100%; max-width: 460px;
  background: var(--paper); border: 1px solid var(--line); border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 18px 18px calc(16px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 14px;
  animation: cb-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes cb-up { from { transform: translateY(40%); opacity: 0.4; } }
.cb-title { font-size: 15px; color: var(--ink); letter-spacing: 0.05em; line-height: 1.7; }
.cb-body {
  font-size: 13px; color: var(--ink-2); line-height: 1.9; letter-spacing: 0.03em;
  white-space: pre-line; background: var(--mist); border-radius: 8px; padding: 10px 12px;
}
.cb-btns { display: flex; gap: 10px; }
.cb-btn {
  flex: 1; font: inherit; font-size: 14px; letter-spacing: 0.1em; cursor: pointer;
  padding: 12px 10px; border-radius: 8px; border: none;
  background: var(--mist); color: var(--ink-2);
}
.cb-btn:active { filter: brightness(0.96); }
.cb-btn.go { background: var(--ink); color: #FBFAF7; }
.cb-btn.go:active { background: #211E1A; }
.cb-btn.go.danger { background: var(--bad); }
</style>
