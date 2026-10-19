/* Page-side media adapter. No access to the learning database or API keys. */
(() => {
  "use strict";
  let stopSegment = () => {};
  const canonical = (value) => {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (
        ![
          "v",
          "p",
          "id",
          "bvid",
          "episode",
          "lesson",
          "lecture",
          "course",
        ].includes(key)
      )
        url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  };
  const mediaElement = () => {
    const active = window.captionProvider?.video;
    if (active?.isConnected) return active;
    return [...document.querySelectorAll("video,audio")].sort(
      (a, b) => score(b) - score(a),
    )[0];
  };
  const score = (media) => {
    const bounds = media.getBoundingClientRect();
    const visible =
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < innerHeight &&
      bounds.left < innerWidth;
    return (
      (!media.paused && !media.ended ? 1e8 : 0) +
      (visible ? bounds.width * bounds.height : 0)
    );
  };
  function sourceHint(media = mediaElement()) {
    const provider = window.captionProvider;
    let mediaPath = "",
      itemIdentity = "";
    try {
      const item = globalThis.lexihaloSiteAdapters?.currentItem?.();
      if (
        item?.id !== "generic" &&
        item?.identity &&
        (!item.contextual || item.itemId)
      )
        itemIdentity = String(item.identity);
    } catch {}
    if (media?.currentSrc && /^https?:\/\//.test(media.currentSrc)) {
      const url = new URL(media.currentSrc);
      mediaPath = `${url.origin}${url.pathname}`;
    }
    return {
      sourceUrl: canonical(location.href),
      platform: String(provider?.platform || "web"),
      sourceId: String(window.metacontext?.vid || provider?.id || ""),
      mediaPath,
      itemIdentity,
    };
  }
  async function source(media) {
    const hint = sourceHint(media),
      { sourceUrl, platform } = hint;
    let sourceId = hint.sourceId,
      value = sourceId;
    if (hint.itemIdentity) value = hint.itemIdentity;
    else if (["web", "html5", "generic"].includes(platform) && hint.mediaPath)
      value = `${sourceUrl}|${hint.mediaPath}`;
    else if (/^[\w.-]{1,160}$/.test(sourceId))
      return { sourceUrl, platform, sourceId };
    else if (/^https?:\/\//.test(sourceId)) value = canonical(sourceId);
    if (value) {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
      );
      sourceId = [...new Uint8Array(bytes)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    return { sourceUrl, platform, sourceId };
  }
  function sourceIdentity({ sourceUrl, platform, sourceId }) {
    const url = new URL(sourceUrl);
    if (/(^|\.)youtu(be\.com|\.be)$/.test(url.hostname)) {
      const videoId =
        url.searchParams.get("v") ||
        url.pathname.match(
          /\/(?:shorts\/|embed\/|live\/)?([\w-]{11})(?:\/|$)/,
        )?.[1];
      if (videoId) return `youtube:${videoId}`;
    }
    return sourceId ? `${platform}:${sourceId}` : `url:${sourceUrl}`;
  }
  async function snapshot() {
    const media = mediaElement();
    if (!media) return null;
    const provider = window.captionProvider;
    const info = await source(media);
    let cues = [];
    try {
      cues = (provider?.lines || []).slice(0, 30000).map((line) => ({
        start: Number(line.start) / 1000,
        end: Number(line.end) / 1000,
        text: String(line.originalText || line.text || ""),
        repaired: String(
          line.repairedText ||
            (line.originalText && line.originalText !== line.text
              ? line.text
              : "") ||
            "",
        ),
        translation: String(line.AITranslation || line.translation || ""),
      }));
    } catch {}
    if (!cues.length) {
      const track = [...(media.textTracks || [])].find(
        (item) => item.cues?.length,
      );
      cues = [...(track?.cues || [])].slice(0, 30000).map((cue) => ({
        start: cue.startTime,
        end: cue.endTime,
        text: cue.text,
      }));
    }
    cues = cues.filter(
      (cue) =>
        cue.text &&
        Number.isFinite(cue.start) &&
        Number.isFinite(cue.end) &&
        cue.start >= 0 &&
        cue.end > cue.start,
    );
    const rect = media.getBoundingClientRect();
    return {
      ...info,
      title: document.title.slice(0, 500),
      language: String(provider?.from || "auto"),
      currentTime: Math.max(0, Number(media.currentTime) || 0),
      score: score(media),
      cues,
      bounds: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      },
    };
  }
  async function live() {
    const media = mediaElement();
    if (!media) return null;
    const provider = window.captionProvider;
    const info = await source(media);
    let lines = [],
      milliseconds = true;
    try {
      lines = provider?.lines || [];
    } catch {}
    if (!lines.length) {
      milliseconds = false;
      lines =
        [...(media.textTracks || [])].find((track) => track.cues?.length)
          ?.cues || [];
    }
    const currentTime = Math.max(0, Number(media.currentTime) || 0);
    const startOf = (cue) =>
      Number(milliseconds ? cue.start : cue.startTime) /
      (milliseconds ? 1000 : 1);
    let low = 0,
      high = Math.min(lines.length, 30000);
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (startOf(lines[middle]) <= currentTime) low = middle + 1;
      else high = middle;
    }
    const index = Math.max(0, low - 1),
      cues = [];
    for (
      let position = Math.max(0, index - 3);
      position < Math.min(lines.length, index + 5, 30000);
      position++
    ) {
      const cue = lines[position];
      const start = startOf(cue),
        end =
          Number(milliseconds ? cue.end : cue.endTime) /
          (milliseconds ? 1000 : 1);
      const text = String(cue.originalText || cue.text || "");
      if (
        !text ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start
      )
        continue;
      const translated = String(cue.AITranslation || cue.translation || "");
      cues.push({
        id: `live-${position}`,
        start,
        end,
        text: text.slice(0, 8000),
        repaired: String(
          cue.repairedText ||
            (cue.originalText && cue.originalText !== cue.text
              ? cue.text
              : "") ||
            "",
        ).slice(0, 8000),
        translation: /AI 翻译失败|superseded/.test(translated)
          ? ""
          : translated.slice(0, 12000),
        active: start <= currentTime && end > currentTime,
      });
    }
    return {
      ...info,
      identity: sourceIdentity(info),
      title: document.title.slice(0, 500),
      currentTime,
      paused: media.paused,
      score: score(media),
      total: Math.min(lines.length, 30000),
      cues,
    };
  }
  async function seek({ identity, start, end }) {
    const media = mediaElement();
    if (
      !media ||
      media.readyState < 1 ||
      !Number.isFinite(start) ||
      start < 0 ||
      sourceIdentity(await source(media)) !== identity
    )
      return { ok: false };
    stopSegment();
    media.currentTime = start;
    if (Number.isFinite(end) && end > start) {
      const page = location.href;
      const check = () => {
        if (
          media.currentTime >= end ||
          location.href !== page ||
          !media.isConnected
        ) {
          media.pause();
          stopSegment();
        }
      };
      const cancelOnSeek = () => {
        if (media.currentTime < start - 0.5 || media.currentTime > end + 0.5)
          stopSegment();
      };
      const timer = setInterval(check, 60);
      media.addEventListener("timeupdate", check);
      media.addEventListener("seeking", cancelOnSeek);
      stopSegment = () => {
        clearInterval(timer);
        media.removeEventListener("timeupdate", check);
        media.removeEventListener("seeking", cancelOnSeek);
        stopSegment = () => {};
      };
      try {
        await media.play();
      } catch {
        stopSegment();
        return { ok: false, reason: "浏览器阻止了自动播放" };
      }
    }
    return { ok: true };
  }
  addEventListener("pagehide", () => stopSegment());
  async function progress() {
    const media = mediaElement();
    return media
      ? {
          ...(await source(media)),
          currentTime: Math.max(0, Number(media.currentTime) || 0),
        }
      : null;
  }
  async function enableCaptions({ identity }) {
    const media = mediaElement(),
      provider = window.captionProvider;
    if (
      !media ||
      !provider?.event?.emit ||
      sourceIdentity(await source(media)) !== identity
    )
      return { ok: false };
    provider.event.emit("caption.enable");
    return { ok: true };
  }
  globalThis.chengVideoBridge = {
    snapshot,
    seek,
    sourceHint,
    progress,
    live,
    enableCaptions,
  };
})();
