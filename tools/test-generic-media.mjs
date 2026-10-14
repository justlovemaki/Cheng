import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8')).filter(entry => entry.mode === 'browser');
const page = 'https://hsck123.com/downvideo/videoTest.html';
const root = 'https://stream.example.com/';
const requested = [];
const context = {
  location: new URL(page), URL, TextDecoder, Uint8Array, atob, btoa, Blob, AbortSignal,
  fetch: async (url, init) => {
    requested.push(url);
    assert.equal(init.credentials, 'omit');
    if (url === root + 'master.m3u8') return new Response('#EXTM3U\n#EXTINF:2,\nfirst.ts\n#EXT-X-ENDLIST');
    if (url === root + 'first.ts') return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('The HTML wrapper must not be fetched as media');
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
const owner = context.lexihaloSites.browserPage(page);
context.lexihaloSiteAdapters = { prepare: async () => ({
  page: owner, sources: [{ url: root + 'master.m3u8', ext: 'm3u8' }],
}) };
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-reader.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/video/browser-audio.js', import.meta.url), 'utf8'), context);
const parts = [];
const result = await context.lexihaloReadBrowserAudio({
  signal: new AbortController().signal, sendPart: async part => parts.push(part),
});
assert.equal(result.total, 3);
assert.equal(parts.length, 1);
assert.deepEqual(requested, [root + 'master.m3u8', root + 'first.ts']);
assert(!requested.includes(page));
for (const bad of ['https://127.0.0.1/file.ts', 'https://localhost/file.ts',
  'https://server.local/file.ts', 'https://server.internal/file.ts', 'file:///private/file.ts']) {
  assert.equal(context.lexihaloSites.isMediaUrl(page, bad), false);
}
assert.equal(context.lexihaloSites.browserPage('https://127.0.0.1/video'), null);
console.log('Generic HLS real-resource routing tests passed');
