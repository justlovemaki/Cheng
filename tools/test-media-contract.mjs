import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const platforms = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8'));
const catalog = platforms.filter(entry => entry.mode === 'browser');
const context = { URL, globalThis: null, TextDecoder, Uint8Array, atob };
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/platform-capabilities.js', import.meta.url), 'utf8')
  .replace('const PLATFORM_CATALOG = [];', `const PLATFORM_CATALOG = ${JSON.stringify(platforms)};`), context);
const contract = context.lexihaloMediaContract;
const generic = context.lexihaloSites.browserPage('https://media.example.com/watch/item');
const sources = [];
contract.addDirect(sources, generic, 'https://cdn.example.com/video/master.m3u8', {
  mimeType: 'application/vnd.apple.mpegurl', resolution: 1080,
});
contract.addDirect(sources, generic, 'https://cdn.example.com/audio.m4a', { kind: 'audio', size: 123 });
contract.addDirect(sources, generic, 'https://cdn.example.com/poster.jpg');
contract.addCaptured(sources, { captureId: 'opaque', ext: 'm3u8', mimeType: 'application/vnd.apple.mpegurl' });
contract.addCaptured(sources, { captureId: 'opaque', ext: 'm3u8' });
assert.equal(sources.length, 3);
assert.deepEqual([sources[0].transport, sources[0].kind, sources[0].isAudio, sources[0].resolution],
  ['direct', 'video', false, 1080]);
assert.deepEqual([sources[1].transport, sources[1].kind, sources[1].isAudio, sources[1].resolution],
  ['direct', 'audio', true, 0]);
assert.deepEqual([sources[2].transport, sources[2].kind], ['capture', 'video']);
assert.equal(contract.sourceKey(sources[2]), 'capture:opaque');
assert.deepEqual({ ...contract.capabilities(generic) }, { audioOnly: false, browserReadable: true, generic: true });
assert.equal(context.lexihaloPlatformCapabilities.catalog.length,32);
assert.equal(context.lexihaloPlatformCapabilities.keys.length,33);
assert.equal(context.lexihaloPlatformCapabilities.resolve({platform:'youtube',page:generic,host:'www.youtube.com'}).browserCapture,false);
assert.equal(context.lexihaloPlatformCapabilities.resolve({platform:'html5',page:generic,host:'media.example.com'}).browserCapture,true);
assert.equal(context.lexihaloPlatformCapabilities.resolve({platform:'html5',page:generic,host:'www.pornhub.com'}).key,'pornhub');
console.log('Canonical media source contract tests passed');
