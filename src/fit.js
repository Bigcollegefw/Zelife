import { reactive } from 'vue'

/* 「调整构图」全局层：上传照片后取景（缩放/平移），仅此一次。
   openFitAdjust(desc) → Promise<{ ok, fit }>；ok=false 放弃，fit=null 用居中默认，
   fit={s,x,y}：s 缩放 1~4，x/y 为可用余量的归一化占比（-1~1，跨设备分辨率无关） */
export const fitState = reactive({ open: false, desc: null, resolve: null })

export function openFitAdjust(desc) {
  return new Promise((resolve) => {
    fitState.desc = desc
    fitState.resolve = resolve
    fitState.open = true
  })
}

export function closeFitAdjust(result) {
  fitState.resolve?.(result)
  fitState.open = false
  fitState.desc = null
  fitState.resolve = null
}
