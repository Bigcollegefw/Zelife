<script setup>
/* 同步本机数据（账号与协议 › 同步本机数据）：导出/导入备份文件。
   本应用的数据（剧本、照片视频、夜记、进度）只存本机；这份备份用于
   换设备 / 清浏览器数据前留底。真云同步是将来 M4 级后端工程，届时此页就地升级。 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { confirmBox } from '../confirm.js'
import { exportBackup, parseBackup, applyBackup } from '../backup.js'

const router = useRouter()
const busy = ref('')
const err = ref('')
const fileInput = ref(null)

async function onExport() {
  if (busy.value) return
  busy.value = 'export'
  err.value = ''
  try {
    await exportBackup()
  } catch (e) {
    err.value = e.message
  }
  busy.value = ''
}

function pickImport() {
  if (!busy.value) fileInput.value?.click()
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 清空让同一份文件也能重复选
  if (!file || busy.value) return
  err.value = ''
  let parsed
  try {
    parsed = parseBackup(await file.text())
  } catch (e2) {
    err.value = e2.message
    return
  }
  const d = parsed.date ? new Date(parsed.date) : null
  const when = d && !isNaN(d) ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : '未知时间'
  const ok = await confirmBox('导入这份备份？', {
    body: `备份于 ${when}。导入会覆盖本机现有的剧本、照片视频、夜记与进度。`,
    danger: true,
  })
  if (!ok) return
  busy.value = 'import'
  try {
    await applyBackup(parsed.file)
    location.reload() // store 在模块加载时读档：整体重载才吃到新数据
  } catch (e2) {
    err.value = e2.message
    busy.value = ''
  }
}
</script>

<template>
  <div class="sync">
    <header class="sync-head">
      <button class="btn ghost back" @click="router.push('/settings/account')">‹ 返回</button>
      <div class="sync-title serif">设置</div>
    </header>

    <div class="sync-body">
      <p class="sync-lede serif">你的剧本、照片视频、夜记与进度都只保存在这台设备上。备份成一个文件带去新设备，或清数据前留个底。</p>

      <section class="sync-sec">
        <button class="sync-row" :disabled="!!busy" @click="onExport">
          <span class="sync-name serif">{{ busy === 'export' ? '正在打包…' : '导出备份文件' }}</span>
          <small>照片视频多时会稍等片刻</small>
        </button>
        <button class="sync-row" :disabled="!!busy" @click="pickImport">
          <span class="sync-name serif">{{ busy === 'import' ? '正在恢复…' : '从备份文件导入' }}</span>
          <small>会覆盖本机现有数据，导入前请确认</small>
        </button>
        <input ref="fileInput" class="sync-file" type="file" accept="application/json,.json" @change="onImportFile" />
      </section>

      <p v-if="err" class="sync-err">{{ err }}</p>
      <p class="sync-note">云同步（换设备登录即恢复）开发中，届时无需手动导出。</p>
    </div>
  </div>
</template>

<style scoped>
.sync {
  min-height: 100vh; /* 兜底：不支持 dvh 的旧内核 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 24px 26px 26px;
}
.sync-head { display: flex; align-items: center; gap: 12px; }
.sync-head .back { padding: 7px 14px; font-size: 13px; }
.sync-title { font-size: 14px; letter-spacing: 0.3em; color: var(--ink-2); }
.sync-body { margin-top: 22px; }

.sync-lede {
  margin: 0 2px 18px;
  font-size: 14px;
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--ink);
}

.sync-sec { display: flex; flex-direction: column; }
.sync-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 15px 2px;
  border: none;
  border-top: 1px solid var(--line);
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sync-sec .sync-row:last-of-type { border-bottom: 1px solid var(--line); }
.sync-row:active { background: var(--mist); }
.sync-row:disabled { opacity: 0.6; }
.sync-name { font-size: 14.5px; letter-spacing: 0.1em; }
.sync-row small { font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; }
.sync-file { display: none; }

.sync-err { font-size: 12px; color: var(--bad); margin: 12px 2px 0; }
.sync-note {
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.05em;
  margin: 18px 2px 0;
}
</style>
