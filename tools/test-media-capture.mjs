import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const listeners = {}, activeRules = new Map(), fetches = [];
const event = name => ({ addListener(fn) { listeners[name] = fn; } });
const chrome = { runtime: { id: 'a'.repeat(32) }, tabs: { onRemoved: event('removed') },
  webRequest: { onBeforeRequest: event('navigate'), onSendHeaders: event('headers'), onResponseStarted: event('response') },
  declarativeNetRequest: { async updateSessionRules({ addRules = [], removeRuleIds = [] }) {
    for (const rule of addRules) activeRules.set(rule.id, rule);
    for (const id of removeRuleIds) activeRules.delete(id);
  } },
};
const manifestUrl = 'https://208.69.102.250:21302/index.m3u8';
const segmentUrl = 'https://208.69.102.249:11302/part.ts';
const catalog = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8')).filter(entry => entry.mode === 'browser');
const context = { chrome, crypto: webcrypto, URL, Uint8Array, TextDecoder, Blob, atob, btoa, AbortSignal,
  fetch: async (url, options) => {
    fetches.push(url);
    assert.equal(options.credentials, 'include');
    assert.equal(activeRules.size, 1);
    if (url === segmentUrl) assert(!options.headers.authorization, 'Do not replay bearer tokens across CDN origins');
    return url === manifestUrl
      ? new Response(`#EXTM3U\n#EXTINF:1,\n${segmentUrl}\n#EXT-X-DISCONTINUITY\n#EXTINF:1,\n${segmentUrl}\n#EXT-X-ENDLIST`)
      : new Response(new Uint8Array([1, 2, 3]));
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8').replace(
  'const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-reader.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/background/media-capture.js', import.meta.url), 'utf8'), context);
const page = 'https://www.kkys02.com/play/378202-41-5592182.html';
listeners.navigate({ tabId: 1, frameId: 0, type: 'main_frame', url: page });
listeners.headers({ tabId: 1, requestId: 'request', requestHeaders: [
  { name: 'Referer', value: page }, { name: 'Origin', value: 'https://www.kkys02.com' },
  { name: 'Authorization', value: 'Bearer private' }, { name: 'Cookie', value: 'private-cookie' },
] });
listeners.response({ tabId: 1, frameId: 0, documentId: 'doc1', requestId: 'request', url: manifestUrl,
  statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/vnd.apple.mpegurl' }] });
const sender = { tab: { id: 1 }, frameId: 0, documentId: 'doc1', url: page };
const sources = context.lexihaloMediaCapture.list(sender).sources;
assert.equal(sources.length, 1);
assert(sources[0].captureId);
assert.equal(sources[0].transport, 'capture');
assert.equal(sources[0].kind, 'video');
assert(!JSON.stringify(sources).includes('private'));
assert(!JSON.stringify(sources).includes(manifestUrl));
assert.equal(context.lexihaloMediaCapture.list({ ...sender, tab: { id: 2 } }).sources.length, 0);
assert.equal(context.lexihaloMediaCapture.list({ ...sender, documentId: 'doc2' }).sources.length, 0);
const parts = [];
const result = await context.lexihaloMediaCapture.read({ captureId: sources[0].captureId, sender,
  signal: new AbortController().signal, purpose: 'download', onPart: async part => parts.push(part) });
assert.equal(result.total, 6);
assert.equal(parts[1].entry.discontinuity, true);
assert.equal(activeRules.size, 0);
assert.deepEqual(fetches, [manifestUrl, segmentUrl, segmentUrl]);
listeners.navigate({ tabId: 1, frameId: 0, type: 'main_frame', url: 'https://www.4kcz.com/v_play/fixture.html' });
listeners.navigate({ tabId: 1, frameId: 3, parentFrameId: 0, type: 'sub_frame', url: 'https://plaa.py1080p.com:8181/player/py.php' });
listeners.response({ tabId: 1, frameId: 3, parentFrameId: 0, documentId: 'childdoc', requestId: 'child',
  url: 'https://m3hlsm3.py1080p.com:907/master.m3u8', statusCode: 200,
  responseHeaders: [{ name: 'content-type', value: 'application/x-mpegURL' }] });
assert.equal(context.lexihaloMediaCapture.list({ ...sender, url: 'https://www.4kcz.com/v_play/fixture.html' }).sources.length, 1);
assert.equal(context.lexihaloMediaCapture.list({ ...sender, frameId: 4, url: 'https://unrelated.example.com/' }).sources.length, 0);
listeners.removed(1);
assert.equal(context.lexihaloMediaCapture.list(sender).sources.length, 0);
console.log('Network capture, public IP/port, frame binding, header replay and discontinuity tests passed');
