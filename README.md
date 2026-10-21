# 澄 Cheng

**外语视频精读与知识笔记浏览器扩展。** 双语字幕、上下文解释、时间点笔记与本地资料库，保留网页翻译和媒体处理能力。

无需原上游账号或会员；AI 使用自带密钥（BYOK），费用由所选服务商收取。

## 功能

- **边看边学**：原生侧边面板跟随当前视频，实时对照双语字幕，支持跳转、重听、选择 1–10 句进行 AI 解释。
- **随手记笔记**：无需先保存视频即可输入、自动保存；可关联网页选文、字幕或视频时间点，回看时直达出处。
- **本地资料库**：管理笔记、媒体和字幕版本，全文搜索，导入/导出 SRT、VTT，导出 Markdown 或完整 ZIP 备份。
- **字幕处理**：读取原站字幕，使用 AI 保守修复、分段和翻译；无字幕时可主动触发音频转写。
- **网页翻译**：划词、快速翻译、沉浸式全文翻译、单词详解与发音，支持按网站常开。
- **统一主题**：设置预览、网页与视频悬浮栏、学习侧栏和资料库同步配色，支持跟随系统明暗。
- **媒体工具**：读取当前播放器的视频/音频资源；可选本地助手提供媒体准备、多清晰度下载及音轨合并。

## 安装与更新

需要支持原生侧边面板的 **Chrome / Edge 116+**；开发构建建议使用 Node.js 20+。

```bash
npm ci
npm run build
```

1. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启开发者模式。
2. 点击“加载已解压的扩展程序”，选择仓库内生成的 **`dist/`**。
3. 停用其他同源扩展版本，避免重复注入。

更新代码后重新构建、重新加载扩展，**再刷新已打开的网页**。访问本地文件页面时，需在扩展详情中允许访问文件网址。

## 开始使用

| 场景             | 入口                                         |
| ---------------- | -------------------------------------------- |
| 看视频、记笔记   | 网页右侧悬浮栏 → 学习控制台                  |
| 回看、搜索、备份 | 学习控制台 → 资料与媒体 / 查看笔记           |
| 本地视频或音频   | 资料与媒体 → 打开本地视频 / 音频，再导入字幕 |
| 字幕、转写、下载 | 播放器中的插件图标                           |
| 设置翻译引擎     | 扩展详情 → 扩展程序选项（BYOK）              |
| 全文翻译常开     | 网页右键菜单，或设置中的“沉浸翻译常开”       |

非视频页面也能写笔记；视频模块会说明不可用原因。详细流程见[学习指南](docs/CHENG_LEARNING.md)。

### 引擎配置

- **AI 翻译与解释**：OpenAI、OpenRouter、DeepSeek、Gemini、Claude 或 OpenAI 兼容接口。
- **机器翻译**：Google；Microsoft 需 Azure Translator Key，可选填 Region；DeepL 需对应 Free/Pro API 配置。
- **音频转写**：在 OpenAI / 兼容引擎中单独配置识别模型和 Endpoint；推荐 `whisper-1`、`verbose_json`。直接上传的单个媒体流需小于 24 MB。

基本字幕读取和网页翻译不需要本地助手。需要助手时，先安装 Python 3.9+、yt-dlp、ffmpeg / ffprobe，再注册扩展 ID：

```bash
python native/install.py <扩展ID>       # Chrome
python native/install.py <扩展ID> edge  # Edge
```

安装、升级和限制见[本地助手说明](native/README.md)。

## 支持范围与数据

- 支持 YouTube、Bilibili、Netflix、Coursera、Udemy、TED、Vimeo 等专门适配平台，以及普通 HTML5 视频；另有短视频、社交媒体、音乐和播客适配，见[站点说明](docs/MEDIA_SITES.md)。实际可用性取决于字幕、登录状态和播放器结构，不保证所有链接可用，不绕过 DRM。
- 学习资料保存在扩展自身的 IndexedDB，API Key 保存在 `chrome.storage.local`；没有产品账号、云端资料库或自动同步。个人笔记不自动发送给 AI。
- **本地保存不等于离线处理**：翻译、解释和转写会向相应服务商发送所需内容。打开学习面板或同步字幕本身不会自动调用 AI；既有翻译功能仍按用户开关运行。
- 完整备份不包含 API Key、原媒体文件或未提交草稿，且不加密。本地媒体重开后需重新选择文件；卸载扩展或清除浏览器数据可能删除资料，请定期备份。
- 学习界面目前为简体中文。原上游云端收藏、托管 AI、云端 TTS 等服务不再提供。

## 开发

```text
src/             维护源码、页面模板、样式与本地化
config/          品牌、媒体平台策略、构建基线与符号映射
vendor/legacy/   原扩展 Bundle 基线
native/          可选 Native Messaging 媒体助手
assets/          静态资源及生成的运行代码
tools/           构建、恢复、检查与回归测试
docs/            专项文档
dist/            构建输出，浏览器加载此目录
```

修改 `src/`、`config/` 或构建工具，不直接修改生成的 Bundle、根目录 HTML 和 `dist/`。构建使用 AST 补丁与可维护源码生成单 Bundle；恢复分析产物不参与运行，也不能还原完整的原始工程。

```bash
npm run check                     # 构建、语法与确定性检查
npm run test:learning              # 资料库、数据及 AI 校验
npm run test:notes                 # 通用笔记
npm run test:study:browser         # 原生侧边面板
npm run test:learning:browser      # 资料库浏览器闭环
npm run test:browser               # 翻译、字幕及站点回归
npm run test:floating-controls     # 悬浮栏与消息路由
npm run test:theme                 # 主题与图标颜色
npm run test:page-global-isolation # LuCI 翻译函数等页面全局兼容
npm run test:video-style-isolation # 视频 CSS 与宿主页面隔离
npm run test:audio-source          # 媒体管线
npm run test:native                # 本地助手
```

浏览器测试需要 Playwright Chromium，可先运行 `npx playwright-core install chromium`。测试使用模拟页面和服务，不代表所有真实站点均可用。其他测试命令见 [`package.json`](package.json)；图标重建用 `npm run build:icons`，恢复分析用 `npm run recover`。

## 文档

[学习与备份](docs/CHENG_LEARNING.md) · [AI 字幕](docs/AI_SUBTITLES.md) · [媒体架构](docs/MEDIA_ARCHITECTURE.md) · [构建与恢复](docs/READABLE_BUNDLES.md) · [源码入口](src/README.md) · [独立版改造](docs/FREE_ACCESS.md) · [网络请求说明](docs/EXTERNAL_LINKS.md)
