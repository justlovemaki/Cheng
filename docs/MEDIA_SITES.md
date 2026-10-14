# 媒体站点适配（LexiHalo）

## 原有设计不变

新增站点复用：播放器菜单 → MAIN/ISOLATED 消息桥 → 扩展 Background → Native Messaging → 本地助手。

- **AI 字幕**：助手只获取/转换媒体；API Key 仍只由扩展使用。沿用现有 90 秒 WAV 切块、BYOK ASR、时间轴安装、修复/翻译、缓存、取消和 Offscreen 上传。新站点使用稳定的当前项 ID；浏览器模式先查询 ASR 缓存，命中后不再下载或导入媒体。
- **资源下载**：沿用清晰度/资源列表、进度、取消、`Downloads/LexiHalo` 保存；不调用 ASR、不要求配置 AI Key。取消浏览器捕获下载会同时 abort 页面 controller、后台 capture fetch、Native 上传/封装任务；不再只尝试取消尚未创建的最终下载 job。进入“正在取消”后忽略迟到的进度消息，结束后显示“已取消下载”。取消按钮使用透明背景、无边框、无阴影的高对比红色文字，并覆盖 hover/active/focus 状态，不继承网站或主题文字颜色；基础 WCAG 对比度由 Chromium 回归要求至少 4.5:1。
- **本地页面解析**：继续交给 yt-dlp。无浏览器可读媒体或浏览器 CORS 限制时，菜单中可明确选择“AI 字幕（本地页面解析）”或“改用本地助手解析公开资源”。不会自动导出 Cookie。
- **浏览器媒体读取**：读取当前项的播放器/站点 API，只有该站点允许的 CDN 可用；媒体字节按序发送给助手，签名 URL、登录 Token 和 Cookie 不发给助手。可以读取直连资源或未加密、已结束的 HLS；HLS 下载支持合并独立音轨。
- 导入媒体最多 2 GB、4 小时；每条原生消息最多 192 KB 原始媒体。ffprobe/ffmpeg 导入处理仅允许 `file,pipe` 协议。资源下载用 remux 保存，不能推测输出容器时使用 MKV/MKA，不伪装为 MP4。

## 新增 19 个站点

| 站点 | 页面识别/提取 | AI 字幕 | 资源下载 |
|---|---|---|---|
| 抖音 | video/note/modal_id，当前 aweme_id 数据，douyinvod 地址 | 浏览器读取；可改用 yt-dlp | 当前项清晰度/资源；可改用 yt-dlp |
| 小红书 | explore/discovery，保留访问参数，校验 note-id，media/mediaV2 | 浏览器读取；可改用 yt-dlp | 当前笔记音视频资源 |
| 微信视频号 | sph 分享或官方 feed 页；用户确认后打开元宝解析，再读取官方播放页 | 浏览器读取 | 官方可播放媒体资源 |
| 小鹅通 | app/回放 ID，params/content_page 规范化；网页登录后读取回放 API | 浏览器 HLS；可改用 yt-dlp | 回放 HLS/清晰度，合并音轨 |
| 微博视频 | tv/show/status/作者帖子 | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| TikTok | 作者/video ID，校验当前 itemStruct，播放地址/bitrateInfo | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| X/Twitter | status ID，清理 video 后缀和跟踪参数 | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| Instagram | p/reel/reels 详情 | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| Facebook | videos/reel/watch?v、fb.watch | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| Reddit | comments 详情、v.redd.it | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| Twitch | VOD/clip/短剪辑，不把频道直播当点播 | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| Dailymotion | video/embed、dai.ly | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| niconico | watch、nico.ms | 当前媒体或 yt-dlp | 当前媒体或 yt-dlp |
| 小宇宙 | episode ID，og:audio/节目数据、xyzcdn 音频 | 浏览器读取 | 音频资源 |
| SoundCloud | 作者/曲目，不接受 discover/search/feed | 当前音频或 yt-dlp | 音频资源 |
| Bandcamp | track、TralbumData 文件 | 当前音频或 yt-dlp | 音频资源 |
| 喜马拉雅 | sound ID | 当前音频或 yt-dlp | 音频资源 |
| 网易云音乐 | song ID（包括 hash 路由） | 当前音频或 yt-dlp | 音频资源 |
| Apple Podcasts | 单集参数 i，不把节目目录当一集 | 当前音频或 yt-dlp | 音频资源 |

以上是**代码适配范围**，不是所有网站、账号和链接的可用性承诺。只有能合法播放且允许读取的资源才能使用。登录、地区限制、动态签名、DRM、直播、加密/缺片 HLS、CORS 或网站接口变化都可能影响结果。已结束、未加密 HLS 的 discontinuity 本身不再是拒绝条件。

音频站点不再创建额外可见资源卡片。页面已有 `<audio>` 时，LexiHalo 图标直接挂到原播放器容器；只有 metadata/API 而没有媒体元素时，创建 50×50 的无背景浮动工具入口，内部 audio surrogate 隐藏且无 controls。真实音频元素出现后自动移除临时入口。视频站点等待真实播放器。普通 HTTP(S)/file 播放器 iframe 由其自身的 all-frames runtime 独占图标和字幕状态，父页不再创建第二套代理；只有无法独立匹配 content script 的 `about:blank`/`srcdoc` 等不透明 frame 才使用父页透明工具锚点。内部 audio surrogate 不显示、不占据文档布局，真实媒体出现后自动移除临时锚点。

短链接应先在浏览器正常跳转至详情页再使用。小鹅通未完成的短链/登录包装页不猜回放 ID。不可访问的 iframe 或仅音频页面提供资源工具区；没有可控播放器时不承诺原页面播放同步。视频号分享会明确询问是否打开元宝，仅提交当前分享链接；验证失败不绕过平台限制。

## 文件边界

整体分层和扩展契约见 [`MEDIA_ARCHITECTURE.md`](MEDIA_ARCHITECTURE.md)。

- `config/media-platforms.json`：全部 32 个明确支持的平台；13 个 specialized 和 19 个 browser 条目共享同一权威目录。
- `src/shared/media-contract.js`：统一 `audio/video` 与 `direct/capture/native-page` 媒体源模型、去重和能力描述。
- `src/video/media-site-hooks.js`：站点 `pickMedia/snapshot/prepare/observedCandidate` 注册表。
- `src/video/media-task-registry.js`：页面侧 starting/transferring/processing/cancelling 生命周期。
- `src/shared/media-sites.js`：规范页面 URL、当前项身份、安全媒体地址。
- `src/video/site-adapters.js`：当前媒体/当前项数据快照、登录后的原站 API；拒绝预加载邻居视频、过期小红书弹窗、当前页切换。
- `src/video/browser-audio.js`：有界浏览器媒体流读取，HLS、字节范围、单独音轨。
- `src/background/site-resolver.js`：用户确认的视频号官方解析，按标签页/frame/分享项绑定。
- `src/background/subtitle-ai.js`：任务鉴权、导入、ASR、资源下载及持久缓存。
- `native/media_sites.py`、`native/lexihalo_asr.py`：本地策略、顺序/大小校验、切块或封装，不读取浏览器凭据。

版本 10 助手需要重新运行 `python native/install.py <扩展ID>`；安装器会复制策略文件和策略模块。

## 验证范围

- 19 站点正向路由、负向路由和 JS/Python 策略一致性。
- 抖音当前 ID、小红书当前弹窗、TikTok 当前项、小鹅通 API、视频号登录/官方页面流程的模拟数据测试。
- HLS 读取、独立音轨、加密/直播/私网拒绝、取消、消息顺序、大小限制。
- Native 导入后的资源封装、音频资源、安装复制和 API Key 隔离测试。
- Chromium 的 19 站点页面结构矩阵：图标、音视频元素、AI 字幕安装、下载菜单和任务调用。ASR 与下载执行使用 mock，**不冒充真实账号端到端验证**。
- 延续原来的 YouTube、Pornhub、普通 HTML5 和后台/Reader 回归。
- 用真实 ffmpeg 完成过浏览器导入音频资源的封装/保存冒烟测试；测试文件已清理，没有调用收费识别接口。

运行 `npm run test:audio-source`、`npm run test:native`、`npm run test:browser`、`npm run check`。报告写入 `artifacts/reports/browser-regression.json`。

## 通用 Video.js / M3U8 播放器

未登记的网站现在也可以读取当前 `<video>/<source>` 和与当前元素关联的 Video.js `currentSource/currentSources`，不把 HTML 包装页误当作媒体文件。MIME 为 MPEGURL 时即使 URL 无 `.m3u8` 后缀也按 HLS 读取。通用模式允许公网域名和公网 IPv4 的 HTTPS 媒体及合法非标准端口，拒绝 localhost、私网/保留地址及 HTML/JS/图片候选。页面直接读取仍受 CORS 限制；捕获资源由扩展后台读取。

包装页、iframe 和 blob 播放器统一使用：实际 video/audio/source → 当前 Video.js source → 包装页明确声明的同源父页 source 关系 → 已绑定当前 document/frame 的网络捕获。`prepare()` 取得 opaque 捕获 ID 后，后续快照即使同时存在 DOM/Video.js 直连源也会保留该 ID，确保 AI 字幕和资源下载选择同一后台 broker 路径；不会把捕获项误送给页面 fetch。前几种提取按实际数据补充，不扫描父页任意图片/链接，不执行页面脚本，也不扫描全局变量猜媒体。

父页引用识别只支持有界内联脚本中的字面量 `document.getElementById(...).src = parent.document.getElementById(...).src`（含 `window.parent`），且赋值目标必须是当前媒体或其 SOURCE 子元素。读取父页前校验同源；没有这种明确关系时不借用父页资源。该能力不绑定任何域名、路径或元素 ID。同源 iframe 可读取其实际媒体元素；跨域 iframe 只能通过后台捕获，不跨域读 DOM。可见 iframe 的媒体元素或通用 player/video/embed/play 提示用于发现工具宿主，提示本身不能作为媒体 URL 使用。

独立包装页没有父页资源、或播放器尚未发起媒体请求时，会提示从原详情页打开并播放几秒后重试；本地网页解析仍是用户明确选择的另一路径。字幕和资源下载复用以上源发现流程，通用导入仍只发送媒体字节给助手，页面 URL 留在扩展用于任务归属和缓存。

## 通用网络捕获

扩展通过 `webRequest` 被动识别真实媒体响应（包括跨域 iframe 的请求），返回绑定当前标签页/document/frame 的 opaque ID，不把签名 URL 或请求头暴露给页面。开始读取后，扩展后台按捕获的 Origin/Referer/User-Agent 重放请求，避开页面 CORS 和重新抓网页的浏览器验证页；临时 DNR 规则只匹配扩展发起的精确资源 URL，读取后移除。Authorization 不跨 CDN 来源重放，不复制 Cookie Header 给本地助手。

- 跨域播放器 iframe 与媒体 CDN 可以使用合法的非标准 HTTPS 端口；通用模式不再把所有非标准端口当作私网。
- XgPlayer/MSE 等播放器可能只在 DOM 暴露 blob，而真实 HLS 位于公网 IP 或其他 CDN。扩展捕获实际媒体请求，而不是把播放网页包装层交给 yt-dlp。网页验证或反爬页面不会被自动破解。
- **Pornhub**：保留 yt-dlp 清晰度下载和浏览器捕获两条路径。版本 10 不再把 474 当作禁用 yt-dlp 的理由；yt-dlp 路径只选 HLS，不回退到会返回 474 的直连 MP4，显式发送 Referer/Origin 和非用户静态年龄标志。格式菜单第一次成功取得 HLS 后，完整 yt-dlp info 仅在 Native Host 私有目录缓存 10 分钟；下载使用 `--load-info-json` 直接复用精确格式 ID 和签名，不再二次访问播放页。只有缓存缺失或 HLS 实际返回 404/410/474 时才删除缓存并最多重新解析 5 次。浏览器当前会话捕获仍可作为另一条下载路径，且已实际完成 MKV 保存。
- 允许显式公网 IPv4 和合法 HTTPS 端口；仍拒绝 localhost、RFC1918、链路本地、保留/测试地址。跨标签页、不同 document、兄弟 iframe 的请求不能借用。
- `EXT-X-DISCONTINUITY` 不代表 DRM。版本 10 助手将分片按序写入独立文件并生成受控本地 HLS，保留 discontinuity、EXTINF 和初始化片段；ffprobe/ffmpeg 只读取这些本地文件。不会删除清单中的片段来假装下载成功。
- 某些源把 MPEG-TS 分片伪装成 `.jpeg`，在一个完整 JPEG 后附加 TS。版本 10 只接受 JPEG 结束标记后立即出现、长度严格按 188 字节对齐且连续同步的 TS，剥离图片前缀后再交给 ffmpeg；普通图片和任意前缀文件仍拒绝。
- 浏览器音频资源按 ffprobe 的真实 codec 决定容器：真 MP3 直接复制；标记为 MP3 但实际为 AAC/Opus 等时使用 libmp3lame 转码；其他不兼容的扩展回退 MKA，不再强制 `-c copy` 写入错误容器。封装失败会保存完整下载诊断。
- 直播、缺片、AES/DRM 仍拒绝；MPD 可被识别，但这条导入流程不宣称已经支持 DASH 合并。

上述结构使用同一网络捕获、清单读取与本地合并流程。回归覆盖两个无关域名、不同父/子节点 ID、跨域和无声明拒绝，以及通用同源/跨域 iframe。结构测试不等同于任意真实网站的整片下载验证。

新增权限 `webRequest`、`declarativeNetRequestWithHostAccess`。更新后需重新加载扩展，并刷新目标网站、播放几秒以重新捕获资源。

## X 原播放器布局保护

X 的 `placementTracking`/`videoPlayer` 是绝对定位层，依赖外层比例盒提供高度。扩展不再把任何原播放器容器强制改成 relative，也不再创建 isolation 堆叠上下文；只给原本 static 的按钮宿主增加可选 relative 类。X 图标挂在自己的 `videoPlayer` 中，不借用更外层的 `placementTracking`。X 的原生播放/暂停点击不走通用坐标拦截，不在播放器尚未出现时插入虚拟音频播放器。回归测试覆盖绝对定位比例盒的视频高度、原生播放按钮和扩展菜单。

## 页面身份校验

AI 字幕、清晰度解析和下载共用 `lexihaloSites.nativePage` 的页面规范化/视频身份规则；支持 YouTube 短链接及嵌入页、B 站分 P、Vimeo 群组/频道和嵌入页等别名。前端不再依赖可能滞后的播放器缓存 ID 来构造请求 URL。

浏览器媒体上传 owner 同时绑定 tab、frame、documentId 和实际 captureId。刷新/iframe 导航会主动取消旧 owner；SPA 切集或失败的 abort 留下记录时，新任务会验证内存中是否仍有实际 broker 传输，没有就自动清理 native/storage 孤儿任务，而不是固定阻塞 30 分钟。真正仍在传输的同文档同资源任务仍拒绝并发。

ISOLATED 消息桥在页面 payload 之后覆盖写入 `documentUrl = location.href`。后台只接受本扩展发送的该字段，并要求它与浏览器原始 MessageSender 的来源一致，以处理 SPA 切换后的旧文档地址；不会允许跨来源篡改。任务仍绑定标签页和 frame，不同视频不互相借用任务。错误会区分无法识别的请求地址、frame 地址缺失，以及页面/视频已经切换。`about:blank`/`srcdoc` 等没有可识别 HTTPS 地址的 frame 不会靠猜测父页面来放行。

## 参考项目

参考 [joeseesun/qiaomu-clipper](https://github.com/joeseesun/qiaomu-clipper) 的 `study-sites.ts`、`web-media-page.ts`、`web-page-media.ts`、`xiaohongshu.ts`、`xiaoe.ts`、`channels-study.ts` 和 Native ASR 的边界设计。没有迁入它的学习页、账户、识别引擎或存储协议。许可说明见 [`../native/THIRD_PARTY_NOTICES.txt`](../native/THIRD_PARTY_NOTICES.txt)。
