(() => {
  "use strict";

  const active = new Map();
  const errorText = (text, statusText) => {
    try {
      const payload = JSON.parse(text);
      return String(payload?.error?.message || payload?.message || text || statusText).slice(0, 800);
    } catch {
      return String(text || statusText).slice(0, 800);
    }
  };

  const run = async (message) => {
    const controller = new AbortController();
    active.set(message.requestId, controller);
    const keepAlive = setInterval(() => {
      chrome.runtime.sendMessage({
        type: "lexihalo:asr-offscreen:keepalive",
        requestId: message.requestId,
      }).catch(() => {});
    }, 15000);
    try {
      const cache = await caches.open(message.cacheName);
      const response = await cache.match(message.cacheUrl);
      if (!response) throw new Error("ASR 临时音频不存在");
      const audio = await response.blob();
      if (!audio.size || audio.size > 32 * 1024 * 1024)
        throw new Error("ASR 临时音频大小无效");
      const form = new FormData();
      form.append("file", audio, message.filename);
      form.append("model", message.model);
      if (message.language) form.append("language", message.language);
      form.append("prompt", message.prompt);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      form.append("temperature", "0");
      const result = await fetch(message.endpoint, {
        method: "POST",
        headers: message.headers,
        body: form,
        credentials: message.credentials,
        signal: controller.signal,
      });
      if (!result.ok) {
        const text = await result.text().catch(() => "");
        throw new Error(`OpenAI 音频识别失败（HTTP ${result.status}）：${errorText(text, result.statusText)}`);
      }
      return { ok: true, payload: await result.json() };
    } catch (error) {
      return {
        ok: false,
        error: controller.signal.aborted
          ? "已取消音频识别"
          : error?.message || String(error),
      };
    } finally {
      clearInterval(keepAlive);
      active.delete(message.requestId);
      const cache = await caches.open(message.cacheName).catch(() => null);
      await cache?.delete(message.cacheUrl).catch(() => {});
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "lexihalo-asr-offscreen") return;
    if (message.action === "abort") {
      active.get(message.requestId)?.abort();
      sendResponse({ ok: true });
      return;
    }
    if (message.action === "transcribe") {
      run(message).then(sendResponse);
      return true;
    }
  });
})();
