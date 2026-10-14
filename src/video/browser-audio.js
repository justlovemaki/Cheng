/* Page-context transport for current, clear media; captured network resources
 * use the extension broker instead. Neither path exports login cookies to native. */
(() => {
  "use strict";
  const ph = () => /(^|\.)pornhub\.com$/i.test(location.hostname);
  const safeUrl = (raw, base) => {
    const url = new URL(raw, base);
    const allowed = ph() ? /(^|\.)phncdn\.com$/i.test(url.hostname) && !url.port
      : globalThis.lexihaloSites.isMediaUrl(location.href, url.href);
    if (url.protocol !== "https:" || !allowed || url.username || url.password || url.href.length > 8192) throw new Error("媒体不是当前播放器允许的公网 HTTPS 资源");
    url.hash = ""; return url.href;
  };
  const phSources = () => {
    const sources = [];
    for (const key of Object.keys(globalThis)) {
      if (!/^flashvars_\d+$/.test(key)) continue;
      for (const item of (globalThis[key]?.mediaDefinitions || []).slice(0, 40)) {
        try {
          const url = safeUrl(item.videoUrl);
          if (/\.m3u8$/i.test(new URL(url).pathname)) sources.push({ url, ext: "m3u8", quality: Number(item.quality) || Infinity });
        } catch {}
      }
    }
    return sources.sort((a, b) => a.quality - b.quality).slice(0, 12);
  };
  const readBrowserMedia = async ({ signal, sendPart, onProgress, source, purpose = "transcribe" }) => {
    const page = globalThis.lexihaloSites?.browserPage(location.href);
    if (!page && !ph()) throw new Error("当前页面不支持媒体读取");
    const identity = page?.identity || location.href;
    const prepared = page ? await globalThis.lexihaloSiteAdapters?.prepare({ signal, onProgress }) : null;
    const sources = source ? [source] : prepared?.sources?.length ? prepared.sources : ph() ? phSources() : [];
    if (!sources.length) throw new Error("未找到当前播放器真实媒体，请播放几秒后重试");
    const fetchResource = async (url, sig, range) => {
      if ((globalThis.lexihaloSites?.browserPage(location.href)?.identity || location.href) !== identity) throw new Error("视频已切换");
      return fetch(safeUrl(url), { credentials: "omit", redirect: "error", cache: "no-store",
        signal: AbortSignal.any([sig, AbortSignal.timeout(90000)].filter(Boolean)),
        ...(range ? { headers: { Range: `bytes=${range.start}-${range.end}` } } : {}) });
    };
    let lastError;
    for (const candidate of sources) {
      if (candidate.captureId) throw new Error("捕获的网络资源必须经扩展后台读取");
      let sent = false;
      try {
        return await globalThis.lexihaloMediaReader({ source: candidate, purpose, signal, safeUrl,
          fetchResource, resolution: candidate.resolution || 0, onProgress,
          onPart: async part => { sent = true; await sendPart(part); } });
      } catch (error) {
        if (sent || signal?.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("没有可读取的媒体");
  };
  globalThis.lexihaloReadBrowserMedia = readBrowserMedia;
  globalThis.lexihaloReadBrowserAudio = readBrowserMedia; // compatibility alias
})();
