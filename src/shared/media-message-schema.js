/* Runtime validation at the untrusted page/background message boundary. */
(() => {
  "use strict";
  const fail = (message) => { throw new Error(`媒体消息无效：${message}`); };
  const text = (value, max, name, required = false) => {
    if (value == null || value === "") { if (required) fail(`${name} 缺失`); return ""; }
    if (typeof value !== "string" || value.length > max) fail(name);
    return value;
  };
  const source = (value, required = false) => {
    if (value == null) { if (required) fail("mediaSource 缺失"); return undefined; }
    if (typeof value !== "object" || Array.isArray(value)) fail("mediaSource");
    const normalized = globalThis.lexihaloMediaContract.normalize(value);
    if (normalized.transport === "capture") text(normalized.captureId, 128, "captureId", true);
    else if (normalized.transport === "direct") text(normalized.url, 12000, "media URL", true);
    else if (normalized.transport === "native-page") text(normalized.pageUrl, 12000, "page URL", true);
    else fail("transport");
    if (!['audio', 'video'].includes(normalized.kind)) fail("kind");
    return normalized;
  };
  const request = (message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) fail("请求不是对象");
    const type = text(message.type, 100, "type", true);
    if (!type.startsWith("lexihalo:subtitle-ai:")) fail("type");
    const result = { ...message, type };
    result.requestId = text(message.requestId, 128, "requestId", true);
    if (message.mediaPageUrl != null) result.mediaPageUrl = text(message.mediaPageUrl, 12000, "mediaPageUrl");
    if (message.audioUrl != null) result.audioUrl = text(message.audioUrl, 12000, "audioUrl");
    if (message.browserSource != null || message.mediaSource != null) {
      result.mediaSource = source(message.mediaSource || message.browserSource, true);
      result.browserSource = result.mediaSource; // compatibility at the current wire boundary
    }
    if (message.uploadId != null) result.uploadId = text(message.uploadId, 64, "uploadId");
    if (message.browserUploadId != null) result.browserUploadId = text(message.browserUploadId, 64, "browserUploadId");
    if (message.targetRequestId != null) result.targetRequestId = text(message.targetRequestId, 128, "targetRequestId");
    if (message.sequence != null && (!Number.isInteger(message.sequence) || message.sequence < 0)) fail("sequence");
    if (message.total != null && (!Number.isSafeInteger(message.total) || message.total < 0)) fail("total");
    return result;
  };
  const segments = (value) => {
    if (!Array.isArray(value) || !value.length || value.length > 20000) fail("字幕分段");
    return value.map((item, index) => {
      const start = Number(item?.start), end = Number(item?.end), content = text(item?.text, 20000, `segment[${index}].text`, true);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) fail(`segment[${index}] 时间`);
      return { ...item, start, end, text: content };
    });
  };
  globalThis.lexihaloMediaSchema = Object.freeze({ request, source, segments });
})();
