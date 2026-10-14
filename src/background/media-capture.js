/* Passive network detection inspired by Open Media Downloader. Independent
 * implementation: frame-bound opaque IDs, bounded reads, no cookie/key export. */
(() => {
  "use strict";
  const candidates = new Map(), frames = new Map(), requestHeaders = new Map();
  const TTL = 10 * 60 * 1000;
  const publicUrl = (value, base) => {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port === "0" ||
        !globalThis.lexihaloSites.publicHost(url.hostname) || url.href.length > 8192) throw new Error("媒体地址不是允许的公网 HTTPS 地址");
    url.hash = ""; return url.href;
  };
  const headersOf = (list) => {
    const result = {};
    for (const { name, value } of list || []) {
      const lower = String(name).toLowerCase();
      if (value && ['referer', 'origin', 'user-agent', 'authorization', 'accept', 'accept-language'].includes(lower)) result[lower] = String(value).slice(0, 8192);
    }
    return result;
  };
  const header = (list, name) => list?.find(h => h.name?.toLowerCase() === name)?.value || "";
  const classify = (details) => {
    let url; try { url = new URL(publicUrl(details.url)); } catch { return null; }
    if (/\.(ts|m4s|m2ts|vtt|srt|key)$/i.test(url.pathname)) return null;
    const mimeType = header(details.responseHeaders, 'content-type').split(';')[0].toLowerCase();
    if (mimeType === 'video/mp2t') return null;
    const ext = /mpegurl/.test(mimeType) || /\.m3u8$/i.test(url.pathname) ? 'm3u8'
      : /dash\+xml/.test(mimeType) || /\.mpd$/i.test(url.pathname) ? 'mpd'
      : /^(audio|video)\//.test(mimeType) || /\.(mp4|m4a|webm|mp3|aac|ogg|wav|flac)$/i.test(url.pathname)
        ? url.pathname.match(/\.(mp4|m4a|webm|mp3|aac|ogg|wav|flac)$/i)?.[1]?.toLowerCase() || (mimeType.startsWith('audio/') ? 'm4a' : 'mp4') : '';
    if (!ext) return null;
    const total = Number(header(details.responseHeaders, 'content-range').match(/\/(\d+)$/)?.[1] || header(details.responseHeaders, 'content-length')) || 0;
    return { url: url.href, ext, mimeType, size: total, isAudio: mimeType.startsWith('audio/') };
  };
  const frameKey = (tab, frame) => `${tab}:${frame}`;
  const prune = () => {
    const now = Date.now();
    for (const [id, item] of candidates) if (now - item.at > TTL) candidates.delete(id);
    for (const [id, item] of requestHeaders) if (now - item.at > 60000) requestHeaders.delete(id);
    for (const [id, item] of frames) if (now - item.at > 2 * 60 * 60 * 1000) frames.delete(id);
    while (candidates.size > 400) candidates.delete(candidates.keys().next().value);
    while (requestHeaders.size > 2000) requestHeaders.delete(requestHeaders.keys().next().value);
  };
  const navigate = (details) => {
    if (details.tabId < 0 || !['main_frame', 'sub_frame'].includes(details.type)) return;
    const key = frameKey(details.tabId, details.frameId);
    frames.set(key, { url: details.url, parent: details.parentFrameId ?? -1, at: Date.now(), documentId: details.documentId });
    for (const [id, item] of candidates) if (item.tabId === details.tabId && (details.frameId === 0 || item.frameId === details.frameId)) candidates.delete(id);
  };
  const capture = (details) => {
    const sent = requestHeaders.get(details.requestId); requestHeaders.delete(details.requestId);
    if (details.tabId < 0 || details.statusCode < 200 || details.statusCode > 299) return;
    const media = classify(details); if (!media) return;
    prune();
    const key = frameKey(details.tabId, details.frameId), frame = frames.get(key);
    const existing = [...candidates.values()].find(item => item.tabId === details.tabId && item.frameId === details.frameId && item.url === media.url);
    const id = existing?.id || crypto.randomUUID();
    candidates.set(id, { ...media, id, tabId: details.tabId, frameId: details.frameId,
      parentFrameId: details.parentFrameId ?? frame?.parent ?? -1,
      documentId: details.documentId || frame?.documentId,
      frameUrl: details.documentUrl || frame?.url || '', headers: sent?.headers || existing?.headers || {}, at: Date.now() });
  };
  if (chrome.webRequest?.onResponseStarted) {
    const filter = { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'media', 'other'] };
    chrome.webRequest.onBeforeRequest.addListener(navigate, filter);
    const sent = details => { if (details.tabId < 0) return; prune(); requestHeaders.set(details.requestId, { at: Date.now(), headers: headersOf(details.requestHeaders) }); };
    for (const [event, fn, fields] of [
      [chrome.webRequest.onSendHeaders, sent, ['requestHeaders']],
      [chrome.webRequest.onResponseStarted, capture, ['responseHeaders']],
    ]) {
      try { event.addListener(fn, filter, [...fields, 'extraHeaders']); }
      catch { event.addListener(fn, filter, fields); }
    }
    chrome.tabs?.onRemoved?.addListener(tab => {
      for (const [id, item] of candidates) if (item.tabId === tab) candidates.delete(id);
      for (const key of frames.keys()) if (key.startsWith(`${tab}:`)) frames.delete(key);
    });
  }
  const belongs = (item, sender) => {
    if (item.tabId !== sender?.tab?.id) return false;
    const ownFrame = sender.frameId ?? 0;
    if (item.frameId === ownFrame) {
      if (item.documentId && sender.documentId) return item.documentId === sender.documentId;
      try { return new URL(item.frameUrl).origin === new URL(sender.url).origin; } catch { return false; }
    }
    // A root player may be a cross-origin iframe. Never borrow another tab's
    // request or a sibling iframe's request; roots may see their descendants.
    if (ownFrame !== 0) return false;
    const root = frames.get(frameKey(item.tabId, 0));
    if (!root || globalThis.lexihaloSites.nativePage(root.url)?.identity !== globalThis.lexihaloSites.nativePage(sender.url)?.identity) return false;
    let parent = item.parentFrameId;
    for (let depth = 0; depth < 8 && parent >= 0; depth++) {
      if (parent === 0) return true;
      parent = frames.get(frameKey(item.tabId, parent))?.parent ?? -1;
    }
    return false;
  };
  const list = (sender) => {
    prune();
    return { sources: [...candidates.values()].filter(item => belongs(item, sender))
      .sort((a, b) => b.at - a.at).slice(0, 16).map(item => globalThis.lexihaloMediaContract.normalize({
        transport: 'capture', captureId: item.id, ext: item.ext,
        mimeType: item.mimeType, size: item.size, isAudio: item.isAudio, resolution: 0,
        frameId: item.frameId, label: item.ext === 'm3u8' ? '捕获的 HLS 资源' : '捕获的媒体资源',
      })) };
  };
  let nextRuleId = 810000000;
  let headerLease = Promise.resolve();
  const fetchCaptured = async (url, item, signal, range) => {
    const target = publicUrl(url);
    let release;
    const previous = headerLease;
    headerLease = new Promise(resolve => { release = resolve; });
    await previous;
    const rules = [], replay = {};
    for (const [name, value] of Object.entries(item.headers)) {
      if (['referer', 'origin', 'user-agent'].includes(name)) rules.push({ header: name, operation: 'set', value });
      else if (name !== 'authorization' || new URL(target).origin === new URL(item.url).origin) replay[name] = value;
    }
    if (range) replay.Range = `bytes=${range.start}-${range.end}`;
    const ruleId = nextRuleId++;
    try {
    if (rules.length) {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id: ruleId, priority: 2,
        action: { type: 'modifyHeaders', requestHeaders: rules },
        condition: { regexFilter: '^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] } }] });
    }
      const response = await fetch(target, { method: 'GET', credentials: 'include', redirect: 'manual', headers: replay,
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)].filter(Boolean)) });
      if (response.status >= 300 && response.status < 400) {
        const redirect = publicUrl(response.headers.get('location'), target);
        return { redirect };
      }
      return response;
    } finally {
      if (rules.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {});
      release();
    }
  };
  const read = async ({ captureId, sender, signal, purpose, onPart, onProgress, resolution }) => {
    prune(); const item = candidates.get(captureId);
    if (!item || !belongs(item, sender)) throw new Error('捕获资源已过期或不属于当前播放器，请刷新并播放几秒后重试');
    if (item.ext === 'mpd') throw new Error('捕获到 DASH 清单；当前导入流程暂不合并 MPD');
    const fetchResource = async (url, sig, range) => {
      let target = publicUrl(url);
      for (let depth = 0; depth < 4; depth++) {
        const response = await fetchCaptured(target, item, sig, range);
        if (response.redirect) { target = response.redirect; continue; }
        return response;
      }
      throw new Error('媒体重定向次数过多');
    };
    return globalThis.lexihaloMediaReader({ source: { url: item.url, ext: item.ext, mimeType: item.mimeType },
      purpose, fetchResource, safeUrl: publicUrl, signal, onPart, onProgress, resolution });
  };
  globalThis.lexihaloMediaCapture = { list, read };
})();
