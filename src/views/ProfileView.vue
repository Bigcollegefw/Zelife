<script setup>
/* 玩家主页（我的）。v1：头像占位 + 昵称可改 + 邮箱/加入天数 + 作品/榜单占位 + 退出登录。
   未登录直进此页给登录入口（initAuth 在 App.vue onMounted 已乐观恢复本地 token）。 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth, openLogin, updateNickname, logout, uploadAvatar } from '../auth.js'
import { confirmBox } from '../confirm.js'
import { useGame } from '../store.js'
import { fileToDataUrl } from '../photo.js'
import { dataUrlToBlob } from '../media.js'
import AvatarCropper from '../components/AvatarCropper.vue'

const router = useRouter()
const { state } = useGame()
const { authState } = useAuth()

const backTo = computed(() => (state.started ? '/summary' : '/intro'))
const user = computed(() => authState.user)
const joinedDays = computed(() => {
  if (!user.value?.created_at) return null
  return Math.floor((Date.now() - user.value.created_at) / 86400000) + 1 // 注册当天算第 1 天
})

/* 昵称：点昵称就地编辑，失焦或回车自动保存（没有保存/取消按钮）；
   清空 = 放弃编辑；保存失败留在编辑态让玩家改 */
const editing = ref(false)
const draft = ref('')
const err = ref('')
const pending = ref(false)
const nickInput = ref(null)

async function startEdit() {
  draft.value = user.value?.nickname ?? ''
  err.value = ''
  editing.value = true
  await nextTick()
  nickInput.value?.focus()
  nickInput.value?.select() // 全选：直接输入即整体替换
}

async function commitNick() {
  if (!editing.value) return
  const nickname = draft.value.trim()
  if (!nickname) {
    editing.value = false
    err.value = ''
    return
  }
  if (nickname === user.value?.nickname) {
    editing.value = false
    return
  }
  if (pending.value) return
  pending.value = true
  err.value = ''
  try {
    await updateNickname(nickname)
    editing.value = false
  } catch (e) {
    err.value = e.message
  } finally {
    pending.value = false
  }
}

/* 头像：点圆框选图 → 压成 256px JPEG → 上传；服务端版本号变了 URL 自动换新图 */
const avatarInput = ref(null)
const uploading = ref(false)
const hasAvatar = computed(
  () => (user.value?.avatar_version || 0) > 0 && user.value?.avatar_status === 'ok'
)
const avatarUrl = computed(() =>
  hasAvatar.value ? `/api/users/${user.value.id}/avatar?v=${user.value.avatar_version}` : ''
)

function pickAvatar() {
  if (!uploading.value) avatarInput.value?.click()
}

async function onAvatarFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 清空让同一张图也能重复选
  if (!file || uploading.value) return
  err.value = ''
  try {
    cropSrc.value = await fileToDataUrl(file)
    cropping.value = true // 先调构图，确认后才上传
  } catch (e2) {
    err.value = '这张图读不出来，换一张吧'
  }
}

const cropping = ref(false)
const cropSrc = ref('')

async function onCropDone(dataUrl) {
  cropping.value = false
  uploading.value = true
  err.value = ''
  try {
    await uploadAvatar(dataUrlToBlob(dataUrl))
  } catch (e2) {
    err.value = e2.message
  } finally {
    uploading.value = false
  }
}

async function doLogout() {
  if (!(await confirmBox('退出登录？', { body: '本地进度不受影响', danger: true }))) return
  await logout()
  router.push('/intro')
}
</script>

<template>
  <div class="me">
    <header class="me-head">
      <button class="btn ghost back" @click="router.push(backTo)">‹ 返回</button>
      <div class="me-title serif">我的</div>
    </header>

    <div class="me-core">
      <template v-if="user">
        <div class="me-id">
          <div class="me-avawrap">
            <button class="me-avatarbtn" :disabled="uploading" @click="pickAvatar">
              <img v-if="hasAvatar" class="me-avatar" :src="avatarUrl" alt="头像" />
              <div v-else class="me-avatar serif">{{ (user.nickname || '玩')[0] }}</div>
            </button>
            <input
              ref="avatarInput"
              class="me-avatarfile"
              type="file"
              accept="image/*"
              @change="onAvatarFile"
            />
            <div class="me-avacap">
              <button class="me-mini" :disabled="uploading" @click="pickAvatar">
                {{ uploading ? '上传中…' : '换头像' }}
              </button>
            </div>
          </div>
          <div class="me-idcol">
            <template v-if="!editing">
              <button class="me-nick serif" @click="startEdit">{{ user.nickname }}</button>
            </template>
            <template v-else>
              <input
                ref="nickInput"
                v-model="draft"
                class="me-nickinput serif"
                maxlength="16"
                spellcheck="false"
                autocapitalize="off"
                autocorrect="off"
                @blur="commitNick"
                @keyup.enter="$event.target.blur()"
              />
              <div v-if="err" class="me-err">{{ err }}</div>
            </template>
          </div>
        </div>
        <div v-if="err && !editing" class="me-err">{{ err }}</div>
        <div class="me-mail">{{ user.email }}</div>
        <div v-if="joinedDays" class="me-joined">加入第 {{ joinedDays }} 天</div>

        <ul class="me-list">
          <li>
            <i>作品</i><span>把你的剧本分享给朋友 <b class="soon">· M2 敬请期待</b></span>
          </li>
          <li>
            <i>榜单</i><span>看看大家都在过怎样的一天 <b class="soon">· M3 敬请期待</b></span>
          </li>
        </ul>

        <button class="btn ghost big me-out" @click="doLogout">退出登录</button>
      </template>

      <template v-else>
        <p class="me-nonetext">还没有登录</p>
        <button class="btn primary big" @click="openLogin()">登录 / 注册</button>
      </template>
    </div>

    <AvatarCropper
      v-if="cropping"
      :src="cropSrc"
      @done="onCropDone"
      @cancel="cropping = false"
    />
  </div>
</template>

<style scoped>
.me {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex; flex-direction: column;
  padding: 24px 30px 26px;
}
.me-head { display: flex; align-items: center; gap: 12px; }
.me-head .back { padding: 7px 14px; font-size: 13px; }
.me-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }
.me-core { margin: auto 0; }

.me-id { display: flex; align-items: flex-start; gap: 16px; }
.me-avawrap { display: flex; flex-direction: column; align-items: center; flex: none; }
.me-avatarbtn {
  border: none; background: none; padding: 0; cursor: pointer;
  display: block; border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}
.me-avatarbtn:active { opacity: 0.85; }
.me-avatar {
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--mist);
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; color: var(--ink); flex: none;
  line-height: 1;
  overflow: hidden;
}
/* 照片态：不用 flex 居中（img 无内容可居中），object-fit 裁满圆 */
img.me-avatar { display: block; object-fit: cover; }
.me-avatarfile { display: none; }
.me-avacap { display: flex; gap: 10px; margin-top: 6px; }
.me-idcol {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  min-height: 64px; /* 与头像同高：名字（含报错行）在头像正中高度上垂直居中 */
  justify-content: center;
}
.me-nick {
  border: none; background: none; font: inherit; cursor: pointer;
  font-size: 24px; color: var(--ink); padding: 0;
  text-align: left;
  -webkit-tap-highlight-color: transparent; /* 关掉移动端点按黑闪 */
}
.me-nickinput {
  width: min(220px, 100%);
  border: none; border-bottom: 1px solid var(--line); border-radius: 0;
  background: none; outline: none;
  font-size: 16px; color: var(--ink); padding: 4px 2px 5px;
}
.me-nickinput:focus { border-bottom-color: var(--ink-3); }
.me-mini {
  border: none; background: none; font: inherit; cursor: pointer;
  font-size: 12px; color: var(--ink-2); padding: 4px 2px;
  -webkit-tap-highlight-color: transparent;
}
.me-mini:disabled { opacity: 0.5; }
.me-err { font-size: 12px; color: var(--bad); margin-top: 6px; }
.me-mail {
  font-size: 12px; color: var(--ink-3); margin-top: 10px;
  letter-spacing: 0.05em; word-break: break-all;
}
.me-joined { font-size: 12px; color: var(--ink-3); margin-top: 4px; letter-spacing: 0.05em; }

.me-list { list-style: none; margin: 30px 0 0; padding: 0; }
.me-list li {
  display: grid; grid-template-columns: 66px 1fr;
  gap: 12px; align-items: baseline;
  padding: 13px 2px; border-top: 1px solid var(--line);
}
.me-list li:last-child { border-bottom: 1px solid var(--line); }
.me-list i {
  font-style: normal; font-family: var(--serif);
  font-size: 14px; letter-spacing: 0.2em; color: var(--ink);
}
.me-list span { font-size: 13px; color: var(--ink-2); line-height: 1.8; }
.soon { font-weight: normal; color: var(--ink-3); font-size: 11px; }

.me-out { margin-top: 30px; }
.me-nonetext { font-size: 13px; color: var(--ink-2); margin: 0 0 14px; }
</style>
