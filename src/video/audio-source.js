/* Resolve browser-readable media without making platform details part of the UI. */
(() => {
  const MAX_BYTES = 24 * 1024 * 1024;
  globalThis.lexihaloMediaPageUrl = ({ platform, context }) => {
    context = context || {};
    const here = new URL(location.href);
    if (typeof globalThis.lexihaloSites?.nativePage === "function") {
      return globalThis.lexihaloSites.nativePage(here.href)?.url || null;
    }
    if (globalThis.lexihaloSites?.siteOf(here.href)) {
      return globalThis.lexihaloSites.page(here.href)?.url || null;
    }
    if (platform === "youtube") {
      const id = String(context.id || "");
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
    }
    if (platform === "bilibili") {
      const bvid = here.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/)?.[1] ||
        String(globalThis.__INITIAL_STATE__?.bvid || "").match(/^BV[0-9A-Za-z]{10}$/)?.[0] ||
        String(context.id || "").match(/^BV[0-9A-Za-z]{10}$/)?.[0];
      if (!bvid) return null;
      const page = Number(here.searchParams.get("p"));
      return `https://www.bilibili.com/video/${bvid}${Number.isInteger(page) && page > 1 ? `?p=${page}` : ""}`;
    }
    if (platform === "vimeo") {
      const id = String(context.id || "");
      return /^\d{5,12}$/.test(id) ? `https://vimeo.com/${id}` : null;
    }
    if (platform === "ted" && /(^|\.)ted\.com$/.test(here.hostname) && /^\/talks\/[A-Za-z0-9_-]+\/?$/.test(here.pathname)) {
      here.search = ""; here.hash = ""; return here.href;
    }
    if (/(^|\.)pornhub\.com$/i.test(here.hostname)) {
      const id =
        here.searchParams.get("viewkey") ||
        here.pathname.match(/^\/embed\/([A-Za-z0-9]+)\/?$/)?.[1];
      if (/^[A-Za-z0-9]+$/.test(id || "")) {
        return `${here.origin}/view_video.php?viewkey=${id}`;
      }
    }
    // Generic yt-dlp fallback is restricted again by the background sender
    // identity check and by the native host's public-HTTPS/DNS validation.
    const host = here.hostname.toLowerCase();
    const blockedHost =
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host.includes(":");
    if (here.protocol === "https:" && !blockedHost && !here.username && !here.password) {
      here.hash = "";
      return here.href;
    }
    return null;
  };
  globalThis.lexihaloPreferNativeHelper = ({ platform }) => {
    let host = "";
    try {
      host = new URL(location.href).hostname;
    } catch {}
    const site = globalThis.lexihaloSites?.page(location.href);
    const capabilities = globalThis.lexihaloPlatformCapabilities.resolve({ platform, page: site || globalThis.lexihaloSites?.browserPage(location.href), host });
    const snapshot = capabilities.browserCapture ? globalThis.lexihaloSiteAdapters?.snapshot() : null;
    return platform === "pornhub" || /(^|\.)pornhub\.com$/i.test(host) || Boolean(site?.browser) ||
      Boolean(site && snapshot?.sources?.length) ||
      Boolean(snapshot?.page?.id === "generic" && snapshot.sources.some(source => source.ext === "m3u8" || source.size > MAX_BYTES));
  };
  globalThis.lexihaloResolveAudioSource = ({ platform, context, video }) => {
    context = context || {};
    const streams = [];
    let host = "";
    try { host = new URL(location.href).hostname; } catch {}
    const page = globalThis.lexihaloSites?.page(location.href) || globalThis.lexihaloSites?.browserPage(location.href);
    const capabilities = globalThis.lexihaloPlatformCapabilities.resolve({ platform, page, host });
    const snapshot = capabilities.browserCapture ? globalThis.lexihaloSiteAdapters?.snapshot() : null;
    const add = (url, size, bitrate, mimeType) => {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url) || /\.(?:m3u8|mpd)(?:$|[?#])/i.test(url)) return;
      streams.push({ url, size: Number(size) || 0, bitrate: Number(bitrate) || 0, mimeType: mimeType || "audio/webm" });
    };
    for (const source of snapshot?.sources || []) add(source.url, source.size, source.bitrate, source.mimeType);
    // Never mutate platformContext.streams: it is shared with the player.
    try {
      for (const stream of context.streams || []) add(stream?.urls?.[0], stream?.size, stream?.bitrate, stream?.mimeType);
    } catch {}
    try {
      for (const format of context.context?.ytInitialPlayerResponse?.streamingData?.adaptiveFormats || []) {
        if (/audio/i.test(format?.mimeType || "")) add(format.url, format.contentLength, format.bitrate, format.mimeType);
      }
    } catch {}
    if (platform === "bilibili") {
      try {
        for (const format of globalThis.__playinfo__?.data?.dash?.audio || []) {
          add(format.baseUrl || format.base_url, format.size, format.bandwidth, format.mimeType || "audio/mp4");
        }
      } catch {}
    }
    const mediaElements = video
      ? [
          {
            url: video.currentSrc || video.src || video.getAttribute("src") || "",
            type: video.getAttribute("type") || "",
          },
          ...Array.from(video.querySelectorAll("source[src]")).map((source) => ({
            url: source.src || source.getAttribute("src") || "",
            type: source.type || "",
          })),
        ]
      : [];
    for (const media of mediaElements) {
      if (
        !/^https?:\/\//i.test(media.url) ||
        /\.(?:m3u8|mpd)(?:$|\?)/i.test(media.url)
      )
        continue;
      const pathname = new URL(media.url).pathname.toLowerCase();
      add(
        media.url,
        0,
        Number.MAX_SAFE_INTEGER,
        media.type || (/\.webm$/.test(pathname) ? "video/webm" : "video/mp4"),
      );
    }
    const candidates = [...new Map(streams.map(stream => [stream.url, stream])).values()]
      .sort((a, b) => Number(!/^audio\//i.test(a.mimeType)) - Number(!/^audio\//i.test(b.mimeType)) ||
        (a.size || Infinity) - (b.size || Infinity) || a.bitrate - b.bitrate);
    const chosen = candidates.find(stream => !stream.size || stream.size <= MAX_BYTES);
    return { source: chosen, oversized: !chosen && candidates.length > 0, candidates,
      browserSources: snapshot?.sources || [], wrapper: snapshot?.wrapper === true };
  };
})();
