/* Bounded clear-HLS/HTTP reader. Transport is supplied by the caller (page or
 * extension broker); only media bytes and numeric fragment metadata reach native. */
(() => {
  "use strict";
  const MAX_BYTES = 2 * 1024 ** 3, PART = 192 * 1024, MAX_ENTRIES = 5000;
  const attrs = (line) => Object.fromEntries(Array.from(
    line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g), m => [m[1], m[2].replace(/^"|"$/g, "")],
  ));
  const rangeOf = (raw, offset) => {
    const match = /^(\d+)(?:@(\d+))?$/.exec(raw || "");
    if (!match) throw new Error("HLS 字节范围无效");
    const length = Number(match[1]), start = match[2] == null ? offset : Number(match[2]);
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES) throw new Error("HLS 字节范围无效");
    return { start, end: start + length - 1 };
  };
  const textOf = async (response) => {
    const reader = response.body.getReader(); let text = "", bytes = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.length; if (bytes > 2 * 1024 * 1024) throw new Error("HLS 清单超过 2 MB");
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  globalThis.lexihaloMediaReader = async ({ source, purpose = "transcribe", fetchResource, safeUrl,
    signal, onPart, onProgress, resolution = 0 }) => {
    const abort = () => { if (signal?.aborted) throw new Error("已取消媒体读取"); };
    const load = async (url, range) => {
      abort(); const response = await fetchResource(safeUrl(url), signal, range);
      if (!response.ok || !response.body) throw new Error(`读取媒体失败（HTTP ${response.status}）`);
      if (range && (response.status !== 206 || !(response.headers.get("content-range") || "").startsWith(`bytes ${range.start}-${range.end}/`))) throw new Error("媒体服务器未返回完整字节范围");
      return response;
    };
    const resolve = async (url, depth = 0, mode = purpose) => {
      if (depth > 4) throw new Error("HLS 清单嵌套过深");
      const response = await load(url);
      const base = safeUrl(response.url || url);
      const text = await textOf(response);
      const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines[0] !== "#EXTM3U") throw new Error("未返回有效的 HLS 清单");
      if (lines.some(l => l.startsWith("#EXT-X-SESSION-KEY:") || (l.startsWith("#EXT-X-KEY:") && attrs(l).METHOD !== "NONE"))) throw new Error("不处理加密/DRM HLS");
      const variants = [];
      for (let i = 0; i < lines.length; i++) if (lines[i].startsWith("#EXT-X-STREAM-INF:") && lines[i + 1] && !lines[i + 1].startsWith("#")) {
        variants.push({ ...attrs(lines[i]), url: safeUrl(lines[i + 1], base) });
      }
      if (variants.length) {
        variants.sort((a, b) => Number(a.BANDWIDTH || Infinity) - Number(b.BANDWIDTH || Infinity));
        const qualified = resolution > 0 ? variants.filter(v => {
          const dimensions = String(v.RESOLUTION || "").split("x").map(Number);
          return !dimensions[1] || Math.min(...dimensions) <= resolution;
        }) : variants;
        const selected = mode === "download" ? (qualified.at(-1) || variants.at(-1)) : variants[0];
        const audio = lines.filter(l => l.startsWith("#EXT-X-MEDIA:")).map(attrs)
          .find(a => a.TYPE === "AUDIO" && a["GROUP-ID"] === selected.AUDIO && a.URI);
        if (audio && mode === "transcribe") return resolve(safeUrl(audio.URI, base), depth + 1, mode);
        const main = await resolve(selected.url, depth + 1, mode);
        if (audio) main.audio = await resolve(safeUrl(audio.URI, base), depth + 1, "transcribe");
        return main;
      }
      if (!lines.includes("#EXT-X-ENDLIST")) throw new Error("暂不处理直播或未结束的 HLS 清单");
      const entries = []; let duration = 0, seconds = 0, rangeRaw = "", previousUrl = "", nextOffset;
      let map = null, discontinuity = false;
      for (const line of lines) {
        if (line.startsWith("#EXTINF:")) seconds = Number.parseFloat(line.slice(8));
        else if (line === "#EXT-X-GAP") throw new Error("HLS 媒体存在缺片");
        else if (line === "#EXT-X-DISCONTINUITY") discontinuity = true;
        else if (line.startsWith("#EXT-X-BYTERANGE:")) rangeRaw = line.slice(17);
        else if (line.startsWith("#EXT-X-MAP:")) {
          const data = attrs(line), mapUrl = safeUrl(data.URI, base);
          const range = data.BYTERANGE ? rangeOf(data.BYTERANGE) : null;
          const previous = entries.find(e => e.kind === "init" && e.url === mapUrl && JSON.stringify(e.range) === JSON.stringify(range));
          map = previous ? previous.index : entries.length;
          if (!previous) entries.push({ index: map, kind: "init", url: mapUrl, range });
        } else if (!line.startsWith("#")) {
          if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("HLS 分段时长无效");
          const segmentUrl = safeUrl(line, base), range = rangeRaw ? rangeOf(rangeRaw, previousUrl === segmentUrl ? nextOffset : undefined) : null;
          entries.push({ index: entries.length, kind: "segment", url: segmentUrl, range, duration: seconds, map, discontinuity });
          duration += seconds; seconds = 0; rangeRaw = ""; discontinuity = false;
          previousUrl = segmentUrl; nextOffset = range ? range.end + 1 : undefined;
        }
      }
      if (!entries.length || entries.length > MAX_ENTRIES || duration <= 0 || duration > 14400) throw new Error("只支持四小时以内、最多 5000 分片的完整媒体");
      return { entries, duration, hls: true };
    };
    let media;
    if (source.ext === "m3u8" || /\.m3u8(?:$|[?#])/i.test(source.url) || /mpegurl/i.test(source.mimeType || "")) media = await resolve(source.url);
    else media = { entries: [{ index: 0, url: safeUrl(source.url), kind: "raw" }], duration: 0, hls: false };
    const streams = [{ stream: "media", ...media }];
    if (media.audio) streams.push({ stream: "audio", ...media.audio });
    const entryCount = streams.reduce((n, item) => n + item.entries.length, 0);
    let total = 0, sequence = 0, completed = 0;
    for (const stream of streams) for (const entry of stream.entries) {
      abort(); const response = await load(entry.url, entry.range);
      if (/text\/html|application\/json/i.test(response.headers.get("content-type") || "")) {
        await response.body.cancel(); throw new Error("站点返回登录或错误页面，而不是媒体");
      }
      const declared = Number(response.headers.get("content-length")) || 0;
      if (declared > MAX_BYTES - total) { await response.body.cancel(); throw new Error("媒体超过 2 GB"); }
      const reader = response.body.getReader(); let bytes = 0;
      let pending = new Uint8Array(PART), filled = 0;
      const flush = async () => {
        if (!filled) return;
        abort(); let raw = "";
        for (let i = 0; i < filled; i += 8192) raw += String.fromCharCode(...pending.subarray(i, Math.min(filled, i + 8192)));
        await onPart({ sequence: sequence++, stream: stream.stream, data: btoa(raw),
          ...(stream.hls ? { entry: { index: entry.index, kind: entry.kind,
            duration: entry.duration || 0, discontinuity: entry.discontinuity === true, map: entry.map ?? null } } : {}) });
        filled = 0;
      };
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.length; total += value.length;
          if (total > MAX_BYTES || (stream.hls && bytes > 128 * 1024 * 1024)) throw new Error("媒体或单个分片超过大小限制");
          for (let i = 0; i < value.length;) {
            const length = Math.min(PART - filled, value.length - i);
            pending.set(value.subarray(i, i + length), filled); filled += length; i += length;
            if (filled === PART) await flush();
          }
        }
        await flush();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!bytes || (entry.range && bytes !== entry.range.end - entry.range.start + 1)) throw new Error("媒体分片为空或不完整");
      completed++; const message = `读取媒体 ${completed}/${entryCount}（${(total / 1024 / 1024).toFixed(1)} MB）`;
      onProgress?.(purpose === "download" ? { message, percent: Math.round(completed / entryCount * 85) } : message);
    }
    return { total, sequence, duration: media.duration };
  };
})();
