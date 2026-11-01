# 美术资产圣经（asset bible）

所有 UI 美术资源的规范、槽位与画风纪律。**放图即生效**（组件用 `import.meta.glob` 探测，无需改代码）。
生成入口：`npm run assets`（槽位报告）/ `node tools/gen-assets.mjs gen <槽位id>`（调 Seedream 生成）。

## 画风（2026-11-01 拍板）

| 画风 | 用于 | 特征 |
|---|---|---|
| 厚涂彩铅绘本 | 系统小人（crayon 皮肤） | Q版大头、腮红、柔和渐变轮廓（**无硬黑边**）、暖色治愈 |
| 蜡笔稚拙绘本 | UI 元素 / 边框 / 字标 | 断线飞白笔触、四色纪律（奶油黄/牛仔蓝/纯黑/粉白）、大色块平涂 |

共同 DNA = 手作纸感/笔触肌理。**贴纸橙（干净矢量风）已被否，勿再提议。**

参考锚点图（生成时作 `image` 参考图）：`.asset-gen-test/sprite-cand-A.png`（彩铅妹妹）、`sprite-cand-B.png`（蜡笔小黑）。

## 生成通道（火山 Agent Plan）

- 模型 `doubao-seedream-5-0-pro-260628`，套餐端点 `/api/plan/v3/images/generations`（**勿用按量端点**）
- 中文 prompt 原生支持（≤300 字为宜）；size 最低 1K，槽位规格由 `post` 降采样
- 支持参考图（`image` 传 base64）＝表情帧一致性方案：**先定稿主图，再以主图为参考图改表情**
- 支持透明背景（`background:"transparent"`）；不支持组图（那是 4.5/lite 的能力）
- key 在 `.config/api_keys.json`（gitignore）；若 key 轮换，改该文件即可

## 槽位总表

| 槽位 | 文件 | 规格 | 说明 |
|---|---|---|---|
| crayon 主图 | `skins/crayon/sprite.png/webp` | 512×512 独立立绘 | 透明全身立绘，无底板无圆圈（QQ秀式小精灵），脚近下缘 |
| crayon 眨眼 | `skins/crayon/sprite-blink.png/webp` | 同上同构图 | 仅改眼睛 |
| crayon 开心 | `skins/crayon/sprite-happy.png/webp` | 同上同构图 | mood='happy' 时替换 |
| crayon 低落 | `skins/crayon/sprite-sad.png/webp` | 同上同构图 | mood='sad' 时替换 |
| ~~蜡笔边框贴片~~ | ~~`skins/crayon/stroke.svg`~~ | — | **已废弃（2026-11-01 拍板：UI 不要描边）**，border-image 方案删除 |
| 字标 | `brand/wordmark.png/webp` | 横版 ≥1200 宽，透明 | 放图即启用，回退衬线文本 |
| （旧）系统小人 | `system/sprite*.png` | 透明底 512 | 皮肤无图时的回落插槽，见该目录 README |
| （旧）场景图 | `scenes/*.png` | 五场景竖构图 | 见该目录 README |

## 质检清单（每张过一遍再落槽位）

1. 构图：全身完整不裁切、脚部贴近下缘、背景确实透明（无底板、无圆圈）
2. 占比：角色占画面 ≥70%（44px 停靠态仍可辨认）
3. 表情帧：与主图**逐像素级同构图**（用参考图机制保证），只动五官
4. 字标：**逐字核对**「择择人生」四个字（AI 中文字形易错，错则重抽）
5. 缩小测试：缩到 44px 看剪影可辨
6. 色温：亮暗两档主题下都摆一下（小人贴纸在深蓝纸上也要好看）

## 相关代码

- 槽位探测：`SysSprite.vue`（skins 优先 → system 回落 → 内置 SVG）、`brand.js`（wordmark）
- 皮肤变量：`styles/skins/crayon.css`；皮肤状态：`src/skin.js`
- 生成与后处理：`tools/gen-assets.mjs`（sharp 降采样：`npm i -D sharp`）
