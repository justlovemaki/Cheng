/* Canonical media-source contract shared by page adapters and the background.
 * Legacy isAudio/ext fields remain so existing bridge/native messages stay wire-compatible. */
(() => {
  "use strict";

  const KIND = Object.freeze({ AUDIO: "audio", VIDEO: "video" });
  const TRANSPORT = Object.freeze({ DIRECT: "direct", CAPTURE: "capture", NATIVE_PAGE: "native-page" });
  const AUDIO_EXTENSIONS = new Set(["m4a", "mp3", "aac", "wav", "flac", "ogg", "opus"]);
  const MEDIA_EXTENSION = /\.(mp4|m4a|webm|mp3|aac|wav|flac|ogg|opus|m3u8)$/i;
  const REJECT_EXTENSION = /\.(html?|js|css|jpe?g|png|gif|svg)$/i;

  const kindOf = (value = {}) => value.kind === KIND.AUDIO || value.isAudio === true
    ? KIND.AUDIO : KIND.VIDEO;
  const sourceKey = (source) => source?.transport === TRANSPORT.CAPTURE
    ? `capture:${source.captureId || ""}`
    : source?.transport === TRANSPORT.NATIVE_PAGE
      ? `native:${source.pageUrl || ""}`
      : `direct:${source?.url || ""}`;
  const normalize = (value = {}) => {
    const transport = value.transport || (value.captureId ? TRANSPORT.CAPTURE : value.pageUrl ? TRANSPORT.NATIVE_PAGE : TRANSPORT.DIRECT);
    const kind = kindOf(value);
    return {
      ...value,
      transport,
      kind,
      isAudio: kind === KIND.AUDIO,
      size: Number(value.size) || 0,
      resolution: kind === KIND.AUDIO ? 0 : Number(value.resolution) || 0,
    };
  };
  const append = (list, value) => {
    if (!value) return null;
    const source = normalize(value), key = sourceKey(source);
    if (!key || list.some(item => sourceKey(item) === key)) return null;
    list.push(source);
    return source;
  };
  const addDirect = (list, page, raw, metadata = {}) => {
    if (!page || typeof raw !== "string" || !raw) return null;
    const { upgradeHttp = false, ...details } = metadata;
    if (upgradeHttp && raw.startsWith("http:")) {
      try { const upgraded = new URL(raw); upgraded.protocol = "https:"; raw = upgraded.href; } catch {}
    }
    try { raw = new URL(raw, page.url).href; } catch { return null; }
    if (!globalThis.lexihaloSites?.isMediaUrl(page.url, raw)) return null;
    const url = new URL(raw, page.url);
    if (REJECT_EXTENSION.test(url.pathname)) return null;
    const inferredExt = url.pathname.match(MEDIA_EXTENSION)?.[1]?.toLowerCase();
    const kind = [KIND.AUDIO, KIND.VIDEO].includes(details.kind)
      ? details.kind
      : (details.isAudio ?? AUDIO_EXTENSIONS.has(inferredExt)) ? KIND.AUDIO : KIND.VIDEO;
    const ext = /mpegurl/i.test(details.mimeType || "") ? "m3u8" : inferredExt || (kind === KIND.AUDIO ? "m4a" : "mp4");
    return append(list, {
      ...details,
      transport: TRANSPORT.DIRECT,
      kind,
      url: url.href,
      ext,
      mimeType: details.mimeType || (ext === "m3u8" ? "application/vnd.apple.mpegurl" : `${kind}/${ext}`),
    });
  };
  const addCaptured = (list, value) => value?.captureId
    ? append(list, { ...value, transport: TRANSPORT.CAPTURE }) : null;
  const merge = (...groups) => {
    const result = [];
    for (const group of groups) for (const source of group || []) {
      if (source?.captureId) addCaptured(result, source); else append(result, source);
    }
    return result;
  };
  const capabilities = (page) => Object.freeze({
    audioOnly: page?.audio === true,
    browserReadable: page?.browser === true || page?.id === "generic",
    generic: page?.id === "generic",
  });

  globalThis.lexihaloMediaContract = { KIND, TRANSPORT, kindOf, sourceKey, normalize, append, addDirect, addCaptured, merge, capabilities };
})();
