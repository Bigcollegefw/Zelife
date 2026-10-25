/* 侧边抽屉开关（App.vue 挂 SideDrawer，镜像 share.js 的命令式形态） */
import { reactive } from 'vue'

export const drawerState = reactive({ open: false })
export function openDrawer() {
  drawerState.open = true
}
