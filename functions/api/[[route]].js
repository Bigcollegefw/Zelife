/* API 单入口：/api/* 全部由本文件处理（[[route]] 通配）。错误一律 { error: 中文 }。 */
import {
  json, readJsonBody, sha256Hex, randomToken, randomCode6,
  isEmail, todayUTC, genNickname, isLocalRequest, genWorkCode, isWorkCode,
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

    /* ---- M2 分享（私有链接） ---- */
    if (pathname === '/api/works' && request.method === 'POST') return await handleWorkCreate(env, request)
    if (pathname === '/api/works' && request.method === 'GET') return await handleWorkList(env, request)
    const wsMatch = /^\/api\/works\/([A-Za-z0-9]{8})\/status$/.exec(pathname)
    if (wsMatch && request.method === 'GET') return await handleWorkStatus(env, wsMatch[1])
    const wMatch = /^\/api\/works\/([A-Za-z0-9]{8})$/.exec(pathname)
    if (wMatch && request.method === 'GET') return await handleWorkGet(env, request, wMatch[1])
    if (wMatch && request.method === 'PATCH') return await handleWorkPatch(env, request, wMatch[1])
    if (wMatch && request.method === 'DELETE') return await handleWorkDelete(env, request, wMatch[1])
    const mMatch = /^\/api\/media\/([A-Za-z0-9]{8})\/(f\d{1,3})$/.exec(pathname)
    if (mMatch && request.method === 'GET') return await handleMediaGet(env, request, mMatch[1], mMatch[2])
    if (pathname === '/api/reports' && request.method === 'POST') return await handleReportCreate(env, request)
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

/* ==================== M2 分享（私有链接） ====================
   works 表存剧本快照（描述符已改写成远端 url 形态），媒体文件进 R2。
   停用 = status revoked（可恢复）；删除 = 行 + R2 对象一并清。
   配额：单作品媒体总量 50MB / ≤48 个文件 / 每人 5 个进行中的分享。 */

const WORK_MAX_TOTAL = 50 * 1024 * 1024 + 2 * 1024 * 1024 // 50MB + 表单编码余量
const WORK_MAX_FILES = 48
const WORK_MAX_ACTIVE = 5
const REPORT_REASONS = ['违规内容', '侵权', '垃圾广告']

/* 上传分享：multipart/form-data——title + preset(JSON 串，媒体描述符带 ref=f0..fN) + f0..fN 文件 */
async function handleWorkCreate(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)

  let form
  try {
    form = await request.formData()
  } catch {
    return json({ error: '上传内容解析失败' }, 400)
  }
  const title = String(form.get('title') ?? '').trim().slice(0, 24)
  if (!title) return json({ error: '缺少作品名' }, 400)
  const presetRaw = String(form.get('preset') ?? '')
  if (!presetRaw || presetRaw.length > 2 * 1024 * 1024) return json({ error: '剧本数据过大' }, 400)

  let preset
  try {
    preset = JSON.parse(presetRaw)
  } catch {
    return json({ error: '剧本数据解析失败' }, 400)
  }
  if (!preset || typeof preset !== 'object' || !preset.nodes || typeof preset.nodes !== 'object' || !preset.start) {
    return json({ error: '剧本数据格式不对' }, 400)
  }

  const files = []
  let total = 0
  for (const [key, val] of form.entries()) {
    if (!/^f\d+$/.test(key)) continue
    if (typeof val === 'string') return json({ error: '媒体上传格式不对' }, 400)
    total += val.size
    files.push([key, val])
  }
  if (files.length > WORK_MAX_FILES) return json({ error: '媒体文件太多了，请精简一下' }, 413)
  if (total > WORK_MAX_TOTAL) return json({ error: '媒体总量超过 50MB 上限，请删掉一些照片视频再分享' }, 413)

  const cnt = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM works WHERE owner_id = ? AND status = 'active'"
  ).bind(auth.row.id).first()
  if ((cnt?.n ?? 0) >= WORK_MAX_ACTIVE) {
    return json({ error: `最多同时保留 ${WORK_MAX_ACTIVE} 个分享，请先停用或删除旧的` }, 429)
  }

  const now = Date.now()
  let code = null
  for (let i = 0; i < 5; i++) {
    const c = genWorkCode()
    const dup = await env.DB.prepare('SELECT 1 FROM works WHERE code = ?').bind(c).first()
    if (!dup) {
      code = c
      break
    }
  }
  if (!code) return json({ error: '生成分享码失败，请重试' }, 500)

  /* 描述符改写：{kind, ref, poster?, fit?, loop?, waitEnd?} → {kind, url, ...}。
     位置与前端 migratePhotosToIdb 同源：节点背景 / 引子照片 / 选项效果照片 / 结算背景。
     ref 在文件表里找不到 → 400（剧本里引用了没上传的媒体）。 */
  const refs = new Set(files.map(([k]) => k))
  try {
    const fixDesc = (o, key) => {
      const v = o[key]
      if (v && typeof v === 'object' && (v.kind === 'photo' || v.kind === 'video')) {
        if (!v.ref || !refs.has(v.ref)) throw new Error(`媒体 ${v.ref ?? '?'} 缺少文件`)
        v.url = `/api/media/${code}/${v.ref}`
        delete v.ref
      } else if (typeof v === 'string' && v.startsWith('data:')) {
        throw new Error('存在未转换的旧格式照片')
      }
    }
    for (const n of Object.values(preset.nodes)) {
      fixDesc(n, 'photo')
      for (const it of n.intros ?? []) fixDesc(it, 'photo')
      for (const c of n.choices ?? []) {
        if (c.effect) fixDesc(c.effect, 'photo')
      }
    }
    if (preset.finale) fixDesc(preset.finale, 'photo')
  } catch (e) {
    return json({ error: `媒体数据不完整：${e.message}` }, 400)
  }

  for (const [slot, file] of files) {
    await env.MEDIA.put(`${code}/${slot}`, file, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    })
  }

  await env.DB.prepare(
    `INSERT INTO works (code, owner_id, title, preset, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`
  ).bind(code, auth.row.id, title, JSON.stringify(preset), now, now).run()
  return json({ code, title })
}

/* 我的分享列表（分享管理用）：带累计浏览数 */
async function handleWorkList(env, request) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  const { results } = await env.DB.prepare(
    `SELECT w.code, w.title, w.status, w.created_at,
            (SELECT COUNT(*) FROM play_events p WHERE p.code = w.code) AS views
     FROM works w WHERE w.owner_id = ? ORDER BY w.created_at DESC`
  ).bind(auth.row.id).all()
  return json({ list: results })
}

/* 轻量状态探测：访客页间跳转时确认作品仍开放（完整 GET 带剧本太重）。
   revoked 也返回 200 {status}，前端守卫统一处理，不用解析错误文案 */
async function handleWorkStatus(env, code) {
  const row = await env.DB.prepare('SELECT status FROM works WHERE code = ?').bind(code).first()
  if (!row) return json({ error: '分享链接不存在或已被删除' }, 404)
  return json({ status: row.status })
}

/* 公开读取： revoked → 410（作者已关闭）；顺手记浏览（同 IP/用户每天 1 次） */
async function handleWorkGet(env, request, code) {
  const row = await env.DB.prepare(
    `SELECT w.code, w.title, w.preset, w.status, w.created_at, w.owner_id, u.nickname AS nickname
     FROM works w JOIN users u ON u.id = w.owner_id WHERE w.code = ?`
  ).bind(code).first()
  if (!row) return json({ error: '分享链接不存在或已被删除' }, 404)
  if (row.status !== 'active') return json({ error: '作者已关闭这份作品的分享' }, 410)

  try {
    const day = todayUTC()
    const token = bearerToken(request)
    const ip = request.headers.get('cf-connecting-ip') ?? ''
    const key = token
      ? 'u:' + (await sha256Hex(token))
      : ip
        ? 'ip:' + (await sha256Hex(`${ip}|${code}|${day}`))
        : null
    if (key) {
      const dup = await env.DB.prepare(
        'SELECT 1 FROM play_events WHERE code = ? AND day = ? AND ip_hash = ?'
      ).bind(code, day, key).first()
      if (!dup) {
        await env.DB.prepare(
          'INSERT INTO play_events (code, viewer, ip_hash, day, created_at) VALUES (?, NULL, ?, ?, ?)'
        ).bind(code, key, day, Date.now()).run()
      }
    }
  } catch {
    /* 浏览计数失败不影响打开 */
  }

  let preset = null
  try {
    preset = JSON.parse(row.preset)
  } catch {
    return json({ error: '这份作品的数据损坏了' }, 500)
  }
  return json({
    code: row.code,
    title: row.title,
    nickname: row.nickname,
    owner_id: row.owner_id,
    created_at: row.created_at,
    preset,
  })
}

/* 停用 / 恢复（owner 校验） */
async function handleWorkPatch(env, request, code) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  const body = await readJsonBody(request)
  const status = String(body.status ?? '')
  if (status !== 'active' && status !== 'revoked') return json({ error: '状态值不对' }, 400)
  const r = await env.DB.prepare(
    'UPDATE works SET status = ?, updated_at = ? WHERE code = ? AND owner_id = ?'
  ).bind(status, Date.now(), code, auth.row.id).run()
  if (!r.meta.changes) return json({ error: '分享不存在' }, 404)
  return json({ ok: true, status })
}

/* 删除：R2 前缀下对象 + 行一起清（不可恢复） */
async function handleWorkDelete(env, request, code) {
  const auth = await requireUser(env, request)
  if (!auth) return json({ error: '登录已过期，请重新登录' }, 401)
  const row = await env.DB.prepare('SELECT code FROM works WHERE code = ? AND owner_id = ?').bind(code, auth.row.id).first()
  if (!row) return json({ error: '分享不存在' }, 404)
  let cursor
  do {
    const list = await env.MEDIA.list({ prefix: `${code}/`, cursor })
    if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key))
    cursor = list.truncated ? list.cursor : undefined
  } while (cursor)
  await env.DB.prepare('DELETE FROM works WHERE code = ?').bind(code).run()
  return json({ ok: true })
}

/* 媒体读取：immutable 缓存（内容只跟分享码走，永不原地变更）。
   带 Range 头时走 206（iOS Safari 视频 seek 需要）；码位非法一律 404 */
async function handleMediaGet(env, request, code, slot) {
  if (!isWorkCode(code) || !/^f\d{1,3}$/.test(slot)) return json({ error: '地址不对' }, 404)
  const key = `${code}/${slot}`
  const rangeHdr = request.headers.get('range')
  if (!rangeHdr) {
    const obj = await env.MEDIA.get(key)
    if (!obj) return json({ error: '媒体不存在' }, 404)
    return new Response(obj.body, { headers: mediaHeaders(obj) })
  }
  const head = await env.MEDIA.head(key)
  if (!head) return json({ error: '媒体不存在' }, 404)
  const size = head.size
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHdr.trim())
  let start = 0
  let end = size - 1
  if (m && m[1] === '' && m[2] !== '') {
    start = Math.max(0, size - Number(m[2])) // 后缀式 bytes=-N
  } else if (m && m[1] !== '') {
    start = Number(m[1])
    if (m[2] !== '') end = Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isFinite(start) || start >= size) return json({ error: '范围不对' }, 416)
  if (end < start) end = size - 1
  const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } })
  if (!obj) return json({ error: '媒体不存在' }, 404)
  const headers = mediaHeaders(obj)
  headers.set('content-range', `bytes ${start}-${end}/${size}`)
  headers.set('accept-ranges', 'bytes')
  return new Response(obj.body, { status: 206, headers })
}

function mediaHeaders(obj) {
  return new Headers({
    'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
  })
}

/* 举报：先落流水（处置界面随 M3）；同 IP 同作品同原因每天记一条 */
async function handleReportCreate(env, request) {
  const body = await readJsonBody(request)
  const code = String(body.code ?? '')
  const reason = String(body.reason ?? '')
  const detail = String(body.detail ?? '').trim().slice(0, 500)
  if (!isWorkCode(code)) return json({ error: '作品不对' }, 400)
  if (!REPORT_REASONS.includes(reason)) return json({ error: '请选择举报原因' }, 400)
  const w = await env.DB.prepare('SELECT code FROM works WHERE code = ?').bind(code).first()
  if (!w) return json({ error: '作品不存在' }, 404)
  const day = todayUTC()
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  const mark = ip ? await sha256Hex(`r|${ip}|${code}|${day}`) : null
  if (mark) {
    const dup = await env.DB.prepare(
      'SELECT 1 FROM reports WHERE code = ? AND reason = ? AND ip_hash = ?'
    ).bind(code, reason, mark).first()
    if (dup) return json({ ok: true })
  }
  await env.DB.prepare(
    'INSERT INTO reports (code, reason, detail, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(code, reason, detail || null, mark, Date.now()).run()
  return json({ ok: true })
}
