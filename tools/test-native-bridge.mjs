import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const messages = [];
const uploads = [];
const progressMessages = [];
let downloadStatusCalls = 0;
let importedPurpose = 'transcribe';
const storage = {
  trancy_byok_engines: [{ _id: 'engine', provider: 'OpenAI', providerId: 'OpenAI',
    model: 'gpt-test', transcriptionModel: 'whisper-1', key: 'test-secret',
    transcriptionEndpoint: 'https://asr.example/v1/audio/transcriptions' }],
};
let listener;
const chrome = {
  storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]])); },
    async set(value) { Object.assign(storage, value); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
  } },
  runtime: {
    id: 'a'.repeat(32),
    onConnect: { addListener(fn) { listener = fn; } },
    onMessage: { addListener() {} },
    sendNativeMessage(_host, message, callback) {
      messages.push(message);
      if (message.action === 'beginUpload') importedPurpose = message.purpose || 'transcribe';
      const result = message.action === 'ping' ? { ok: true, version: 10, browserAudio: true }
        : message.action === 'beginUpload' ? { ok: true, jobId: 'c'.repeat(32) }
        : message.action === 'uploadPart' ? { ok: true, bytes: 16, sequence: message.sequence + 1 }
        : message.action === 'start' ? { ok: true, jobId: 'a'.repeat(32) }
        : message.action === 'startDownload' ? { ok: true, jobId: 'b'.repeat(32) }
        : message.action === 'formats' ? { ok: true, title: 'Example', duration: 100,
          formats: [{ formatId: '137', label: '1080p · MP4', width: 1920, height: 1080,
            fps: 30, ext: 'mp4', vcodec: 'avc1', hasAudio: false, filesize: 1234 }] }
        : message.action === 'status' && message.jobId === 'b'.repeat(32)
          ? downloadStatusCalls++ === 0
            ? { ok: true, state: 'preparing', stage: '正在下载 1080p · 43%',
                percent: 42.5, speed: '3.2MiB/s', eta: '00:12' }
            : { ok: true, state: 'ready', filename: 'Example.mp4', directory: '/Downloads/LexiHalo',
                format: { formatId: '137' } }
        : message.action === 'status' && message.jobId === 'c'.repeat(32) && importedPurpose === 'download'
          ? { ok: true, state: 'ready', filename: 'browser-resource.mkv' }
        : message.action === 'status' ? { ok: true, state: 'ready', count: 2, sizes: [64, 64], duration: 100 }
        : message.action === 'chunkPart' ? { ok: true,
          audio: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60)]).toString('base64'),
          offset: message.index * 50, total: 64, done: true }
        : { ok: true };
      callback(result);
    },
  },
};
const fetch = async (_url, init) => {
  uploads.push(init);
  return { ok: true, json: async () => ({ language: 'en', duration: 50,
    segments: [{ start: 1, end: 2, text: 'recognized audio' }] }) };
};
const context = { chrome, crypto: webcrypto, TextEncoder, Uint8Array, Blob, FormData, URL, atob, AbortController,
  navigator: { language: 'en' }, fetch, performance, console: { info() {}, warn() {} }, setTimeout, clearTimeout };
const platforms = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8'));
const catalog = platforms.filter(entry => entry.mode === 'browser');
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/platform-capabilities.js', import.meta.url), 'utf8')
  .replace('const PLATFORM_CATALOG = [];', `const PLATFORM_CATALOG = ${JSON.stringify(platforms)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-message-schema.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/background/media-task-manager.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/background/subtitle-ai.js', import.meta.url), 'utf8'), context);
const request = (payload, senderUrl = 'https://www.youtube.com/watch?v=abcdefghijk', senderOverrides = {}) => new Promise((resolve, reject) => {
  const port = {
    name: 'lexihalo-subtitle-ai', sender: { id: chrome.runtime.id, url: senderUrl, tab: { id: 1 }, ...senderOverrides },
    onMessage: { addListener(fn) { this.receive = fn; } },
    postMessage(data) {
      if (data.progress) progressMessages.push(data.progress);
      if (data.response) data.response.ok ? resolve(data.response.data) : reject(new Error(data.response.error));
    },
  };
  listener(port);
  port.onMessage.receive(payload);
});
const base = { requestId: 'request-1', type: 'lexihalo:subtitle-ai:transcribe', userInitiated: true, useNativeHelper: true,
  audioUrl: 'https://www.youtube.com/watch?v=abcdefghijk', mediaPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  engineId: 'engine', videoId: 'abcdefghijk', duration: 100 };
const result = await request(base);
assert.equal(result.segments.length, 2);
assert.equal(result.segments[0].start, 1000);
assert.equal(result.segments[1].start, 51000);
assert.equal(uploads.length, 2);
assert.equal(uploads[0].headers.Authorization, 'Bearer test-secret');
assert.equal(uploads[0].body.get('file').type, 'audio/wav');
assert.equal(uploads[0].body.get('file').name, 'part-0.wav');
assert.equal(messages[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');
assert.equal(messages.at(-1).action, 'finish');
assert(!JSON.stringify(messages).includes('test-secret'), 'Native host must never receive the API key');
const nativeCalls = messages.length;
await assert.rejects(request({ ...base, requestId: 'request-2', videoId: 'other-video',
  audioUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv', mediaPageUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv' }),
  /无法确认当前视频页面/);
assert.equal(messages.length, nativeCalls, 'A mismatched page must not reach the native host');
await assert.rejects(request({ ...base, requestId: 'request-3', videoId: 'BV1abcdefghi',
  audioUrl: 'https://www.bilibili.com/video/BV1abcdefghi?p=3',
  mediaPageUrl: 'https://www.bilibili.com/video/BV1abcdefghi?p=3' },
  'https://www.bilibili.com/video/BV1abcdefghi?p=2'), /无法确认当前视频页面/);
assert.equal(messages.length, nativeCalls, 'Different Bilibili parts must not share a native task');
const formatResult = await request({ requestId: 'format-request',
  type: 'lexihalo:subtitle-ai:video-formats', userInitiated: true,
  mediaPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk' });
assert.equal(formatResult.formats[0].height, 1080);
assert.equal(messages.at(-1).action, 'formats');
const genericFormats = await request({ requestId: 'generic-format-request',
  type: 'lexihalo:subtitle-ai:video-formats', userInitiated: true,
  mediaPageUrl: 'https://media.example.com/watch/lesson?episode=2' },
  'https://media.example.com/watch/lesson?episode=2#player');
assert.equal(genericFormats.formats[0].height, 1080);
const callsBeforeGenericMismatch = messages.length;
await assert.rejects(request({ requestId: 'generic-format-mismatch',
  type: 'lexihalo:subtitle-ai:video-formats', userInitiated: true,
  mediaPageUrl: 'https://media.example.com/watch/other' },
  'https://media.example.com/watch/lesson'), /无法确认当前视频页面/);
assert.equal(messages.length, callsBeforeGenericMismatch);
const downloadResult = await request({ requestId: 'download-request',
  type: 'lexihalo:subtitle-ai:video-download', userInitiated: true,
  mediaPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk', formatId: '137', resolution: 1080 });
assert.equal(downloadResult.filename, 'Example.mp4');
assert(messages.some(message => message.action === 'startDownload' && message.formatId === '137' && message.resolution === 1080));
assert(progressMessages.some(progress => progress.percent === 42.5 && progress.eta === '00:12'));
const callsBeforeUntrustedDownload = messages.length;
await assert.rejects(request({ requestId: 'untrusted-download',
  type: 'lexihalo:subtitle-ai:video-download', userInitiated: false,
  mediaPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk', formatId: '137', resolution: 1080 }), /用户点击/);
assert.equal(messages.length, callsBeforeUntrustedDownload);
const phPage = 'https://cn.pornhub.com/view_video.php?viewkey=ph123abc';
const browserUpload = await request({ requestId: 'browser-begin',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'begin',
  userInitiated: true, mediaPageUrl: phPage }, phPage);
await assert.rejects(request({ requestId: 'browser-other',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'part',
  uploadId: browserUpload.uploadId, sequence: 0, data: 'YWJj' },
  'https://cn.pornhub.com/view_video.php?viewkey=phOther'), /不属于当前页面/);
await request({ requestId: 'browser-part', type: 'lexihalo:subtitle-ai:browser-audio',
  operation: 'part', uploadId: browserUpload.uploadId, sequence: 0, data: 'YWJj' }, phPage);
await request({ requestId: 'browser-seal', type: 'lexihalo:subtitle-ai:browser-audio',
  operation: 'seal', uploadId: browserUpload.uploadId, sequence: 1, total: 16 }, phPage);
const startsBeforeImport = messages.filter(m => m.action === 'start').length;
const imported = await request({ ...base, requestId: 'browser-transcribe',
  audioUrl: phPage, mediaPageUrl: phPage, videoId: 'browser-audio-test',
  browserUploadId: browserUpload.uploadId, userInitiated: false }, phPage);
assert.equal(imported.segments.length, 2);
assert.equal(messages.filter(m => m.action === 'start').length, startsBeforeImport,
  'Imported media must not invoke yt-dlp again');
assert(!storage[`lexihalo_media_upload:${browserUpload.uploadId}`]);
const priorEngines = storage.trancy_byok_engines;
storage.trancy_byok_engines = [];
const douyinPage = 'https://www.douyin.com/video/123456789';
const resourceUpload = await request({ requestId: 'resource-begin',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'begin', purpose: 'download',
  userInitiated: true, mediaPageUrl: douyinPage, title: 'Resource', ext: 'mp4' }, douyinPage);
await request({ requestId: 'resource-seal', type: 'lexihalo:subtitle-ai:browser-audio',
  operation: 'seal', uploadId: resourceUpload.uploadId, sequence: 1, total: 16 }, douyinPage);
const importedDownload = await request({ requestId: 'resource-download',
  type: 'lexihalo:subtitle-ai:video-download', userInitiated: true,
  mediaPageUrl: douyinPage, formatId: 'browser0', resolution: 720,
  browserUploadId: resourceUpload.uploadId }, douyinPage);
assert.equal(importedDownload.filename, 'browser-resource.mkv');
assert(!storage[`lexihalo_media_upload:${resourceUpload.uploadId}`]);
storage.trancy_byok_engines = priorEngines;
const callsBeforeCacheMiss = messages.length;
const miss = await request({ ...base, requestId: 'preflight-cache-miss', videoId: 'not-cached', checkCacheOnly: true });
assert.equal(miss, null);
assert.equal(messages.length, callsBeforeCacheMiss, 'Cache-only request must not reach the native helper');
const wrapper = 'https://hsck123.com/downvideo/videoTest.html';
const genericUpload = await request({ requestId: 'generic-browser-begin',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'begin', purpose: 'transcribe',
  userInitiated: true, mediaPageUrl: wrapper }, wrapper);
const beginMessage = messages.at(-1);
assert.equal(beginMessage.action, 'beginUpload');
assert.equal(beginMessage.siteId, 'generic');
assert(!beginMessage.url, 'The native helper receives bytes, not the HTML wrapper URL');
await request({ requestId: 'generic-browser-abort', type: 'lexihalo:subtitle-ai:browser-audio',
  operation: 'abort', uploadId: genericUpload.uploadId }, wrapper);
const staleUpload = await request({ requestId: 'stale-browser-begin',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'begin', purpose: 'transcribe',
  userInitiated: true, mediaPageUrl: wrapper, mediaResourceId: 'capture-old' }, wrapper,
  { documentId: 'document-old' });
await assert.rejects(request({ requestId: 'stale-browser-part',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'part', uploadId: staleUpload.uploadId,
  sequence: 0, data: 'YWJj' }, wrapper, { documentId: 'document-new' }), /不属于当前页面/);
const cancelsBeforeRefresh = messages.filter(message => message.action === 'cancel').length;
const replacementUpload = await request({ requestId: 'replacement-browser-begin',
  type: 'lexihalo:subtitle-ai:browser-audio', operation: 'begin', purpose: 'transcribe',
  userInitiated: true, mediaPageUrl: wrapper, mediaResourceId: 'capture-new' }, wrapper,
  { documentId: 'document-new' });
assert.equal(messages.filter(message => message.action === 'cancel').length, cancelsBeforeRefresh + 1,
  'A new document must cancel its stale tab/frame upload instead of being blocked');
await request({ requestId: 'replacement-browser-abort', type: 'lexihalo:subtitle-ai:browser-audio',
  operation: 'abort', uploadId: replacementUpload.uploadId }, wrapper, { documentId: 'document-new' });
const oldPage = 'https://www.youtube.com/watch?v=abcdefghijk';
const currentPage = 'https://www.youtube.com/watch?v=lmnopqrstuv';
const liveFormats = await request({ requestId: 'live-spa-formats', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: currentPage, documentUrl: currentPage }, oldPage);
assert.equal(liveFormats.formats[0].height, 1080);
assert.equal(messages.at(-1).url, currentPage);
const callsBeforeRejectedOrigin = messages.length;
await assert.rejects(request({ requestId: 'cross-origin-document', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: 'https://vimeo.com/12345678', documentUrl: 'https://vimeo.com/12345678' }, oldPage), /页面来源已改变/);
await assert.rejects(request({ requestId: 'wrong-spa-item', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: oldPage, documentUrl: currentPage }, oldPage), /页面或视频已切换/);
await assert.rejects(request({ requestId: 'other-extension', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: currentPage, documentUrl: currentPage }, oldPage,
  { id: 'b'.repeat(32) }), /其他扩展/);
assert.equal(messages.length, callsBeforeRejectedOrigin);
const shortFormats = await request({ requestId: 'youtube-short-alias', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: oldPage }, 'https://youtu.be/abcdefghijk');
assert.equal(shortFormats.formats[0].height, 1080);
const groupedVimeo = await request({ requestId: 'vimeo-group-alias', type: 'lexihalo:subtitle-ai:video-formats',
  userInitiated: true, mediaPageUrl: 'https://vimeo.com/87654321' },
  'https://vimeo.com/groups/12345678/videos/87654321');
assert.equal(groupedVimeo.formats[0].height, 1080);
console.log('Native bridge tests passed');
