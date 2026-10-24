/* 内容规范 v0（基础版，后续升级路径见 README「账号系统」）：
   - 昵称：长度在接口层校验（2–16），命中违禁词即拒。词库 = 冒充类 + 违法违规最小集，
     故意用子串匹配 + 不告知命中词（防止试探绕过）。量大后换云端词库/内容安全 API。
   - 头像：服务端按魔法字节识别格式（不信客户端 content-type），只收 JPEG/PNG/WebP。
     审核状态机见 schema.sql 的 avatar_status；处置接口见 [[route]].js 的 /api/admin/*。 */

const NICKNAME_BLOCKED = [
  // 冒充官方/管理（个人 app 也拦，防后续榜单期被冒充）
  '管理', 'admin', 'administrator', 'root', '官方', 'official', '客服', '系统', 'galplan',
  // 违法违规最小集（起步词库，按需增删）
  '赌博', '博彩', '色情', '援交', '招嫖', '吸毒', '贩毒', '外挂', '枪支', '代开发票',
]

/* 返回命中的违禁词（仅日志用），无命中返回 null */
export function nicknameViolation(nickname) {
  const s = nickname.toLowerCase()
  return NICKNAME_BLOCKED.find((w) => s.includes(w)) || null
}

/* 头像格式识别：看文件头字节，返回 mime 或 null */
export function sniffImageMime(bytes) {
  const b = new Uint8Array(bytes)
  if (b.length < 12) return null
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  // WebP: RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp'
  return null
}
