# galplan · 把一天过成一场游戏

每日状态监测 H5 demo：把一天里关键的决定时刻做成 galgame 式的选项场景，
你的选择会影响「阴霾值」——守住 50 以下，这一天就是晴的。

## 运行

```bash
npm install
npm run dev      # 前端开发（http://localhost:5173，/api 自动代理到 8787）
npm run build    # 产出 dist/，可静态托管
npm run api      # 账号后端：wrangler pages dev（:8787，本地 D1）
npm run db:init  # 首次跑一次：本地 D1 建表
```

手机真机调试：`npm run dev -- --host` 后用手机开 `http://<电脑局域网IP>:5173`（/api 由电脑侧代理，免 CORS）。

## 账号系统（M1）

邮箱验证码登录/注册（同一入口），只为后续「分享」服务——**本地剧本、照片、进度永远不要求登录、不上传**。后端 = Cloudflare Pages Functions + D1 + Resend，与本仓库同源（`functions/` 目录），开发全程零 CORS。

开发环境一次性配置：

1. `npm run db:init` 建本地表
2. `.dev.vars`（已 gitignore）：`RESEND_API_KEY=` 填 [resend.com](https://resend.com) 的 API Key
3. `DEV_FALLBACK=1`（默认已开）：不真发邮件，验证码直接填进输入框（仅本机请求生效，配到生产也不会泄露）
4. 两个终端：`npm run api` + `npm run dev`，开场页右下「登录」进完整流程

**版本注意**：wrangler 锁定 `4.85.0`（精确版本，无 `^`）——4.88 起要求 Node ≥22，本机 Node 20。升级 Node 后可放开。

**主页 / 头像 / 昵称规范**：

- 登录成功直接进个人页（`#/me`）；开场页第三钮：已登录→主页，未登录→登录弹层
- 昵称 2–16 字，违禁词即拒（词库在 `functions/_lib/moderation.js`，想加词改那里）；注册默认「玩家」+4 位随机
- 头像：点圆框选图 → **AvatarCropper 裁剪器**（双指缩放/单指拖动/双击复位，交互同 FitAdjust）→ 确认后本地裁成 256px JPEG → `PUT /api/me/avatar`（服务端魔法字节验格式、200KB 红线）；公开读取 `GET /api/users/:id/avatar?v=N`（仅 `avatar_status='ok'` 可见，immutable 缓存靠版本号失效）。⚠️ wrangler 本地 D1 把 BLOB 读成 `"255,216,..."` 十进制串，服务端 `blobToBytes()` 自适应归一（远端 D1 返回真 Uint8Array，两条路都保真）
- 审核状态机：`avatar_status` = none / ok / blocked。M1 头像无公开场景 → 上传即 ok；M3 榜单公开头像时把默认改 pending 走「先审后发」。处置：`.dev.vars` 里 `ADMIN_TOKEN` → `curl -H "x-admin-token: <值>" localhost:8787/api/admin/avatars` 列表、`POST /api/admin/users/:id/avatar-status {"status":"blocked"}` 封禁（封后公开端 404，全员回退默认头像）

**上线（M1.5，未执行）**：买域名接 Cloudflare DNS → Pages 连仓库部署（build=`npm run build`，`functions/` 自动生效）→ `wrangler d1 create galplan-db` 回填 `wrangler.toml` 的 `database_id` → `wrangler d1 execute DB --remote --file schema.sql` → 生产 secret 填 `RESEND_API_KEY`（**确认无 DEV_FALLBACK、无 ADMIN_TOKEN 泄露**）→ Resend 验证域名 SPF/DKIM → 绑自定义域名 → QQ/163/Gmail 真实投递测试 → 补隐私政策与用户协议。

## 分享（M2 私有链接）

登录后把当前剧本分享成一条链接，对方在微信/QQ/浏览器里点开即可完整体验（演出 + 回看）+ 只读画布，**无需安装任何东西**。

- **入口**：汇总页「分享此剧本」或个人主页「作品」行 → 弹层里复制链接；同一弹层可管理历史分享（复制 / 停用↔恢复 / 删除，带浏览数）
- **访客隔离**：访客打开 `#/w/:码` 进沙箱——剧本与进度全在内存，不写本机任何数据，关页即散；夜记体验版不存档
- **访客空间**：整个访客流程关在 `#/w/:码/*` 下（stage/summary/report/editor），URL 永远标识作品；每次翻页向服务器确认作品仍开放（`GET /api/works/:码/status`）——**作者停用后：新访客进不来、已打开的访客一翻页即被请离**（正在播的当前一幕内容已在对方设备上，无法中途收回）
- **配额**：单作品媒体 ≤50MB / ≤48 个文件；每人最多 5 个进行中的分享（服务端强制）
- **媒体**：照片/视频上传进 Cloudflare R2（本地 dev 用模拟桶），经 `GET /api/media/:码/:槽` 读取（immutable 缓存 + Range 206，iOS 视频 seek 正常）
- **停用**：链接变「作者已关闭分享」，可随时恢复；删除则行与 R2 对象一并清除
- **浏览计数**：每次打开 +1，同 IP/用户每天只记一次（play_events 表，M3 榜单排序的数据基础）
- **举报**：访客页右上角 ⚑ → 底部弹层，流水进 reports 表（处置界面随 M3）
- **作者打开自己的链接**：访客页显示「这是你分享的作品 · 管理」，体验与访客一致

开发环境追加一次：`npm run db:init`（新增 works / play_events / reports 三张表，IF NOT EXISTS 幂等）。R2 绑定已配在 wrangler.toml（本地模拟，无需真实账号）；上线时创建真桶并回填 bucket_name。

## 玩法

- **主界面即对话**：整个 app 保持 galgame 的对话流——过场卡 → 旁白打字机 → 居中选项 → 选择反馈 → 轻触继续进入下一时刻，全程不跳出对话界面
- **分支剧本**：每个选项的「走向」指向下一个节点——可以分出支线、也可以汇回合流节点、或直接走到结局（不同的夜）。线性剧本就是所有选项指向同一下一节点的退化图
- **真实模式 / 跨天追赶**：打开即跳到当前时间节点；若处于分流之中，则从最近一个确定的合流节点开始补选择，合流之前的时刻顺流而去（阴霾 +8/个）
- **预设**：内置「工作日 / 周末」两套剧本，可复制新建（如上班 / 周末）。每天使用当前激活的预设，编辑改动今天未玩的时刻立刻生效，明天自动沿用
- **照片有记忆**：给某个时刻换上自己的照片（舞台或编辑器里），压缩后持久保存，第二天还在
- **过场段**：一个选项到下一个选项之间可以排多段没有选项的过场（各配照片和文字），像写剧本一样；逐段轻触推进，过场画面上可直接「换过场照片」
- **编辑剧本**（汇总页进入）：节点画布总览——对称布局、全量虚线连线标注选项走向；⤢ 在画布上就地展开完整编辑卡（状态记住）；点小卡 = 相机推进聚焦进节点内部（等比归位 / 驻留直接缩小，全程丝滑）。时间、标题、基调、旁白、过场、照片、选项、走向全部可改，可增删节点和选项，自动保存
- **阴霾值**：0–100，初始 20。≥50 进入失控态（画面起雾，正面选择效果减半）
- **日终夜记**：一天结束时，一封三四百字的信回望你今天的每个选择（demo 为本地模板，正式版接 AI）

两种时间模式（汇总页切换）：

- **演示**：过完一个时刻自动进入下一个，2 分钟过完一天
- **真实**：按当前时间到点解锁，未到点时舞台显示等待旁白；超过 30 分钟未决策会以旁白播报「错过」，阴霾 +8

## 换成你自己的生活

- 用「编辑剧本」改预设：每个时刻的时间、地点、照片、选项和文案都可以改（照片上传时自动压缩，存在本机 localStorage）
- 也可以往 `src/assets/scenes/` 放照片作为某时刻的默认背景（`wake.jpg` 等，见该目录 README）

## 结构

```
src/
├─ gloom.js              # 阴霾值规则（分档 / 失控 / 减半 / 错过）
├─ night.js              # 夜记生成器（demo 本地模板，正式版换 LLM）
├─ photo.js              # 照片压缩（canvas → JPEG dataURL）
├─ store.js              # 预设库 + 单局状态 + localStorage 持久化
├─ api.js                # API 客户端（全站唯一网络出口，相对路径 /api）
├─ auth.js               # 账号状态 + 登录弹层（openLogin() → Promise，镜像 confirm.js）
├─ data/presets.js       # 内置预设：工作日 / 周末
├─ scenes-bg.js          # 自动收集 assets/scenes/ 里的照片
├─ components/           # GloomMeter / DialogueBox / ChoiceList / EventCard(事件编辑卡) / AuthSheet(登录弹层)
└─ views/                # Intro / Stage(主对话流) / Summary / Editor(节点画布+聚焦编辑) / Report(夜记)

functions/               # 账号后端（Cloudflare Pages Functions，M1）
├─ api/[[route]].js      # API 单入口：request-code / verify / me / logout
└─ _lib/                 # 工具与邮件（下划线目录不被当作路由）
schema.sql               # D1 三表：users / auth_codes / sessions
```

## 路线图（demo 之后）

1. 预设编辑器：自定义时刻、选项与照片库（IndexedDB 持久化）
2. 夜记接入真实 LLM
3. PWA + 到点通知
4. 打包上架（Capacitor / uni-app / 小程序）
