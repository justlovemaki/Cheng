# 可选本地媒体助手（实验性）

纯扩展的字幕读取和小于 24 MB 的直连音频识别**不需要**安装助手。助手提供两项明确由用户触发的能力：

- **音频转写准备**：一般网站使用 `yt-dlp` 下载媒体；Pornhub 改由浏览器读取当前播放器的最新、未加密 HLS 资源，只将媒体字节按顺序导入助手，不让 yt-dlp 重新抓取页面。`ffmpeg` 将媒体转为 16 kHz 单声道 PCM WAV，并切成约 90 秒、可以独立解码的文件。输入每条消息最多 192 KB 原始字节，总计不超过 2 GB；输出每个 WAV 会分多条消息交给扩展重组，再逐块上传用户的 BYOK 转写服务。导入模式禁止 ffmpeg/ffprobe 访问网络；任务结束、失败或取消后清理媒体源文件。
- **多清晰度视频下载**：使用 `yt-dlp` 获取视频格式列表；同一分辨率的不同内部格式会自动择优合并为一个选项，在播放器菜单中紧凑显示分辨率、帧率、封装格式、编码、预计大小和音轨状态；选择纯视频格式时自动下载并用 `ffmpeg` 合并最佳音轨，完成文件保存到系统 `Downloads/LexiHalo`。

版本 10 支持通用播放器和网络捕获资源的导入，保留 HLS discontinuity，规范化严格验证的 JPEG 包装 TS 分片，并生成受控本地清单；Pornhub 的 yt-dlp 下载保留，并使用严格 HLS 选择、Referer/Origin、静态年龄标志和完整重新解析重试，避免退回会返回 474 的直连 MP4；格式解析成功后会在助手私有目录短暂保存完整 info，下载用 `--load-info-json` 复用签名，避免菜单与下载阶段重复解析；包装页 URL 不会作为下载文件交给助手。

助手**不接收 API Key**，不执行识别，也不自动读取浏览器 Cookie。浏览器导入可用于新增站点的 AI 字幕和资源下载；资源下载不依赖 AI 配置，可保存音频，未加密 HLS 的独立音轨会一起封装。导入只发送媒体字节，不发送签名 URL 或登录信息。

## 安装

1. 先在电脑安装 Python 3.9+、`yt-dlp`、`ffmpeg`（含 `ffprobe`），三个命令需可在终端的 PATH 中运行。Windows 可用 `py -m pip install yt-dlp`（须保证 `yt-dlp` 可执行文件在 PATH 中）；其他系统参考各工具官方安装说明。
2. 在 `chrome://extensions` 打开开发者模式，复制已加载的 LexiHalo 扩展 **32 字符 ID**。
3. 在本仓库运行 `python native/install.py <扩展ID>`；Edge 用 `python native/install.py <扩展ID> edge`。Windows 若 `python` 不可用可用 `py -3`。安装器只注册当前用户的 Chrome/Edge Native Messaging host，并把脚本复制到浏览器的用户级 Native Messaging 目录；安装后可以移动或删除仓库。升级助手时重新运行安装命令并重新加载扩展。
4. 在视频页菜单点击“AI 字幕（音频转写）”；无法直接读取音频时确认使用助手。Pornhub 会提示由浏览器读取音频并交给助手切块；需更新到版本 10 的助手（重新运行安装命令）。音频会上传到**你配置的服务商**，可能产生费用。进行中再次点击菜单项可取消。
5. 视频下载使用播放器菜单中的“下载视频（多清晰度）”，选择清晰度并确认。界面会显示实时百分比、速度、预计剩余时间和进度条；完成后的完整文件名会自动换行显示。下载完全由本地助手执行，不会把视频传给 AI 服务商。

助手优先识别 YouTube（watch/shorts）、Bilibili（video）、TED（talks）、Vimeo 和 Pornhub（view_video/video/show/embed），并通过共享策略接入新增的 19 个视频/音频站点。安装器还会复制 `media_sites.py` 和统一的 `media-platforms.json`，不能只覆盖主脚本。站点及验证范围见 [`../docs/MEDIA_SITES.md`](../docs/MEDIA_SITES.md)。也允许用户从播放器菜单明确触发其他当前普通 HTTPS 视频页面。通用页面必须是无账号密码、无自定义端口、DNS 仅解析到公网地址的域名；localhost、IP 字面量、私网/保留地址、`.local`、`.internal` 和文件路径都会被拒绝。实际支持度取决于 yt-dlp 是否有对应提取器或能识别页面中的媒体。部分视频需要登录、Cookie、Referer 或 DRM，助手会明确失败，不绕过站点访问控制；助手仍不会自动读取浏览器 Cookie。

音频准备上限 2 GB，视频下载上限 8 GB，媒体时长上限 4 小时；临时任务位于 `~/.lexihalo/asr/`，任务结束后删除，失败/取消的临时文件在下次启动任务时清理过期（24 小时）。完成的视频直接移动到系统 `Downloads/LexiHalo`，不会通过 Native Messaging 传输大文件。`worker.log` 可能含站点 URL 或下载工具错误信息，请勿直接公开分享。扩展始终保留原有 BYOK API 请求及本地字幕缓存。

测试：`npm run test:native`、`npm run test:audio-source`。
