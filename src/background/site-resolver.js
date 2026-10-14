/* User-confirmed WeChat Channels share resolution. Only the requested share is
 * sent to Tencent Yuanbao; login tokens/cookies never leave the official pages. */
(() => {
  "use strict";
  const sessions = new Map();
  const inspectYuanbao = async (share) => {
    if (location.origin !== "https://yuanbao.tencent.com") return { state: "unavailable" };
    try {
      const response = await fetch("/api/weixin/get_parse_result", {
        method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video_channel_url", url: share, scene: 1 }),
      });
      if ([401, 403].includes(response.status)) return { state: "login" };
      if (!response.ok) return { state: "unavailable" };
      const data = await response.json();
      const value = data?.data?.playable_url;
      if (data.code !== 0 || typeof value !== "string" || value.length > 8000) return { state: "unavailable" };
      const url = new URL(value);
      if (url.origin !== "https://channels.weixin.qq.com" || url.pathname !== "/finder-preview/pages/feed" ||
          url.username || url.password || url.hash || !url.searchParams.get("token") || !url.searchParams.get("eid")) return { state: "unavailable" };
      return { state: "ready", playback: url.href };
    } catch { return { state: "unavailable" }; }
  };
  const inspectPlayback = async (expected) => {
    if (location.href !== expected || location.origin !== "https://channels.weixin.qq.com") return { state: "unavailable" };
    try {
      const url = new URL(location.href);
      const response = await fetch("/finder-preview/api/feed/get_feed_info", {
        method: "POST", credentials: "omit", signal: AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseReq: { generalToken: url.searchParams.get("token") }, exportId: url.searchParams.get("eid") }),
      });
      if (!response.ok) return { state: "unavailable" };
      const data = await response.json();
      if (data.errCode !== 0 || data.data?.errMsg?.type !== 0 || location.href !== expected) return { state: "unavailable" };
      const feed = data.data.feedInfo;
      return { state: "ready", mediaUrl: feed?.h264VideoInfo?.videoUrl || "", title: String(feed?.description || "视频号").slice(0, 240) };
    } catch { return { state: "unavailable" }; }
  };
  const execute = async (tabId, fn, args) => {
    const entries = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: fn, args });
    return entries?.[0]?.result || { state: "unavailable" };
  };
  globalThis.lexihaloResolveChannelsRequest = async (message, sender) => {
    const page = globalThis.lexihaloSites.page(message.mediaPageUrl);
    const owner = globalThis.lexihaloSites.page(sender?.url || "");
    if (page?.id !== "channels" || !page.identity.startsWith("channels:share:") || owner?.identity !== page.identity || !Number.isInteger(sender?.tab?.id)) {
      throw new Error("无法确认当前视频号分享页面");
    }
    const key = `${sender.tab.id}:${sender.frameId ?? 0}`;
    if (message.mode === "open") {
      if (message.userInitiated !== true) throw new Error("请点击播放器菜单并确认打开元宝");
      for (const [id, session] of sessions) if (Date.now() - session.at > 180000) sessions.delete(id);
      const tab = await chrome.tabs.create({ url: "https://yuanbao.tencent.com/" });
      const sessionId = crypto.randomUUID();
      sessions.set(key, { id: sessionId, identity: page.identity, share: page.url, resolver: tab.id, at: Date.now() });
      return { state: "opened", sessionId };
    }
    const session = sessions.get(key);
    if (!session || session.id !== message.sessionId || session.identity !== page.identity || Date.now() - session.at > 180000) {
      throw new Error("视频号验证任务已过期，请重新打开菜单");
    }
    if (message.mode === "cancel") { sessions.delete(key); return { cancelled: true }; }
    if (message.mode !== "read") throw new Error("未知视频号验证操作");
    if (session.playback) {
      const tab = await chrome.tabs.get(session.playback);
      if (tab.status === "loading") return { state: "loading" };
      if (tab.url !== session.playbackUrl) throw new Error("官方播放页已切换，请重新验证");
      const result = await execute(session.playback, inspectPlayback, [session.playbackUrl]);
      if ((await chrome.tabs.get(session.playback)).url !== session.playbackUrl) throw new Error("官方播放页已切换");
      if (result.state === "ready" && globalThis.lexihaloSites.isMediaUrl(page.url, result.mediaUrl)) {
        sessions.delete(key);
        return { state: "ready", mediaUrl: result.mediaUrl, title: result.title };
      }
      return { state: "loading" };
    }
    const tab = await chrome.tabs.get(session.resolver);
    if (tab.status === "loading") return { state: "loading" };
    if (new URL(tab.url || "about:blank").origin !== "https://yuanbao.tencent.com") throw new Error("元宝页面已切换，请重新验证");
    const result = await execute(session.resolver, inspectYuanbao, [session.share]);
    if (new URL((await chrome.tabs.get(session.resolver)).url || "about:blank").origin !== "https://yuanbao.tencent.com") throw new Error("元宝页面已切换");
    if (result.state !== "ready") return result;
    const playback = await chrome.tabs.create({ url: result.playback });
    session.playback = playback.id;
    session.playbackUrl = result.playback;
    return { state: "loading" };
  };
})();
