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
