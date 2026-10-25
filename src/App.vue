<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGame } from './store.js'
import { migratePhotosToIdb } from './media.js'
import { initAuth } from './auth.js'
import ConfirmBox from './components/ConfirmBox.vue'
import FitAdjust from './components/FitAdjust.vue'
import AuthSheet from './components/AuthSheet.vue'
import ShareSheet from './components/ShareSheet.vue'
import SideDrawer from './components/SideDrawer.vue'

const route = useRoute()
const { state, presets, persistPresets } = useGame()

onMounted(() => {
  // 一次性：历史 dataURL 照片搬进 IndexedDB，给 localStorage 瘦身
  migratePhotosToIdb(presets, persistPresets)
  // 账号：后台校验本地 token，不阻塞 app
  initAuth()
})
</script>

<template>
  <div class="shell" :style="{ '--gloom': state.gloom }">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <!-- key 用 fullPath：带 nonce 的同路径跳转（如切换模式后重开舞台）也能强制重挂载 -->
        <component :is="Component" :key="route.fullPath" />
      </transition>
    </router-view>
    <ConfirmBox />
    <FitAdjust />
    <AuthSheet />
    <ShareSheet />
    <SideDrawer />
  </div>
</template>
