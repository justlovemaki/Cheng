import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let confirmations = [],
  accepted = true;
const context = {
  window: {
    confirm: (text) => {
      confirmations.push(text);
      return accepted;
    },
  },
};
vm.runInNewContext(
  fs.readFileSync(
    new URL("../src/video/media-workflow.js", import.meta.url),
    "utf8",
  ),
  context,
);
const workflow = context.lexihaloMediaWorkflow;
const tools = { "yt-dlp": true, ffmpeg: true, ffprobe: true };
context.lexihaloGetHelperStatus = async () => ({ installed: false });
await assert.rejects(
  workflow.confirmPageParsing("transcribe"),
  (error) => error.helperUnavailable && /未检测/.test(error.message),
);
assert.equal(
  confirmations.length,
  0,
  "Do not ask for consent as if an absent helper were installed",
);
context.lexihaloGetHelperStatus = async () => ({
  installed: true,
  tools: { ffmpeg: true, ffprobe: true },
  ready: false,
});
await workflow.requireHelper({ browser: true });
await assert.rejects(
  workflow.confirmPageParsing("download"),
  (error) => error.helperUnavailable && /yt-dlp/.test(error.message),
);
assert.equal(confirmations.length, 0);
context.lexihaloGetHelperStatus = async () => {
  throw Error("Native Messaging unavailable");
};
await assert.rejects(
  workflow.requireHelper(),
  (error) => error.helperUnavailable,
);
context.lexihaloGetHelperStatus = async () => ({
  installed: true,
  ready: true,
  tools,
});
assert.equal(
  await workflow.confirmPageParsing(
    "transcribe",
    "当前播放器未提供可读取的媒体资源",
  ),
  true,
);
assert.match(confirmations[0], /当前播放器未提供/);
assert.match(confirmations[0], /BYOK/);
assert.match(confirmations[0], /不导出浏览器 Cookie/);
assert.match(confirmations[0], /并非本地 AI 识别/);
accepted = false;
assert.equal(await workflow.confirmPageParsing("download"), false);
assert.match(confirmations[1], /不调用 AI/);
for (const message of [
  "当前播放器未提供可读取的媒体资源",
  "音频文件超过 24 MB",
  "Failed to fetch",
  "CORS",
  "获取视频音频失败",
]) {
  assert.equal(workflow.canOfferFallback(new Error(message)), true, message);
}
for (const message of [
  "不支持 DRM 视频",
  "加密媒体源",
  "已取消下载",
  "BYOK 配置错误",
  "API Key 无效",
  "请先登录",
  "没有播放权限",
  "识别接口失败",
  "识别模型不支持",
  "视频已切换",
]) {
  assert.equal(workflow.canOfferFallback(new Error(message)), false, message);
}
assert.equal(
  workflow.canOfferFallback(
    Object.assign(new Error("媒体源不可读"), { helperUnavailable: true }),
  ),
  false,
);
context.lexihaloSiteAdapters = { currentItem: () => ({ requiresTrackPage: true }) };
const consentCount = confirmations.length;
context.lexihaloGetHelperStatus = async () => { throw Error('Album parsing must be blocked before checking the helper'); };
await assert.rejects(workflow.confirmPageParsing('download'), /独立页面/);
assert.equal(confirmations.length, consentCount);
console.log(
  "Browser-first media workflow, helper readiness and explicit consent tests passed",
);
