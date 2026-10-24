/* API 单入口：/api/* 全部由本文件处理（[[route]] 通配）。错误一律 { error: 中文 }。 */
import {
  json, readJsonBody, sha256Hex, randomToken, randomCode6,
  isEmail, todayUTC, genNickname, isLocalRequest,
} from '../_lib/util.js'
import { sendVerificationEmail } from '../_lib/mail.js'
import { nicknameViolation, sniffImageMime } from '../_lib/moderation.js'

const CODE_TTL = 10 * 60 * 1000
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000
const RENEW_LEFT = 7 * 24 * 60 * 60 * 1000
const AVATAR_MAX = 200 * 1024

export async function onRequest({ request, env }) {
  try {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/auth/request-code' && request.method === 'POST') return await handleRequestCode(env, request)
    if (pathname === '/api/auth/verify' && request.method === 'POST') return await handleVerify(env, request)
    if (pathname === '/api/me' && request.method === 'GET') return await handleMe(env, request)
    if (pathname === '/api/me' && request.method === 'PATCH') return await handleUpdateMe(env, request)
    if (pathname === '/api/me/avatar' && request.method === 'PUT') return await handleAvatarPut(env, request)
    if (pathname === '/api/me/avatar' && request.method === 'DELETE') return await handleAvatarDelete(env, request)
    const avMatch = /^\/api\/users\/([^/]+)\/avatar$/.exec(pathname)
    if (avMatch && request.method === 'GET') return await handleUserAvatar(env, avMatch[1])
    const stMatch = /^\/api\/admin\/users\/([^/]+)\/avatar-status$/.exec(pathname)
    if (stMatch && request.method === 'POST') return await handleAdminAvatarStatus(env, request, stMatch[1])
    if (pathname === '/api/admin/avatars' && request.method === 'GET') return await handleAdminAvatars(env, request)
    if (pathname === '/api/auth/logout' && request.method === 'POST') return await handleLogout(env, request)
    return json({ error: '接口不存在' }, 404)
  } catch (e) {
    console.error('[api]', e)
    return json({ error: '服务器开小差了，稍后再试' }, 500)
  }
}

function bearerToken(request) {
  const m = /Bearer\s+(.+)/i.exec(request.headers.get('authorization') || '')
  return m ? m[1].trim() : null
}

/* 返回 { row, tokenHash } 或 null */
async function requireUser(env, request) {
  const token = bearerToken(request)
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const row = await env.DB.prepare(
    `SELECT s.expires_at AS expires_at, u.id AS id, u.email AS email, u.nickname AS nickname,
            u.created_at AS created_at, u.avatar_version AS avatar_version, u.avatar_status AS avatar_status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(tokenHash, Date.now()).first()
  return row ? { row, tokenHash } : null
}

async function handleRequestCode(env, request) {
  const body = await readJsonBody(request)
  const email = String(body.email || '').trim().toLowerCase()
  if (!isEmail(email)) return json({ error: '邮箱格式好像不太对' }, 400)

  const now = Date.now()
  const today = todayUTC()
  const prev = await env.DB.prepare(
    'SELECT last_sent_at, sent_count_today, sent_window_date FROM auth_codes WHERE email = ?'
  ).bind(email).first()
  if (prev && now - prev.last_sent_at < 60_000) return json({ error: '发送太频繁，请稍等一分钟' }, 429)
  const sentToday = prev && prev.sent_window_date === today ? prev.sent_count_today : 0
  if (sentToday >= 5) return json({ error: '今天的发送次数已达上限，明天再来吧' }, 429)

  const code = randomCode6()
  await env.DB.prepare(
    `INSERT INTO auth_codes (email, code_hash, attempts, expires_at, last_sent_at, sent_count_today, sent_window_date)
     VALUES (?, ?, 0, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, attempts=0, expires_at=excluded.expires_at,
       last_sent_at=excluded.last_sent_at, sent_count_today=excluded.sent_count_today, sent_window_date=excluded.sent_window_date`
  ).bind(email, await sha256Hex(code), now + CODE_TTL, now, sentToday + 1, today).run()

  if (env.DEV_FALLBACK && isLocalRequest(request)) return json({ ok: true, devCode: code })
  try {
    await sendVerificationEmail(env, email, code)
  } catch {
    return json({ error: '邮件发送失败，请稍后再试' }, 500)
  }
  return json({ ok: true })
}

async function handleVerify(env, request) {
  const body = await readJsonBody(request)
  const email = String(body.email || '').trim().toLowerCase()
  const code = String(body.code || '').replace(/\D/g, '')
  if (!isEmail(email) || code.length !== 6) return json({ error: '验证码是 6 位数字' }, 400)

  const row = await env.DB.prepare(
    'SELECT code_hash, attempts, expires_at FROM auth_codes WHERE email = ?'
  ).bind(email).first()
  if (!row) return json({ error: '请先获取验证码' }, 400)
  if (row.attempts >= 5) {
    await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run()
    return json({ error: '尝试次数太多，请重新获取验证码' }, 400)
  }
  if (Date.now() > row.expires_at) {
    await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run()
    return json({ error: '验证码已过期，请重新获取' }, 400)
  }
  if ((await sha256Hex(code)) !== row.code_hash) {
    await env.DB.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    return json({ error: '验证码不正确' }, 400)
  }
  await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run()

  const now = Date.now()
  const user = await env.DB.prepare(
    `INSERT INTO users (id, email, nickname, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at
     RETURNING id, email, nickname, created_at, avatar_version, avatar_status`
  ).bind(crypto.randomUUID(), email, genNickname(), now, now).first()

  const token = randomToken()
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256Hex(token), user.id, now, now + SESSION_TTL).run()
  return json({ token, user })
}

async function handleMe(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  if (auth.row.expires_at - Date.now() < RENEW_LEFT) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(Date.now() + SESSION_TTL, auth.tokenHash).run()
  }
  const { expires_at: _drop, ...user } = auth.row // expires_at 是会话内部字段，不外发
  return json({ user })
}

async function handleUpdateMe(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)

  const body = await readJsonBody(request)
  const nickname = String(body.nickname ?? '').trim()
  if (nickname.length < 2 || nickname.length > 16) return json({ error: '昵称要 2–16 个字' }, 400)
  const bad = nicknameViolation(nickname)
  if (bad) {
    console.log('[moderation] nickname blocked:', auth.row.email, bad)
    return json({ error: '昵称包含违规内容，换一个吧' }, 400)
  }
  const user = await env.DB.prepare(
    'UPDATE users SET nickname = ? WHERE id = ? RETURNING id, email, nickname, created_at, avatar_version, avatar_status'
  ).bind(nickname, auth.row.id).first()
  return json({ user })
}

/* 头像：客户端已压 256px JPEG；服务端只兜底大小与格式（魔法字节） */
async function handleAvatarPut(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  const buf = await request.arrayBuffer()
  if (!buf.byteLength) return json({ error: '没有收到图片' }, 400)
  if (buf.byteLength > AVATAR_MAX) return json({ error: '头像太大，请重新选一张' }, 400)
  const mime = sniffImageMime(buf)
  if (!mime) return json({ error: '只支持 JPG / PNG / WebP 图片' }, 400)

  await env.DB.prepare(
    "UPDATE users SET avatar = ?, avatar_mime = ?, avatar_version = avatar_version + 1, avatar_status = 'ok' WHERE id = ?"
  ).bind(new Uint8Array(buf), mime, auth.row.id).run()
  const row = await env.DB.prepare(
    'SELECT avatar_version, avatar_status FROM users WHERE id = ?'
  ).bind(auth.row.id).first()
  return json({ avatar_version: row.avatar_version, avatar_status: row.avatar_status })
}

async function handleAvatarDelete(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  await env.DB.prepare(
    "UPDATE users SET avatar = NULL, avatar_mime = NULL, avatar_version = avatar_version + 1, avatar_status = 'none' WHERE id = ?"
  ).bind(auth.row.id).run()
  return json({ ok: true })
}

/* 公开头像：仅 avatar_status='ok' 对外可见（blocked=违规处置）；immutable 缓存靠 URL 上的版本号失效 */
async function handleUserAvatar(env, userId) {
  const row = await env.DB.prepare(
    'SELECT avatar, avatar_mime, avatar_status FROM users WHERE id = ?'
  ).bind(userId).first()
  const bytes = row && blobToBytes(row.avatar)
  if (!bytes) return json({ error: '无头像' }, 404)
  return new Response(bytes, {
    headers: {
      'content-type': row.avatar_mime || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}

/* D1 的 BLOB 读取形态不定：远端返回 Uint8Array，wrangler 本地返回 "255,216,..." 十进制串。
   这里统一归一成字节，两条路都保真 */
function blobToBytes(v) {
  if (v instanceof Uint8Array) return v
  if (Array.isArray(v)) return new Uint8Array(v)
  if (typeof v === 'string') {
    if (/^\d{1,3}(,\d{1,3})*$/.test(v)) return new Uint8Array(v.split(',').map(Number))
    try {
      return Uint8Array.from(atob(v), (c) => c.charCodeAt(0))
    } catch {
      return null
    }
  }
  return null
}

/* 管理端处置：x-admin-token 鉴权（.dev.vars 配 ADMIN_TOKEN）。M1 头像不公开，此链路先演练；
   M3 榜单公开头像时把上传默认状态改为 pending，走「先审后发」 */
function isAdmin(env, request) {
  return !!env.ADMIN_TOKEN && request.headers.get('x-admin-token') === env.ADMIN_TOKEN
}

async function handleAdminAvatars(env, request) {
  if (!isAdmin(env, request)) return json({ error: '无权访问' }, 404)
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const sql = status
    ? 'SELECT id, email, nickname, avatar_version, avatar_status FROM users WHERE avatar IS NOT NULL AND avatar_status = ?'
    : 'SELECT id, email, nickname, avatar_version, avatar_status FROM users WHERE avatar IS NOT NULL'
  const stmt = status ? env.DB.prepare(sql).bind(status) : env.DB.prepare(sql)
  const { results } = await stmt.all()
  return json({ list: results })
}

async function handleAdminAvatarStatus(env, request, userId) {
  if (!isAdmin(env, request)) return json({ error: '无权访问' }, 404)
  const body = await readJsonBody(request)
  const status = String(body.status || '')
  if (status !== 'ok' && status !== 'blocked') return json({ error: '状态只能是 ok 或 blocked' }, 400)
  await env.DB.prepare(
    'UPDATE users SET avatar_version = avatar_version + 1, avatar_status = ? WHERE id = ?'
  ).bind(status, userId).run()
  return json({ ok: true })
}

async function handleLogout(env, request) {
  const token = bearerToken(request)
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  }
  return json({ ok: true })
}
