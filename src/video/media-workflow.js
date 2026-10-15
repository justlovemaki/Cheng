/* Shared media UI policy: browser first, explicit and checked native fallback. */
(() => {
  "use strict";
  const helperError = (message) =>
    Object.assign(new Error(message), { helperUnavailable: true });
  const requireHelper = async ({
    browser = false,
    purpose = "transcribe",
  } = {}) => {
    let status;
    try {
      if (typeof globalThis.lexihaloGetHelperStatus !== "function")
        throw new Error("助手检查服务未就绪，请刷新页面重试");
      status = await globalThis.lexihaloGetHelperStatus();
    } catch (error) {
      throw helperError(
        `无法检查本地助手：${error?.message || error}。请打开本地助手设置检查安装。`,
      );
    }
    if (!status?.installed)
      throw helperError(
        "未检测到本地助手。请先打开本地助手设置，按说明安装并重新检查。",
      );
    const required = browser
      ? ["ffmpeg", "ffprobe"]
      : purpose === "download"
        ? ["yt-dlp", "ffmpeg"]
        : ["yt-dlp", "ffmpeg", "ffprobe"];
    const missing = required.filter((tool) => status.tools?.[tool] !== true);
    if (missing.length)
      throw helperError(
        `本地助手缺少 ${missing.join("、")}，请安装所需工具后重新检查。`,
      );
    return status;
  };
  const confirmPageParsing = async (
    purpose,
    reason = "已手动选择本地页面解析。",
  ) => {
    if (globalThis.lexihaloSiteAdapters?.currentItem?.()?.requiresTrackPage) {
      throw new Error("当前播放器位于专辑或其他曲目页面。请先打开当前曲目的独立页面，再使用本地页面解析；不会整张解析专辑。");
    }
    await requireHelper({ purpose });
    return window.confirm(
      `${reason}\n\n是否改用本地助手（yt-dlp + ffmpeg）解析当前网页${purpose === "transcribe" ? "并生成 AI 字幕" : "的可下载资源"}？\n仅处理公开且有权限访问的媒体，不导出浏览器 Cookie，不绕过登录或 DRM。${purpose === "transcribe" ? "音频仍会上传到你配置的 BYOK 服务商，并非本地 AI 识别。" : "此操作不调用 AI 识别接口。"}`,
    );
  };
  const canOfferFallback = (error) => {
    const message = String(error?.message || error || "");
    if (
      error?.helperUnavailable ||
      /DRM|加密|已取消|cancel|abort|BYOK|API.?Key|登录|权限|验证|识别接口|识别模型/i.test(
        message,
      )
    )
      return false;
    return /媒体资源|媒体源|读取.*媒体|媒体.*读取|音频文件|音频地址|音频流|获取视频音频失败|直接下载音频失败|请求超时|Failed to fetch|NetworkError|CORS|HTTP (?:403|404|410)/i.test(
      message,
    );
  };
  globalThis.lexihaloMediaWorkflow = Object.freeze({
    requireHelper,
    confirmPageParsing,
    canOfferFallback,
  });
})();
