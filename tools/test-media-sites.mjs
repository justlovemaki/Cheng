import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const platforms = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8'));
const catalog = platforms.filter(entry => entry.mode === 'browser');
const context = { URL, TextDecoder, Uint8Array, atob };
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
const sites = context.lexihaloSites;
const samples = {
  douyin: 'https://www.douyin.com/video/1234567890123456789',
  xiaohongshu: 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=access',
  channels: 'https://weixin.qq.com/sph/abc123',
  xiaoe: 'https://appabc123.h5.xiaoeknow.com/v4/course/alive/l_12345678?app_id=appabc123',
  weibo: 'https://weibo.com/123456/AbCdEf',
  tiktok: 'https://www.tiktok.com/@someone/video/1234567890123456789',
  x: 'https://x.com/someone/status/1234567890123456789',
  instagram: 'https://www.instagram.com/reel/AbCdEf/',
  facebook: 'https://www.facebook.com/watch/?v=1234567890',
  reddit: 'https://www.reddit.com/r/test/comments/abc123/a_post/',
  twitch: 'https://www.twitch.tv/videos/123456789',
  dailymotion: 'https://www.dailymotion.com/video/x123abc',
  niconico: 'https://www.nicovideo.jp/watch/sm12345678',
  xiaoyuzhou: 'https://www.xiaoyuzhoufm.com/episode/0123456789abcdef01234567',
  soundcloud: 'https://soundcloud.com/someone/a_track',
  bandcamp: 'https://someone.bandcamp.com/track/a_track',
  ximalaya: 'https://www.ximalaya.com/sound/12345678',
  netease: 'https://music.163.com/#/song?id=12345678',
  applepodcasts: 'https://podcasts.apple.com/us/podcast/a_show/id123456789?i=1234567890123',
};
assert.equal(catalog.length, 19);
assert.equal(new Set(catalog.map(s => s.id)).size, 19);
const matrix = [];
for (const [id, address] of Object.entries(samples)) {
  assert.equal(sites.page(address)?.id, id, address);
  const page = sites.page(address);
  assert(page.identity && page.url.startsWith('https:'));
  assert.equal(sites.page(new URL(address).origin + '/')?.id, undefined);
  assert.equal(sites.page(address.replace('https:', 'http:')), null);
  assert.equal(sites.page(address.replace('https://', 'https://user:password@')), null);
  const host = catalog.find(site => site.id === id).mediaHosts[0];
  const mediaHost = id === 'xiaohongshu' ? 'sns-video-test.xhscdn.com' : host;
  const path = id === 'channels' ? '/1/2/stodownload' : '/media/file.mp4';
  assert.equal(sites.isMediaUrl(page.url, `https://${mediaHost}${path}`), true, id);
  assert.equal(sites.isMediaUrl(page.url, 'https://127.0.0.1/private.mp4'), false);
  matrix.push({ id, address: page.url });
}
assert.equal(sites.page('https://twitter.com/someone/status/1234567890123456789/video/1').identity, sites.page(samples.x).identity);
assert.equal(sites.page(samples.xiaohongshu.replace('access', 'changed')).identity, sites.page(samples.xiaohongshu).identity);
assert.equal(sites.page('https://www.douyin.com/?modal_id=1234567890123456789').identity, sites.page(samples.douyin).identity);
assert.equal(sites.page('https://twitch.tv/a_live_channel'), null);
assert.equal(sites.page('https://facebook.com/someone'), null);
assert.equal(sites.page('https://www.instagram.com/someone'), null);
assert.equal(sites.page('https://soundcloud.com/discover/people'), null);
for (const [id, address] of Object.entries({
  douyin: 'https://www.douyin.com/',
  weibo: 'https://weibo.com/',
  tiktok: 'https://www.tiktok.com/foryou',
  x: 'https://x.com/home',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/watch/',
  reddit: 'https://www.reddit.com/',
})) {
  assert.equal(sites.page(address), null, `${id}: feed must not become a native single-item page`);
  const contextual = sites.browserPage(address);
  assert.equal(contextual?.id, id);
  assert.equal(contextual?.contextual, true);
  assert.equal(contextual?.browser, true);
  assert.equal(sites.nativePage(address), null, `${id}: feed must never be passed to yt-dlp as one video`);
}
assert.equal(sites.isMediaUrl('https://www.douyin.com/', 'https://video.douyinvod.com/current.mp4?__vid=feed-video'), true);
assert.equal(sites.isMediaUrl(samples.douyin, 'https://video.douyinvod.com/play.mp4?__vid=other'), false);
const bandcampAlbum = 'https://artist.bandcamp.com/album/a-record#t=20';
assert.equal(sites.page(bandcampAlbum)?.id, 'bandcamp');
assert.equal(sites.page('https://artist.bandcamp.com/album/a-record/unrelated'), null);
matrix.push({ id: 'bandcamp', address: bandcampAlbum });
const python = `import sys,json; sys.path.insert(0,'native'); import media_sites; data=json.load(sys.stdin); print(json.dumps([{'id':media_sites.site_of(item['address'])['id'], 'valid':media_sites.is_item(item['address'])} for item in data]))`;
const native = JSON.parse(execFileSync('python', ['-c', python], { input: JSON.stringify(matrix), encoding: 'utf8' }));
assert.deepEqual(native.map(s => s.id), matrix.map(item => item.id));
assert(native.every(s => s.valid), JSON.stringify(native.filter(s => !s.valid)));
console.log('19-site routing and native policy parity tests passed');
