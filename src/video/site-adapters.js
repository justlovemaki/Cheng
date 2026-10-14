/* Site snapshots inspired by qiaomu-clipper (MIT); implementation follows LexiHalo's
 * player -> background -> native helper pipeline. No cookies or API keys leave the browser. */
(() => {
  "use strict";
  const policy = globalThis.lexihaloSites;
  const mediaContract = globalThis.lexihaloMediaContract;
  const siteHooks = globalThis.lexihaloMediaSiteHooks;
  const preparedSnapshots = new Map();
  const view = (element) => {
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    if (css.display === "none" || css.visibility === "hidden") return -1;
    return Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) *
      Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
  };
  const pickMedia = () => {
    const site = policy.siteOf(location.href);
    const candidates = Array.from(document.querySelectorAll(site || hasPlayerFrame() ? "video, audio" : "video"))
      .filter((media) => media.isConnected && !media.closest("[data-lexihalo-media-probe], [class*='liveCard']") && !media.srcObject);
    const customMedia = siteHooks.pickMedia(policy.page(location.href), { candidates });
    if (customMedia) return customMedia;
    if (siteHooks.get(site)?.pickMedia) return null;
    const ranked = candidates.filter(media => !media.hasAttribute?.("data-lexihalo-proxy"))
      .map((media) => ({ media, area: view(media),
        score: view(media) + (!media.paused && !media.ended ? 1e9 : 0) }))
      .filter((item) => item.area > 0 || (site?.audio && item.media.tagName === "AUDIO"))
      .sort((left, right) => right.score - left.score);
    if (ranked[0]?.media) {
      document.querySelector(".lexihalo-media-proxy-host")?.remove();
      if (!ranked[0].media.hasAttribute?.("data-lexihalo-placeholder")) {
        document.querySelector(".lexihalo-audio-tool-host")?.remove();
      }
      return ranked[0].media;
    }
    return candidates.find(media => media.hasAttribute?.("data-lexihalo-proxy")) || null;
  };
  const title = () => (document.querySelector("h1, #detail-title")?.textContent || document.title || "media").trim().slice(0, 240);
  const add = (list, page, raw, metadata = {}) => mediaContract.addDirect(list, page, raw, metadata);
  const declaredParentSources = (media, page, sources) => {
    if (!media || typeof parent === "undefined") return false;
    let declared = false, scanned = 0;
    // Recognize a literal media-src assignment only; never eval page scripts,
    // guess a parent element ID, or enumerate the parent's unrelated resources.
    const assignment = /\bdocument\s*\.\s*getElementById\(\s*(['"])([\w:-]{1,100})\1\s*\)\s*\.\s*src\s*=\s*(?:window\s*\.\s*)?parent\s*\.\s*document\s*\.\s*getElementById\(\s*(['"])([\w:-]{1,100})\3\s*\)\s*\.\s*src\b/g;
    for (const script of Array.from(document.scripts || []).slice(0, 64)) {
      if (script.src) continue;
      const text = script.textContent || "";
      scanned += text.length;
      if (text.length > 64000 || scanned > 256000) break;
      assignment.lastIndex = 0;
      for (const match of text.matchAll(assignment)) {
        const target = document.getElementById(match[2]);
        if (!target || !["VIDEO", "AUDIO", "SOURCE"].includes(target.tagName) ||
            (target !== media && !media.contains?.(target))) continue;
        declared = true;
        try {
          if (parent === window || parent.location.origin !== location.origin) continue;
          const source = parent.document.getElementById(match[4]);
          add(sources, page, source?.src, { isAudio: media.tagName === "AUDIO",
            mimeType: target.getAttribute("type") || "", resolution: media.videoHeight || 0 });
        } catch {}
      }
    }
    return declared;
  };
  const snapshot = () => {
    const page = policy.browserPage(location.href);
    if (!page) return null;
    const media = pickMedia(), sources = [];
    let parentSourceDeclared = false;
    if (media?.mediaKeys) throw new Error("不支持 DRM 视频");
    if (media) {
      add(sources, page, media.currentSrc || media.src, { isAudio: media.tagName === "AUDIO",
        resolution: media.videoHeight || 0, mimeType: media.getAttribute("type") || "" });
      for (const source of media.querySelectorAll("source[src]")) add(sources, page, source.src, {
        isAudio: media.tagName === "AUDIO", mimeType: source.type || "" });
    }
    const playerFrame = page.id === "generic" && (!media || media.hasAttribute?.("data-lexihalo-placeholder")) ? findPlayerFrame() : null;
    if (playerFrame) {
      // Read only actual media in the selected, visible same-origin frame.
      // Cross-origin frames are handled by background network capture instead.
      try {
        for (const element of playerFrame.contentDocument?.querySelectorAll("video, audio") || []) {
          if (element.srcObject || element.mediaKeys) continue;
          const metadata = { isAudio: element.tagName === "AUDIO", resolution: element.videoHeight || 0 };
          add(sources, page, element.currentSrc || element.src, metadata);
          for (const source of element.querySelectorAll("source[src]")) {
            add(sources, page, source.src, { ...metadata, mimeType: source.type || "" });
          }
        }
      } catch {}
    }
    if (page.id === "generic" && media) {
      // Video.js replaces the <video>/<source> with a blob-backed media element.
      // Its currentSource still names this player's original HTTP/HLS resource.
      try {
        const wrapper = media.closest(".video-js");
        const playerId = wrapper?.id || media.id?.replace(/_html5_api$/, "");
        const player = globalThis.videojs?.getPlayer?.(playerId);
        if (player?.el?.()?.contains(media)) {
          const current = player.currentSource?.();
          for (const source of [current, ...(player.currentSources?.() || [])].filter(Boolean)) {
            add(sources, page, source.src, { mimeType: source.type || "", resolution: media.videoHeight || 0 });
          }
        }
      } catch {}
      parentSourceDeclared = declaredParentSources(media, page, sources);
    }
    siteHooks.snapshot(page, { media, sources, add });
    if (page.id !== "generic" && siteHooks.flag(page, "openGraph", true)) {
      for (const node of document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:audio"], meta[property="og:audio:url"]')) {
        add(sources, page, node.content, { isAudio: /audio/.test(node.getAttribute("property")) });
      }
    }
    const cached = preparedSnapshots.get(page.identity);
    if (cached && Date.now() - cached.at < 60000) {
      if (!sources.length) sources.push(...cached.sources);
      else {
        // prepare() may add opaque background captures beside an already-known
        // DOM/Video.js URL. A following snapshot must retain those captures so
        // AI transcription takes the broker path just like resource download.
        for (const captured of cached.sources.filter(source => source.captureId)) {
          if (!sources.some(source => source.captureId === captured.captureId)) sources.push(captured);
        }
      }
    }
    sources.sort((a, b) => Number(b.kind === "audio") - Number(a.kind === "audio") || (a.size || Infinity) - (b.size || Infinity) || (a.resolution || Infinity) - (b.resolution || Infinity));
    const wrapper = page.id === "generic" && Boolean(parentSourceDeclared || playerFrame);
    return { page, capabilities: mediaContract.capabilities(page), media, wrapper,
      title: title(), duration: Number.isFinite(media?.duration) ? media.duration : 0,
      sources: sources.slice(0, 24) };
  };
  const jsonFetch = async (path, options = {}, signal) => {
    const response = await fetch(path, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(25000)].filter(Boolean)) });
    if ([401, 403].includes(response.status)) throw new Error("请先在原网站登录并确认你有播放权限");
    if (!response.ok) throw new Error(`站点媒体接口失败（HTTP ${response.status}）`);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let text = "", size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 2_000_000) throw new Error("站点媒体数据过大");
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  const measuredDuration = (url, signal) => new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.setAttribute("data-lexihalo-media-probe", "true");
    const finish = (value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      probe.onloadedmetadata = null; probe.onerror = null;
      probe.removeAttribute("src"); probe.load();
      resolve(value);
    };
    const abort = () => finish(NaN);
    const timer = setTimeout(abort, 6000);
    probe.onloadedmetadata = () => finish(probe.duration);
    probe.onerror = abort;
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort(); else probe.src = url;
  });
  const observedCurrentMedia = async (result, signal) => {
    if (!siteHooks.flag(result.page, "observedFallback") || result.sources.length || !result.media ||
        !Number.isFinite(result.media.duration) || result.media.duration <= 0 ||
        typeof globalThis.performance?.getEntriesByType !== "function") return;
    const navigation = performance.getEntriesByType("navigation")[0];
    if (policy.page(navigation?.name)?.identity !== result.page.identity) return;
    const observed = [...new Set(performance.getEntriesByType("resource").map((entry) => entry.name))]
      .filter((url) => policy.isMediaUrl(result.page.url, url));
    const groups = new Map(), adapter = siteHooks.get(result.page);
    for (const raw of observed) {
      const candidate = adapter?.observedCandidate?.(raw);
      if (!candidate?.key) continue;
      groups.set(candidate.key, [...(groups.get(candidate.key) || []), { raw, bitrate: candidate.bitrate }]);
    }
    // A preload may be a different clip. Require a single request group on the
    // exact initial detail page, then verify against the current player's time.
    if (groups.size !== 1) return;
    const candidates = [...groups.values()][0].sort((a, b) => a.bitrate - b.bitrate);
    for (const { raw: url } of candidates.slice(0, 4)) {
      if (signal?.aborted) throw new Error("已取消媒体读取");
      const duration = await measuredDuration(url, signal);
      if (policy.page(location.href)?.identity !== result.page.identity) throw new Error("视频已切换");
      if (Number.isFinite(duration) && Math.abs(duration - result.media.duration) <= Math.max(.5, result.media.duration * .005)) {
        add(result.sources, result.page, url, { resolution: result.media.videoHeight || 0 });
        return;
      }
    }
  };
  const prepare = async ({ signal, onProgress } = {}) => {
    const result = snapshot();
    if (!result) return null;
    const identity = result.page.identity;
    if (result.page.id === "generic" && typeof globalThis.lexihaloGetCapturedSources === "function") {
      const captured = await globalThis.lexihaloGetCapturedSources();
      if (Array.isArray(captured?.sources) && captured.sources.length) {
        result.sources = mediaContract.merge(captured.sources, result.sources);
      }
    }
    await observedCurrentMedia(result, signal);
    result.add = (raw, metadata = {}) => add(result.sources, result.page, raw, metadata);
    try { await siteHooks.prepare(result.page, { result, jsonFetch, signal, onProgress }); }
    finally { delete result.add; }
    if (policy.browserPage(location.href)?.identity !== identity) throw new Error("视频已切换，请重新打开菜单");
    if (preparedSnapshots.size > 16) preparedSnapshots.clear();
    preparedSnapshots.set(identity, { at: Date.now(), sources: result.sources });
    const preview = document.querySelector("audio[data-lexihalo-placeholder]:not([data-lexihalo-proxy])");
    const audioSource = result.sources.find((source) => source.kind === "audio" && source.ext !== "m3u8");
    if (preview && audioSource) preview.src = audioSource.url;
    return result;
  };
  const findPlayerFrame = () => Array.from(document.querySelectorAll("iframe"))
    .filter(frame => {
      if (frame.tagName !== "IFRAME" || frame.closest?.("[data-lexihalo-media-probe], .lexihalo-audio-host")) return false;
      const rect = frame.getBoundingClientRect();
      if (rect.width < 160 || rect.height < 90 || view(frame) <= 0) return false;
      try { if (frame.contentDocument?.querySelector("video, audio")) return true; } catch {}
      // A hint enables the resource-tool host, not media extraction. URLs are
      // accepted only from real DOM sources or document-bound network responses.
      return /player|video|embed|play/i.test([frame.src, frame.title, frame.name].join(" "));
    })
    .sort((left, right) => view(right) - view(left))[0] || null;
  const frameOwnsRuntime = (frame) => {
    try {
      if (frame.hasAttribute?.("srcdoc")) return false;
      const declared = frame.getAttribute?.("src");
      const raw = declared == null ? frame.src : declared;
      if (!String(raw || "").trim()) return false;
      const url = new URL(raw, location.href);
      return ["http:", "https:", "file:"].includes(url.protocol);
    } catch { return false; }
  };
  const findProxyFrame = () => {
    const frame = findPlayerFrame();
    return frame && !frameOwnsRuntime(frame) ? frame : null;
  };
  const hasPlayerFrame = () => Boolean(findProxyFrame());
  const ensureHost = (media) => {
    if (media?.tagName === "VIDEO") return media.parentElement;
    if (media?.hasAttribute?.("data-lexihalo-proxy")) return media.closest(".lexihalo-media-proxy-host");
    if (media?.hasAttribute?.("data-lexihalo-tool-anchor")) return media.closest(".lexihalo-audio-tool-host");
    if (media?.tagName === "AUDIO") {
      document.querySelector(".lexihalo-audio-tool-host")?.remove();
      return media.parentElement;
    }
    const site = policy.siteOf(location.href);
    const frame = !media ? findProxyFrame() : null;
    const frameProxy = !media && !site?.audio;
    const audioTool = !media && site?.audio;
    if (frameProxy && !frame) return null;
    if (!frameProxy && !audioTool) return null;
    const selector = frameProxy ? ".lexihalo-media-proxy-host" : ".lexihalo-audio-tool-host";
    let host = document.querySelector(selector);
    if (!host) {
      host = document.createElement("section");
      host.className = frameProxy
        ? "lexihalo-audio-host lexihalo-media-proxy-host lexihalo-html5-container"
        : "lexihalo-audio-host lexihalo-audio-tool-host lexihalo-html5-container";
      const audio = document.createElement("audio");
      audio.controls = false;
      audio.setAttribute("data-lexihalo-placeholder", "true");
      audio.setAttribute(frameProxy ? "data-lexihalo-proxy" : "data-lexihalo-tool-anchor", "true");
      audio.setAttribute("aria-label", frameProxy ? "LexiHalo 播放器工具锚点" : "LexiHalo 音频工具入口");
      host.appendChild(audio);
      const anchor = frameProxy ? frame?.parentElement : document.body;
      if (frameProxy && anchor && getComputedStyle(anchor).position === "static") {
        anchor.classList.add("lexihalo-html5-position-static");
      }
      anchor?.appendChild(host);
    }
    return host;
  };
  globalThis.lexihaloSiteAdapters = { pickMedia, snapshot, prepare, ensureHost, hasPlayerFrame };
})();
