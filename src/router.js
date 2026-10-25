import { createRouter, createWebHashHistory } from 'vue-router'
import { useGame, guest } from './store.js'
import { api } from './api.js'
import IntroView from './views/IntroView.vue'
import StageView from './views/StageView.vue'
import EditorView from './views/EditorView.vue'
import ReportView from './views/ReportView.vue'
import LettersView from './views/LettersView.vue'
import ProfileView from './views/ProfileView.vue'
import WorkView from './views/WorkView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  // 换页回到顶部：文档滚动不会自己复位，长页滚到底再进别的页会停在半中间
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    { path: '/', redirect: () => {
      const { state } = useGame()
      if (guest.on) return `/w/${guest.work?.code ?? ''}`
      return state.started ? '/stage' : '/intro'
    } },
    { path: '/intro', component: IntroView },
    { path: '/stage', component: StageView },
    // 汇总页已并入侧边抽屉：旧路径按身份送回该去的地方
    { path: '/summary', redirect: '/' },
    { path: '/editor', component: EditorView },
    { path: '/report', component: ReportView },
    { path: '/letters', component: LettersView },
    { path: '/me', component: ProfileView },
    // 访客空间：全程关在 /w/:code 下——URL 永远标识作品，翻页可重新验权
    { path: '/w/:code', component: WorkView },
    { path: '/w/:code/stage', component: StageView },
    { path: '/w/:code/summary', redirect: (to) => `/w/${to.params.code}` },
    { path: '/w/:code/report', component: ReportView },
    { path: '/w/:code/editor', component: EditorView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/* 访客空间守卫：
   1) 子页要求沙箱里正是这部作品——刷新/别人转发深链时回落地页重进（进度不保存，符合预期）
   2) 每次访客翻页向服务器确认作品仍开放：作者停用后翻页即请离；正在播的当前一幕不打断
      （内容已在对方设备上，任何系统都无法中途收回，只能在下个验权点请离）
   3) 访客会话不进本人空间：/w/ 之外的路径一律弹回作品落地页 */
router.beforeEach(async (to) => {
  if (to.path.startsWith('/w/')) {
    const code = to.params.code
    const isLanding = to.path === `/w/${code}`
    if (!isLanding && (!guest.on || guest.work?.code !== code)) return `/w/${code}`
    if (!isLanding) {
      try {
        const r = await api(`/works/${code}/status`)
        if (r.status !== 'active') return `/w/${code}` // 落地页显示「作者已关闭」并清沙箱
      } catch {
        /* 网络抖动放行：刷新与落地页仍会兜底验权 */
      }
    }
    return true
  }
  if (guest.on) return `/w/${guest.work?.code ?? ''}`
  const { state } = useGame()
  if (!state.started && !['/intro', '/editor', '/letters', '/me'].includes(to.path)) return '/intro'
})

export default router
