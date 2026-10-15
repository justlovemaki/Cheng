import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8')).filter(entry => entry.mode === 'browser');
const nodes = new Map();
let currentSrc = '', currentType = 'VIDEO', sourceRows = [], metaRows = [], frameRows = [];
const media = {
  get tagName() { return currentType; }, isConnected: true, paused: false, ended: false,
  get currentSrc() { return currentSrc; }, src: '', srcObject: null, duration: 10, videoHeight: 720,
  closest: () => null, getAttribute: () => '', querySelectorAll: () => sourceRows,
  contains: element => sourceRows.includes(element),
  getBoundingClientRect: () => ({ top: 0, left: 0, right: 640, bottom: 360, width: 640, height: 360 }),
};
const document = {
  title: 'Current media',
  querySelector: (selector) => nodes.get(selector) || null,
  querySelectorAll: (selector) => selector === 'video, audio' || selector === 'video' ? [media] : selector === 'iframe' ? frameRows : metaRows,
  getElementById: id => nodes.get('#' + id) || null,
  scripts: [],
};
const context = { location: new URL('https://www.douyin.com/video/123456789'), document,
  innerWidth: 1920, innerHeight: 1080, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  URL, TextDecoder, Uint8Array, atob, AbortSignal, fetch: async () => { throw Error('unexpected network'); },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/video/media-site-hooks.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/video/site-adapters.js', import.meta.url), 'utf8'), context);
const adapters = context.lexihaloSiteAdapters;
assert.deepEqual([...context.lexihaloMediaSiteHooks.ids].sort(), catalog.map(site => site.id).sort());
assert.deepEqual([...context.lexihaloMediaSiteHooks.entries].filter(entry => entry.mode === 'custom').map(entry => entry.id).sort(),
  ['bandcamp', 'channels', 'douyin', 'netease', 'soundcloud', 'tiktok', 'xiaoe', 'xiaohongshu', 'xiaoyuzhou', 'ximalaya']);
currentSrc = 'https://video.douyinvod.com/movie.mp4?__vid=123456789';
assert.equal(adapters.snapshot().sources[0].url, currentSrc);
assert.equal(adapters.snapshot().sources[0].kind, 'video');
assert.equal(adapters.snapshot().sources[0].transport, 'direct');
currentSrc = 'https://video.douyinvod.com/movie.mp4?__vid=987654321';
assert.equal(adapters.snapshot().sources.length, 0, 'Neighbouring Douyin clips must be rejected');
context.location = new URL('https://www.douyin.com/');
currentSrc = 'https://video.douyinvod.com/feed-current.mp4?__vid=feed-one';
const feedOne = adapters.snapshot();
assert.equal(feedOne.page.contextual, true);
assert.equal(feedOne.page.id, 'douyin');
assert.equal(feedOne.media, media);
assert.equal(feedOne.sources[0].url, currentSrc);
assert.equal(context.lexihaloSites.nativePage(context.location.href), null);
currentSrc = 'https://video.douyinvod.com/feed-current.mp4?__vid=feed-two';
const feedTwo = adapters.snapshot();
assert.notEqual(feedOne.page.identity, feedTwo.page.identity, 'Feed videos need per-media identity without changing page URL');
assert.equal(feedTwo.sources[0].url, currentSrc);
context.location = new URL('https://www.xiaohongshu.com/explore/0123456789abcdef01234567');
const noteRoot = { closest: () => ({ getAttribute: () => '0123456789abcdef01234567' }),
  getAttribute: () => 'video', querySelector: () => media };
nodes.set('#noteContainer', noteRoot);
currentSrc = 'blob:source';
context.__INITIAL_STATE__ = { note: { noteDetailMap: { '0123456789abcdef01234567': { note: {
  noteId: '0123456789abcdef01234567', type: 'video', video: { media: { stream: { h264: [
    { format: 'mp4', height: 1080, master_url: 'https://sns-video-test.xhscdn.com/movie.mp4' },
  ] } } },
} } } } };
assert.equal(adapters.snapshot().sources[0].resolution, 1080);
noteRoot.closest = () => ({ getAttribute: () => 'another-note' });
assert.equal(adapters.pickMedia(), null, 'Stale XHS modal must not be attached');
assert.equal(adapters.snapshot().sources.length, 0);
context.location = new URL('https://www.tiktok.com/@author/video/123456789');
nodes.set('#__UNIVERSAL_DATA_FOR_REHYDRATION__', { textContent: JSON.stringify({ __DEFAULT_SCOPE__: {
  'webapp.video-detail': { itemInfo: { itemStruct: { id: '123456789', video: {
    height: 720, playAddr: 'https://v.tiktokcdn.com/video/tos/clip.mp4?mime_type=video_mp4',
  } } } },
} }) });
assert.equal(adapters.snapshot().sources.length, 1);
context.location = new URL('https://www.xiaoyuzhoufm.com/episode/0123456789abcdef01234567');
currentType = 'AUDIO';
currentSrc = 'https://media.xyzcdn.net/podcast.m4a';
assert.equal(adapters.pickMedia(), media);
assert.equal(adapters.snapshot().sources[0].isAudio, true);
// The same NetEase song is present in both the outer hash page and /song iframe.
// Ownership follows live ancestor URLs, without reading ancestor media or DOM.
context.window = context;
context.location = new URL('https://music.163.com/song?id=156717');
const songShell = { location: new URL('https://music.163.com/#/song?id=156717') };
songShell.parent = songShell;
Object.defineProperty(songShell, 'document', { get() { throw Error('Ancestor DOM must not be read'); } });
context.parent = songShell;
assert.equal(adapters.ownsRuntime(), false, 'The outer same-song shell owns the audio tools');
assert.equal(adapters.pickMedia(), null, 'Inner song must not attach to duplicate media');
assert.equal(adapters.ensureHost(null), null, 'Inner song must not create a floating placeholder');
context.parent = { location: new URL('https://music.163.com/embed-wrapper'), parent: songShell };
assert.equal(adapters.ownsRuntime(), false, 'Find the same-item owner through intermediate frames');
context.parent = { location: new URL('https://music.163.com/#/song?id=999999') };
assert.equal(adapters.ownsRuntime(), true, 'Do not suppress independently embedded songs');
context.parent = { location: new URL('https://music.163.com/') };
assert.equal(adapters.ownsRuntime(), true, 'A non-song shell must not claim the song');
context.parent = context;
assert.equal(adapters.ownsRuntime(), true, 'Standalone song pages remain available');
context.parent = { get location() { throw Error('Cross-origin frame'); } };
assert.equal(adapters.ownsRuntime(), true, 'Do not inspect or depend on cross-origin ancestors');
context.location = new URL('https://www.xiaoyuzhoufm.com/episode/0123456789abcdef01234567');
context.parent = { location: new URL(context.location.href) };
assert.equal(adapters.ownsRuntime(), true, 'Do not change unrelated audio-site ownership');
delete context.parent;
delete context.window;
context.location = new URL('https://appabc123.h5.xiaoeknow.com/v4/course/alive/l_12345678?app_id=appabc123');
currentType = 'VIDEO'; currentSrc = 'blob:source';
let requestedPath;
context.fetch = async (path, init) => {
  requestedPath = path;
  assert.equal(init.credentials, 'same-origin');
  return new Response(JSON.stringify({ code: 0, data: [{ line_sharpness: [
    { url: 'https://video.xiaoecloud.com/replay.m3u8', sharpness: '720p' },
  ] }] }));
};
const replay = await adapters.prepare();
assert(requestedPath.includes('alive_id=l_12345678'));
assert.equal(replay.sources[0].ext, 'm3u8');
assert.equal(replay.sources[0].resolution, 720);
context.location = new URL('https://channels.weixin.qq.com/finder-preview/pages/feed?eid=12345&token=test-only');
context.fetch = async (path, init) => {
  assert.equal(path, '/finder-preview/api/feed/get_feed_info');
  assert.equal(init.credentials, 'omit');
  return new Response(JSON.stringify({ errCode: 0, data: { errMsg: { type: 0 }, feedInfo: {
    h264VideoInfo: { videoUrl: 'https://finder.video.qq.com/1/2/stodownload?signature=test' },
  } } }));
};
const channels = await adapters.prepare();
assert.equal(channels.sources[0].ext, 'mp4');
context.location = new URL('https://hsck123.com/downvideo/videoTest.html');
currentSrc = 'blob:videojs-mse';
media.id = 'my-video_html5_api';
context.videojs = { getPlayer: () => ({
  el: () => ({ contains: element => element === media }),
  currentSource: () => ({ src: 'https://stream.example.com/hls/current.m3u8?token=fixture', type: 'application/x-mpegURL' }),
  currentSources: () => [],
}) };
let generic = adapters.snapshot();
assert.equal(generic.page.id, 'generic');
assert.equal(generic.sources[0].ext, 'm3u8');
assert.equal(generic.sources[0].url, 'https://stream.example.com/hls/current.m3u8?token=fixture');
context.location = new URL('https://generic.example.com/player');
context.lexihaloGetCapturedSources = async () => ({ sources: [
  { captureId: 'opaque-capture-with-direct-source', ext: 'm3u8', mimeType: 'application/vnd.apple.mpegurl' },
] });
const preparedWithDirectSource = await adapters.prepare();
assert(preparedWithDirectSource.sources.some(source => source.captureId === 'opaque-capture-with-direct-source'));
assert(preparedWithDirectSource.sources.some(source => source.captureId === 'opaque-capture-with-direct-source' &&
  source.transport === 'capture' && source.kind === 'video'));
assert(adapters.snapshot().sources.some(source => source.captureId === 'opaque-capture-with-direct-source'),
  'A snapshot after prepare must retain the capture beside a direct Video.js URL');
context.lexihaloGetCapturedSources = undefined;
context.location = new URL('https://hsck123.com/downvideo/videoTest.html');
context.videojs = undefined;
context.window = context;
const declaredSource = { tagName: 'SOURCE', src: '', type: 'application/x-mpegURL', getAttribute: () => 'application/x-mpegURL' };
sourceRows = [declaredSource]; nodes.set('#mp4m3u8', declaredSource);
document.scripts = [{ textContent: 'document.getElementById("mp4m3u8").src=parent.document.getElementById("video_img").src;' }];
let parentReads = 0;
context.parent = { location: { origin: context.location.origin }, document: {
  getElementById: id => { parentReads++; assert.equal(id, 'video_img'); return { src: 'https://cdn.example.com/master.m3u8' }; },
} };
generic = adapters.snapshot();
assert.equal(generic.sources[0].url, 'https://cdn.example.com/master.m3u8');
assert.equal(generic.wrapper, true);
// The same explicit relationship must work on an unrelated domain and IDs.
context.location = new URL('https://another.example.org/embed/player.html');
context.parent.location.origin = context.location.origin;
nodes.delete('#mp4m3u8'); nodes.set('#stream-source', declaredSource);
document.scripts = [{ textContent: "document.getElementById('stream-source').src = window.parent.document.getElementById('episode-media').src;" }];
context.parent.document.getElementById = id => { parentReads++; assert.equal(id, 'episode-media'); return { src: 'https://cdn.example.com/master.m3u8' }; };
assert.equal(adapters.snapshot().sources[0].ext, 'm3u8');
context.parent.location.origin = 'https://other.example.com';
const beforeCrossOrigin = parentReads;
assert.equal(adapters.snapshot().sources.length, 0, 'Cross-origin parents must not be borrowed');
assert.equal(parentReads, beforeCrossOrigin);
context.parent.location.origin = context.location.origin;
document.scripts = [{ textContent: "document.getElementById('unrelated-target').src=parent.document.getElementById('episode-media').src;" }];
assert.equal(adapters.snapshot().sources.length, 0, 'An assignment for an unrelated element is not a media declaration');
assert.equal(parentReads, beforeCrossOrigin);
document.scripts = []; sourceRows = [];
const ordinaryIframeSnapshot = adapters.snapshot();
assert.equal(ordinaryIframeSnapshot.sources.length, 0, 'Do not scan parent images/links without a declared relationship');
assert.equal(ordinaryIframeSnapshot.wrapper, false, 'An ordinary embedded player is not assumed to be a wrapper');
context.location = new URL('https://hsck123.com/downvideo/videoTest.html');
currentSrc = 'https://hsck123.com/downvideo/videoTest.html';
assert.equal(adapters.snapshot().sources.length, 0, 'HTML wrapper URLs must not become media candidates');
context.location = new URL('https://another.example.org/watch/item');
media.isConnected = false;
const nestedMedia = { tagName: 'VIDEO', currentSrc: 'https://cdn.example.com/movie.mp4', videoHeight: 1080,
  querySelectorAll: () => [], srcObject: null, mediaKeys: null };
const frame = { tagName: 'IFRAME', src: 'https://another.example.org/opaque/view.html', title: '', name: '', closest: () => null,
  getBoundingClientRect: media.getBoundingClientRect,
  contentDocument: { querySelector: () => nestedMedia, querySelectorAll: () => [nestedMedia] } };
frameRows = [frame];
assert.equal(adapters.hasPlayerFrame(), false, 'A normal same-origin document frame owns its own LexiHalo runtime');
assert.equal(adapters.snapshot().sources[0].url, nestedMedia.currentSrc);
Object.defineProperty(frame, 'contentDocument', { configurable: true, get() { throw Error('cross-origin'); } });
frame.src = 'https://player.example.net:8181/embed/item';
assert.equal(adapters.hasPlayerFrame(), false, 'A normal cross-origin document frame owns its own LexiHalo runtime');
assert.equal(adapters.snapshot().sources.length, 0, 'Never crawl cross-origin iframe DOM');
context.lexihaloGetCapturedSources = async () => ({ sources: [{ captureId: 'document-bound-id', ext: 'm3u8', mimeType: 'application/vnd.apple.mpegurl' }] });
assert.equal((await adapters.prepare()).sources[0].captureId, 'document-bound-id');
frame.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1, bottom: 1, width: 1, height: 1 });
assert.equal(adapters.hasPlayerFrame(), false, 'Tiny tracking frames are not players');
frame.getBoundingClientRect = media.getBoundingClientRect;
Object.defineProperty(frame, 'contentDocument', { configurable: true, value: {
  querySelector: () => nestedMedia, querySelectorAll: () => [nestedMedia],
} });
frame.src = 'about:blank';
assert.equal(adapters.hasPlayerFrame(), true, 'Opaque media frames require one parent proxy runtime');
frame.src = 'https://ads.example.net/banner';
Object.defineProperty(frame, 'contentDocument', { configurable: true, get() { throw Error('cross-origin'); } });
assert.equal(adapters.hasPlayerFrame(), false, 'Ordinary non-media iframe must not initialize a player');
console.log('Item-scoped site snapshot, generic wrappers/iframes, Video.js and protected-page API tests passed');
