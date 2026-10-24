import { reactive } from 'vue'

/* 应用内确认弹层：替代浏览器原生 confirm()（原生框带 localhost/网址，破坏 App 感）
   用法：const ok = await confirmBox('标题', { body, danger }) */
export const confirmState = reactive({
  open: false,
  title: '',
  body: '',
  danger: false,
  resolve: null,
})

export function confirmBox(title, { body = '', danger = false } = {}) {
  return new Promise((resolve) => {
    if (confirmState.open) confirmState.resolve?.(false) // 已有弹层：旧的按取消结清
    confirmState.title = title
    confirmState.body = body
    confirmState.danger = danger
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

export function closeConfirm(val) {
  confirmState.resolve?.(val)
  confirmState.open = false
  confirmState.resolve = null
}
