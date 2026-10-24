<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGame } from './store.js'
import { migratePhotosToIdb } from './media.js'
import ConfirmBox from './components/ConfirmBox.vue'
import FitAdjust from './components/FitAdjust.vue'

const route = useRoute()
const { state, presets, persistPresets } = useGame()

onMounted(() => {
  // 一次性：历史 dataURL 照片搬进 IndexedDB，给 localStorage 瘦身
  migratePhotosToIdb(presets, persistPresets)
})
</script>

<template>
  <div class="shell" :style="{ '--gloom': state.gloom }">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
    <ConfirmBox />
    <FitAdjust />
  </div>
</template>
