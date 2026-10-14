import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const platforms = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8'));
const runtimeLocation = { href: 'https://www.youtube.com/watch?v=abcdefghijk' };
const globalThis = { __playinfo__: { data: { dash: { audio: [
  { baseUrl: 'https://cdn.example/audio.m4a', size: 1500, bandwidth: 40000 },
] } } }, lexihaloSiteAdapters: { snapshot: () => ({ page: { id: 'generic' }, sources: [
  { captureId: 'wrong-generic-youtube-resource', ext: 'mp3', isAudio: true, size: 7000 },
] }) }, lexihaloSites: {
  page: () => null, siteOf: () => null,
  browserPage: address => ({ id: 'generic', url: address, identity: `generic:${address}` }),
} };
const vmContext = { globalThis, URL, location: runtimeLocation };
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js', import.meta.url), 'utf8'), vmContext);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/platform-capabilities.js', import.meta.url), 'utf8')
  .replace('const PLATFORM_CATALOG = [];', `const PLATFORM_CATALOG = ${JSON.stringify(platforms)};`), vmContext);
vm.runInNewContext(fs.readFileSync(new URL('../src/video/audio-source.js', import.meta.url), 'utf8'), vmContext);
const resolve = globalThis.lexihaloResolveAudioSource;
assert.equal(globalThis.lexihaloMediaPageUrl({ platform: 'youtube', context: { id: 'abcdefghijk' } }),
  'https://www.youtube.com/watch?v=abcdefghijk');
runtimeLocation.href = 'https://www.bilibili.com/video/BV1abcdefghi?p=2';
assert.equal(globalThis.lexihaloMediaPageUrl({ platform: 'bilibili', context: { id: 'BV1abcdefghi' } }),
  'https://www.bilibili.com/video/BV1abcdefghi?p=2');
runtimeLocation.href = 'https://media.example.com/watch/lesson?episode=2#player';
assert.equal(globalThis.lexihaloMediaPageUrl({ platform: 'html5', context: {} }),
  'https://media.example.com/watch/lesson?episode=2');
assert.equal(globalThis.lexihaloPreferNativeHelper({ platform: 'html5' }), false);
runtimeLocation.href = 'https://www.pornhub.com/view_video.php?viewkey=ph123abc&from=homepage#player';
assert.equal(globalThis.lexihaloPreferNativeHelper({ platform: 'html5' }), true);
assert.equal(globalThis.lexihaloMediaPageUrl({ platform: 'html5', context: {} }),
  'https://www.pornhub.com/view_video.php?viewkey=ph123abc');
const context = { streams: [{ urls: ['https://cdn.example/large.mp4'], size: 26 * 1024 ** 2 }] };
assert.equal(resolve({ platform: 'bilibili', context }).source.url, 'https://cdn.example/audio.m4a');
assert.equal(resolve({ platform: 'vimeo', context }).oversized, true);
assert.equal(resolve({ platform: 'vimeo', context: { streams: [] }, video: { currentSrc: 'blob:opaque', src: '', getAttribute: () => '', querySelectorAll: () => [] } }).source, undefined);
const sourceElementResult = resolve({ platform: 'html5', context: { streams: [] }, video: {
  currentSrc: '', src: '', getAttribute: () => '',
  querySelectorAll: () => [{ src: 'https://cdn.example/movie.webm', type: 'video/webm', getAttribute: () => '' }],
} });
assert.equal(sourceElementResult.source.url, 'https://cdn.example/movie.webm');
assert.equal(resolve({ platform: 'vimeo', context: { streams: [{ urls: ['https://cdn.example/playlist.m3u8'] }] } }).source, undefined);
runtimeLocation.href = 'https://www.youtube.com/watch?v=abcdefghijk';
const youtubeResolved = resolve({ platform: 'youtube', context: { streams: [], context: { ytInitialPlayerResponse: { streamingData: { adaptiveFormats: [
  { url: 'https://cdn.example/audio.webm', mimeType: 'audio/webm', contentLength: '1111' },
] } } } } });
assert.equal(youtubeResolved.source.url, 'https://cdn.example/audio.webm');
assert.equal(youtubeResolved.browserSources.length, 0, 'YouTube must not consume generic captured page sounds');
console.log('Audio-source tests passed');
