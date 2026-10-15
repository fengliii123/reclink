# Chrome Web Store 上架材料（reclink 0.3.0）

> 逐项对照开发者控制台 "Store listing" 表单整理；中英双语均提供，直接复制粘贴。

## 基本信息

| 项 | 值 |
|---|---|
| 名称 | Reclink 录屏截图 / Reclink Screen Recorder & Screenshot（名称即核心搜索词；勿加「免费/最好/官方」等审核风险词） |
| 类别 | 生产力工具（Productivity） |
| 语言 | 中文（简体）+ English（建议提交两套 listing） |
| 图标 | public/icons/128.png（已有） |
| 截图 | store/screenshots/*.png（6 张，1280×800） |

## 简短描述（132 字符内）

- **zh-CN**: 屏幕录制与截图工具：录屏（标签页/桌面/区域/摄像头）、长截图、截图标注、图片文字识别，本地处理保护隐私。
- **en**: Screen recorder & screenshot: record screen, tab, region or webcam with audio. Full-page capture, annotation, OCR. All local.

## 详细描述

### zh-CN

```
屏幕录制 + 截图 + OCR 文字识别，一款工具搞定。所有处理均在本地完成，不上传、不收集数据、无需注册。

【录屏 · 屏幕录制】
支持 4 种屏幕录制模式：整个桌面屏幕录制、当前标签页录制、自定义区域录制、摄像头人像录制。可同时录制系统声音与麦克风讲解，适合录制教学视频、操作演示、会议记录、游戏录像。
• 录制中暂停 / 继续，随时整理思路
• 悬浮控制条实时显示录制时长
• 录制中批注：画笔、橡皮擦，边讲边画
• 光标聚光灯效果，演示更清晰
• 开录前 3 秒倒计时，从容准备
• 导出 MP4 / WebM，720p / 1080p / 4K 高清可选

【截图 · 长截图】
• 可视区域截图：一键截取当前网页画面
• 整页截图：自动滚动拼接生成长截图（网页长图）
• 区域截图：自由框选，框选后可直接提取文字
• 3 秒延迟截图：捕捉下拉菜单等一闪而过的界面
• 截图标注：矩形、文字，也可导入本地图片或剪贴板图片进行标注

【OCR 文字识别】
框选屏幕区域即可提取文字，支持中文和英文识别。语言包内置，离线可用，识别内容不离开你的电脑。识别结果一键复制或保存为 txt。

【录制库管理】
所有录制视频与截图自动存入本地录制库，可预览、下载、删除，浏览器重启后仍在。

【隐私安全】
无需账号登录，没有服务器，不含统计追踪代码。录制内容仅保存在你的设备上，除非你自己下载分享。
```

### en

```
Screen recorder, screenshot tool and OCR text recognition in one extension. Everything is processed locally — no uploads, no data collection, no sign-up.

SCREEN RECORDING
Record your screen in 4 modes: full desktop screen recording, current tab recording, custom region recording, and webcam bubble recording. Capture system audio and microphone narration at the same time — great for tutorial videos, product demos, meeting recordings and game capture.
• Pause / resume while recording
• Floating control bar with live recording timer
• Draw on screen while recording: pen and eraser annotation
• Cursor spotlight for clearer presentations
• 3-second countdown before recording starts
• Export MP4 / WebM at 720p / 1080p / 4K

SCREENSHOT & FULL PAGE CAPTURE
• Visible area screenshot: capture what you see in one click
• Full page screenshot: auto-scroll and stitch into one long image
• Region screenshot: drag to select any area, then extract text from it
• 3-second delayed screenshot for menus and transient UI
• Annotate screenshots with rectangles and text; import local or clipboard images too

OCR TEXT RECOGNITION
Select any region on screen to extract text (English & Chinese). Language packs are bundled — works fully offline and recognized text never leaves your computer. Copy or save as .txt with one click.

LIBRARY
Every recording and screenshot is auto-saved to a local library: preview, download, delete. Still there after browser restarts.

PRIVACY
No account, no servers, no tracking. Recordings stay on your device unless you choose to download and share them.
```

## 权限说明（审核用，Permissions justification）

| 权限 | 用途 |
|---|---|
| offscreen | 承载录制引擎的 offscreen 文档（MediaRecorder） |
| tabCapture | 录制当前标签页的画面与声音 |
| downloads | 把录制的视频/截图保存到用户本机 |
| storage | 本地保存录制库与设置（chrome.storage） |
| scripting | 向页面注入控制条、选区器、批注工具 |
| tabs | 获取标签页信息以注入控制条和倒计时 |
| activeTab | 用户点击工具栏后对当前页操作（截图/录屏），避免申请全站权限 |
| clipboardWrite | 复制截图/OCR 文本到剪贴板 |
| notifications | 屏幕截图失败等场景的系统提示；倒计时兜底显示 |
| optional: clipboardRead | 用户主动使用「标注剪贴板图片」时申请 |
| optional host: \<all_urls\> | 用户使用整页截图/区域截图时对当前网站申请，默认不授予 |

## 隐私声明（Privacy practices）

- 单一用途：屏幕录制与截图，本地保存
- **不收集任何用户数据**：无遥测、无分析、无第三方 SDK
- 录制内容仅保存在用户浏览器本地（IndexedDB）与用户主动下载的文件中
- 不使用远程代码（所有 JS/wasm 打包在扩展内，tesseract 语言包内置）
- 审核选项：不出售数据、不用于无关用途、不做信用评估 → 全部勾"否"

## 上传清单

1. `store/reclink-0.3.0.zip` → Package
2. `store/screenshots/` 6 张 → Screenshots（至少 1 张，最多 5 张建议选：popup-record、control-bar、complete、region、popup-shot）
3. 128×128 图标已有；如需 440×280 宣传图可后续补
4. 隐私声明按上表填写，权限用途逐条粘贴

---

# 完整表单字段对照（逐屏填写指南）

## ① Package（打包）
- 上传 `store/reclink-0.3.0.zip`
- 上传后商店会自动解析版本 0.3.0

## ② Store listing（每个语言一套，先填英文 default）

| 表单字段 | 填写值 |
|---|---|
| Name | Reclink Screen Recorder & Screenshot（zh 套：Reclink 录屏截图） |
| Summary | 上方「简短描述」 |
| Description | 上方「详细描述」 |
| Category | Productivity（生产力工具） |
| Language | 默认 en-US；Add language → zh-CN 再填一套 |
| Icon (128×128) | public/icons/128.png |
| Screenshots (1280×800 或 640×400，1–5 张) | 选 5 张：popup-record / control-bar / complete / region / popup-shot |
| Small promo tile (440×280) | store/screenshots/promo-440x280.png（已生成） |
| Marquee promo (1400×560) | 可选，暂不填 |
| Website | 可填 GitHub 主页或留空 |
| Support | support@你的邮箱 / 或留空（无数据收集时可不填） |

## ③ Privacy practices（隐私惯例，必填）

- Single purpose（单一用途声明，一句话）：
  - en: `Capture the user's screen (video and screenshots) and save the results locally on their device.`
  - zh: `捕获用户屏幕（视频与截图），并将结果保存在用户本地设备上。`
- 数据使用勾选（Data usage）：**全部不勾**（不收集任何数据）
- 远程代码声明：勾「不使用远程代码」
- 出售/传输数据三连问：全部「否」
- 隐私政策：完整页面已写好 `docs/privacy.html`（仿 pico-api 模式，含 SEO meta/深色模式/逐条权限表）。托管：push 到 GitHub 后开 Pages，填 `https://<你的用户名>.github.io/reclink/privacy.html`

## ④ 权限用途（审核必填，逐条粘贴权限表内容）

按上传 zip 实际声明的权限逐条填写，内容直接抄上方「权限说明」表。重点把三条宽权限的理由写足：

- `tabs` + `scripting` + `activeTab`：仅当用户主动开始录屏/截图时，向用户正在查看的当前标签页注入控制条、选区器与批注工具；不读取页面内容、不做任何后台注入
- optional `<all_urls>`：整页截图/区域截图需要临时脚本权限，按 Chrome 最佳实践走 optional 按需申请，默认不授予
- `downloads`：保存用户主动导出的视频/截图文件

## ⑤ Reviewer notes（审核员备注，强烈建议填写，通过率关键）

```
This extension records the user's screen and takes screenshots; everything is processed locally and saved to the user's device. No data leaves the browser.

HOW TO TEST:
1. Click the toolbar icon → popup opens. Choose a recording mode (screen / tab / region / camera) and click the blue start button.
2. A 3-second countdown appears, then recording starts with a floating control bar (pause/resume/stop, annotation tools).
3. Click stop → a completion window opens with video preview and a Download button.
4. Screenshot tab: try "Visible area", "Full page", "Select region" (drag to select), and "Capture text" (OCR — language packs are bundled offline, first run takes ~10s to load the wasm engine).
5. Library (bottom of popup): all recordings/screenshots are listed and can be previewed or deleted.

NOTES:
- No account, no server, no analytics.
- OCR (tesseract.js wasm) and language packs are fully bundled — no remote code.
- Media streams in recording flows use chrome.tabCapture / getDisplayMedia, only after explicit user action.
```

## ⑥ Distribution（分发）

- Visibility: **Public**（如想先内部验证，先选 Unlisted，用链接自测后再转 Public）
- Distribution regions: 全部
- 如账号首次发布：需先付 $5 开发者注册费 + 邮箱验证

## ⑦ 提交前自检

- [ ] zip 里的 manifest 无 host_permissions（已确认，本包已验证）
- [ ] 截图无浏览器书签/个人书签栏泄露隐私（本包截图为空白演示 profile，安全）
- [ ] 英文 default listing 完整（名称/摘要/描述/图标/截图 5 张/440×280）
- [ ] 隐私惯例三连问全否 + 远程代码声明
- [ ] 权限逐条用途已填
- [ ] Reviewer notes 已填
