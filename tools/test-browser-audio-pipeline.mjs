import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const requests = [];
let returnCached = false;
let holdCapturedTransfer = false;
let heldCapturedRequest = null;
const listeners = new Map();
const providerEvents = new Map();
const provider = {
  event: { on: (name, callback) => providerEvents.set(name, callback) },
  id: 'ph:test', platform: 'html5', lines: [],
  load: async () => {}, dispatchTranslate() {}, backfillBaseline() {}, drivePretranslate() {},
};
const window = {
  captionProvider: provider, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  postMessage(message) {
    if (message.eventName !== 'lexihalo:subtitle-ai-request') return;
    requests.push(message);
    if (holdCapturedTransfer && message.type.endsWith(':captured-transfer')) {
      heldCapturedRequest = message;
      return;
    }
    const data = message.type.endsWith(':browser-audio') && message.payload.operation === 'begin'
      ? { uploadId: 'c'.repeat(32) }
      : message.type.endsWith(':transcribe')
        ? { cached: returnCached && message.payload.checkCacheOnly, language: 'en', segments: [{ start: 0, end: 1000, text: 'recognized' }] }
        : { ok: true };
    queueMicrotask(() => {
      for (const fn of listeners.get('message') || []) fn({ source: window, data: {
        eventName: 'lexihalo:subtitle-ai-response', requestId: message.requestId,
        response: { ok: true, data },
      } });
      if (message.type.endsWith(':browser-audio') && message.payload.operation === 'abort' && heldCapturedRequest) {
        const held = heldCapturedRequest;
        heldCapturedRequest = null;
        for (const fn of listeners.get('message') || []) fn({ source: window, data: {
          eventName: 'lexihalo:subtitle-ai-response', requestId: held.requestId,
          response: { ok: false, error: '已取消捕获资源读取' },
        } });
      }
    });
  },
};
const context = { window, crypto: webcrypto, AbortController, Map, setTimeout,
  lexihaloReadBrowserMedia: async ({ sendPart }) => {
    await sendPart({ sequence: 0, data: 'YWJj' });
    await sendPart({ sequence: 1, data: 'ZGVm' });
    return { sequence: 2, total: 6, duration: 1 };
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/video/media-task-registry.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/video/caption-scheduler.js', import.meta.url), 'utf8'), context);
const payload = { requestId: 'test-browser-pipeline', useNativeHelper: true, useBrowserAudio: true,
  mediaPageUrl: 'https://cn.pornhub.com/view_video.php?viewkey=ph123abc' };
const result = await context.lexihaloTranscribeAudio(payload);
assert.equal(result.segments[0].text, 'recognized');
assert.deepEqual(requests.map(r => r.payload.operation || r.type.split(':').at(-1)),
  ['transcribe', 'begin', 'part', 'part', 'seal', 'transcribe', 'abort']);
assert.equal(requests.find(r => r.type.endsWith(':transcribe') && !r.payload.checkCacheOnly).payload.browserUploadId, 'c'.repeat(32));
requests.length = 0;
context.lexihaloReadBrowserMedia = async () => { throw new Error('fragment HTTP 410'); };
await assert.rejects(context.lexihaloTranscribeAudio(payload), /HTTP 410/);
assert(!requests.some(r => r.type.endsWith(':transcribe') && !r.payload.checkCacheOnly));
assert.equal(requests.at(-1).payload.operation, 'abort');
requests.length = 0;
returnCached = true;
assert.equal((await context.lexihaloTranscribeAudio(payload)).cached, true);
assert.equal(requests.length, 1, 'Cache hit must avoid fetching/uploading media');
assert.equal(requests[0].payload.checkCacheOnly, true);
requests.length = 0;
returnCached = false;
holdCapturedTransfer = true;
const downloadRequestId = 'captured-download-cancel';
const capturedDownload = context.lexihaloDownloadVideo({
  requestId: downloadRequestId,
  mediaPageUrl: 'https://media.example.com/watch/item',
  browserSource: { captureId: 'opaque-capture', ext: 'm3u8' },
});
for (let attempt = 0; attempt < 20 && !heldCapturedRequest; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
assert(heldCapturedRequest, 'Captured transfer did not start');
assert.equal(context.lexihaloMediaTasks.get(downloadRequestId)?.state, 'transferring');
const cancellation = await context.lexihaloCancelVideoDownload(downloadRequestId);
assert.equal(cancellation.cancelled, true);
await assert.rejects(capturedDownload, /已取消/);
assert.equal(context.lexihaloMediaTasks.get(downloadRequestId), null);
assert(requests.some(request => request.type.endsWith(':browser-audio') &&
  request.payload.operation === 'abort' && request.payload.uploadId === 'c'.repeat(32)),
  'Cancel must abort the browser upload while captured transfer is still running');
assert(requests.some(request => request.type.endsWith(':cancel-video-download')),
  'Cancel must also cover the post-transfer native download stage');
requests.length = 0;
const switchedAsr = context.lexihaloTranscribeAudio({ ...payload, requestId: 'album-track-switch',
  browserSource: { captureId: 'selected-album-track', ext: 'mp3' } });
for (let attempt = 0; attempt < 20 && !heldCapturedRequest; attempt++) await new Promise(resolve => setTimeout(resolve, 0));
assert(heldCapturedRequest);
providerEvents.get('video.change')();
await assert.rejects(switchedAsr, /已取消/);
assert(!requests.some(request => request.type.endsWith(':transcribe') && !request.payload.checkCacheOnly),
  'Changing the selected album track must cancel transfer before ASR upload');
assert(requests.some(request => request.type.endsWith(':cancel-transcription')));
console.log('Browser audio pipeline tests passed');
