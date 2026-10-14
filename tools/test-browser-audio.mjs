import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/video/browser-audio.js', import.meta.url), 'utf8');
const root = 'https://hv-h.phncdn.com/test/';
const responses = new Map([
  [root + 'master.m3u8', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500\nsmall.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlarge.m3u8'],
  [root + 'small.m3u8', '#EXTM3U\n#EXTINF:2,\na.ts\n#EXTINF:3,\nb.ts\n#EXT-X-ENDLIST'],
  [root + 'a.ts', new Uint8Array([1, 2, 3])],
  [root + 'b.ts', new Uint8Array([4, 5])],
]);
const requests = [];
const context = {
  location: { hostname: 'cn.pornhub.com' },
  flashvars_123: { mediaDefinitions: [{ videoUrl: root + 'master.m3u8', quality: '240' }] },
  URL, TextDecoder, Blob, AbortSignal, Uint8Array, btoa,
  fetch: async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.credentials, 'omit');
    if (!responses.has(url)) throw new Error('unexpected URL');
    return new Response(responses.get(url));
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-reader.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(source, context);
const bytes = [];
const progress = [];
const transfer = await context.lexihaloReadBrowserAudio({
  signal: new AbortController().signal,
  sendPart: async (part) => bytes.push(Buffer.from(part.data, 'base64')),
  onProgress: (value) => progress.push(value),
});
assert.equal(transfer.total, 5);
assert.equal(transfer.sequence, 2);
assert.equal(transfer.duration, 5);
assert.deepEqual(Buffer.concat(bytes), Buffer.from([1, 2, 3, 4, 5]));
assert(!requests.some(({ url }) => url.endsWith('large.m3u8')));
assert.equal(progress.length, 2);
responses.set(root + 'small.m3u8', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:2,\na.ts\n#EXT-X-ENDLIST');
await assert.rejects(context.lexihaloReadBrowserAudio({
  signal: new AbortController().signal, sendPart: async () => {},
}), /加密/);
responses.set(root + 'small.m3u8', '#EXTM3U\n#EXTINF:2,\na.ts');
await assert.rejects(context.lexihaloReadBrowserAudio({
  signal: new AbortController().signal, sendPart: async () => {},
}), /直播/);
responses.set(root + 'small.m3u8', '#EXTM3U\n#EXTINF:2,\nhttps://127.0.0.1/private.ts\n#EXT-X-ENDLIST');
await assert.rejects(context.lexihaloReadBrowserAudio({
  signal: new AbortController().signal, sendPart: async () => {},
}), /允许/);
const cancelled = new AbortController();
cancelled.abort();
await assert.rejects(context.lexihaloReadBrowserAudio({
  signal: cancelled.signal, sendPart: async () => {},
}), /取消/);
responses.set(root + 'master.m3u8', '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=500,AUDIO="a"\nsmall.m3u8');
responses.set(root + 'small.m3u8', '#EXTM3U\n#EXTINF:2,\na.ts\n#EXTINF:3,\nb.ts\n#EXT-X-ENDLIST');
responses.set(root + 'audio.m3u8', '#EXTM3U\n#EXTINF:5,\naudio.aac\n#EXT-X-ENDLIST');
responses.set(root + 'audio.aac', new Uint8Array([6, 7]));
const streams = [];
const resource = await context.lexihaloReadBrowserAudio({
  purpose: 'download', signal: new AbortController().signal,
  sendPart: async (part) => streams.push(part.stream),
});
assert.deepEqual(streams, ['media', 'media', 'audio']);
assert.equal(resource.total, 7);
assert.equal(resource.sequence, 3);
const asrStreams = [];
const asr = await context.lexihaloReadBrowserAudio({
  purpose: 'transcribe', signal: new AbortController().signal,
  sendPart: async (part) => asrStreams.push(part.stream),
});
assert.equal(asr.total, 2, 'ASR should read only the independent audio rendition');
assert.deepEqual(asrStreams, ['media']);
console.log('Browser HLS audio/resource tests passed');
