import { reactive } from 'vue'

/* 夜记存档：每天生成的那封信永久留档，可回看 / 编辑 / 删除。
   localStorage 键 galplan-nightlog-v1，数组按时间倒序：
   { id: '2026-10-18', dateLabel, text, tierKey, tierLabel, state, presetName, choices, missed, edited, editedAt } */
const KEY = 'galplan-nightlog-v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 存档损坏则当作没有 */
  }
  return []
}

export const letters = reactive(load())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(letters))
  } catch {
    /* 存满则放弃（照片通常是大头，先考虑清照片） */
  }
}

/** 生成即存档：同一天再次生成覆盖元数据；已手动编辑过的正文不被覆盖 */
export function saveLetter(entry) {
  const i = letters.findIndex((x) => x.id === entry.id)
  if (i >= 0) {
    const kept = letters[i].edited ? { text: letters[i].text, edited: letters[i].edited } : {}
    letters[i] = { ...entry, ...kept }
  } else {
    letters.unshift(entry)
  }
  persist()
}

/** 用户手动改信：标记 edited，之后重新生成不再覆盖 */
export function updateLetter(id, text) {
  const e = letters.find((x) => x.id === id)
  if (!e) return
  e.text = text
  e.edited = true
  e.editedAt = Date.now()
  persist()
}

export function deleteLetter(id) {
  const i = letters.findIndex((x) => x.id === id)
  if (i >= 0) letters.splice(i, 1)
  persist()
}
