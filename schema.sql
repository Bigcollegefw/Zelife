-- galplan 账号系统（M1）三表。时间一律 epoch ms INTEGER，避免时区解析坑
-- 应用：npm run db:init（本地）/ 上线时 wrangler d1 execute DB --remote --file schema.sql

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,              -- crypto.randomUUID()
  email          TEXT NOT NULL UNIQUE,          -- 一律 trim + 小写归一后写入
  nickname       TEXT NOT NULL,                 -- 注册自动分配「玩家」+4 位随机；可改，2–16 字 + 违禁词
  phone          TEXT,                          -- 预留：后续版本自愿绑定手机号
  phone_verified INTEGER NOT NULL DEFAULT 0,    -- 预留：恒 0
  avatar         BLOB,                          -- 头像字节（客户端压 256px JPEG，服务端 ≤200KB 红线）
  avatar_mime    TEXT,                          -- image/jpeg 等（服务端按魔法字节识别）
  avatar_version INTEGER NOT NULL DEFAULT 0,    -- 每次变更 +1，头像 URL 带 ?v= 破缓存
  avatar_status  TEXT NOT NULL DEFAULT 'none',  -- none|ok|blocked：审核状态机；blocked=违规处置，头像端点 404
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER
);

CREATE TABLE IF NOT EXISTS auth_codes (
  email            TEXT PRIMARY KEY,            -- 一箱一行，重发即覆盖
  code_hash        TEXT NOT NULL,               -- sha256(6位码) hex，不存明文
  attempts         INTEGER NOT NULL DEFAULT 0,  -- 错满 5 次删行，须重新获取
  expires_at       INTEGER NOT NULL,            -- 10 分钟
  last_sent_at     INTEGER NOT NULL,            -- 60 秒重发节流
  sent_count_today INTEGER NOT NULL DEFAULT 0,  -- 每天 5 次发送上限（UTC 切窗，对国内用户有 ±8h 偏差，防滥用场景可接受）
  sent_window_date TEXT NOT NULL                -- 'YYYY-MM-DD'（UTC）
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                 -- sha256(opaque token) hex，客户端只拿原 token
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL                  -- 30 天，/me 剩余 <7 天时滑动续期
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============ M2 分享（私有链接）============

-- 作品快照：分享时的剧本 JSON（媒体描述符已改写为 /api/media/ 远端形态）。
-- 停用 = status 'revoked'（可恢复，访客端显示「作者已关闭分享」）；删除 = 行与 R2 对象一并清除
CREATE TABLE IF NOT EXISTS works (
  code       TEXT PRIMARY KEY,              -- 8 位分享码（去易混字符 0O1lI，随机生成撞库重试）
  owner_id   TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,                 -- 作品名（分享时的预设名，≤24 字）
  preset     TEXT NOT NULL,                 -- 剧本 JSON 字符串
  status     TEXT NOT NULL DEFAULT 'active',-- active | revoked
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_works_owner ON works(owner_id);

-- 浏览流水：每次打开分享链接记一条；同 IP/用户每天只记一次（M3 榜单排序的数据基础）。
-- viewer 与 ip_hash 二选一：登录用户记 id，未登录记 sha256(ip+code+day)（不可回溯原 IP）
CREATE TABLE IF NOT EXISTS play_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  viewer     TEXT,                          -- 登录访客的 users.id
  ip_hash    TEXT,                          -- 未登录访客的脱敏哈希
  day        TEXT NOT NULL,                 -- 'YYYY-MM-DD'（UTC 切窗）
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_play_code_day ON play_events(code, day, ip_hash);
CREATE INDEX IF NOT EXISTS idx_play_code     ON play_events(code);

-- 举报：访客页右上角小旗 → 底部弹层提交；先建表落流水，处置界面随 M3 审核
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  reason     TEXT NOT NULL,                 -- 违规内容 | 侵权 | 垃圾广告
  detail     TEXT,                          -- 可选补充说明，≤500 字
  ip_hash    TEXT,                          -- 轻量防刷：同 IP 同作品同原因每天一条
  created_at INTEGER NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0     -- 0 未处置 | 1 已处置
);
CREATE INDEX IF NOT EXISTS idx_reports_code ON reports(code);
