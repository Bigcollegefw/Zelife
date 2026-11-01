<script setup>
/* 协议页（用户协议 / 隐私政策）：设置 › 关于 进入，按路由参数 type 切内容。
   文案与当前实现一一对应（本地优先存储、账号只存邮箱昵称、分享才上传、无第三方统计），
   后续行为变更时同步改这里。 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { guest } from '../store.js'

const route = useRoute()
const router = useRouter()

const docs = {
  terms: {
    title: '用户协议',
    sections: [
      {
        h: '这是什么',
        p: '「择择人生」是一个实验性的演示应用：把你的一天过成一部 galgame。你在里面创建剧本、拍照、做选择、写夜记。',
      },
      {
        h: '你的内容由你负责',
        p: '剧本、照片、夜记都由你本人创建，请勿上传违法或侵犯他人权利的内容。',
      },
      {
        h: '分享由你主动发起',
        p: '只有你点「分享」才会生成公开链接，任何拿到链接的人都能体验这部作品；你可以随时在分享管理里停用或删除，停用后链接立即失效。',
      },
      {
        h: '演示阶段',
        p: '本项目仍在演示阶段，功能与服务可能调整或中止。重要的照片和文字，请不要只存放在这里。',
      },
      {
        h: '没有付费内容',
        p: '当前版本不提供任何付费项目。',
      },
    ],
  },
  privacy: {
    title: '隐私政策',
    sections: [
      {
        h: '本地优先',
        p: '你的进度、剧本、照片视频与夜记默认只保存在你的设备（浏览器本地存储）里。不登录也能完整使用。',
      },
      {
        h: '账号',
        p: '注册登录后，服务器只保存你的邮箱与昵称，用于登录和作品署名。',
      },
      {
        h: '分享',
        p: '你分享作品时，剧本与其中的照片视频才会上传服务器，供拿到链接的人访问；停用或删除分享后，不再提供访问。',
      },
      {
        h: '不追踪',
        p: '本应用不嵌入第三方统计、广告或追踪代码。',
      },
      {
        h: '删除',
        p: '清除浏览器的站点数据即可删除这台设备上的全部本地内容；账号资料与已分享作品可在应用内管理。',
      },
    ],
  },
}

const doc = computed(() => docs[route.params.type] ?? docs.terms)
const backTo = computed(() => (guest.on ? `/w/${guest.work?.code}/settings` : '/settings'))
</script>

<template>
  <div class="doc">
    <header class="doc-head">
      <button class="btn ghost back" @click="router.push(backTo)">‹ 返回</button>
      <div class="doc-title serif">设置</div>
    </header>

    <h1 class="doc-h serif">{{ doc.title }}</h1>
    <p class="doc-note">演示版 · 更新于 2026 年 11 月</p>

    <section v-for="(s, i) in doc.sections" :key="i" class="doc-sec">
      <h2 class="doc-sec-h serif">{{ s.h }}</h2>
      <p class="doc-p serif">{{ s.p }}</p>
    </section>
  </div>
</template>

<style scoped>
.doc {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 24px 30px 40px;
}
.doc-head { display: flex; align-items: center; gap: 12px; }
.doc-head .back { padding: 7px 14px; font-size: 13px; }
.doc-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }

.doc-h {
  font-size: 22px;
  letter-spacing: 0.12em;
  margin: 26px 0 4px;
  font-weight: 600;
}
.doc-note {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
  margin: 0 0 8px;
}
.doc-sec { margin-top: 18px; }
.doc-sec-h {
  font-size: 14px;
  letter-spacing: 0.1em;
  margin: 0 0 6px;
  font-weight: 600;
}
.doc-p {
  margin: 0;
  font-size: 14px;
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--ink);
}
</style>
