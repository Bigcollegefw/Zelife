import { createRouter, createWebHashHistory } from 'vue-router'
import { useGame } from './store.js'
import IntroView from './views/IntroView.vue'
import StageView from './views/StageView.vue'
import SummaryView from './views/SummaryView.vue'
import EditorView from './views/EditorView.vue'
import ReportView from './views/ReportView.vue'
import LettersView from './views/LettersView.vue'
import ProfileView from './views/ProfileView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  // 换页回到顶部：文档滚动不会自己复位，长页滚到底再进别的页会停在半中间
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    { path: '/', redirect: () => (useGame().state.started ? '/stage' : '/intro') },
    { path: '/intro', component: IntroView },
    { path: '/stage', component: StageView },
    { path: '/summary', component: SummaryView },
    { path: '/editor', component: EditorView },
    { path: '/report', component: ReportView },
    { path: '/letters', component: LettersView },
    { path: '/me', component: ProfileView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// 未开始的一天先进开场页（编辑剧本 / 夜记集 / 我的主页不挡）
router.beforeEach((to) => {
  const { state } = useGame()
  if (!state.started && !['/intro', '/editor', '/letters', '/me'].includes(to.path)) return '/intro'
})

export default router
