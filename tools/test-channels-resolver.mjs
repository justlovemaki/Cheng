import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/media-platforms.json', import.meta.url), 'utf8')).filter(entry => entry.mode === 'browser');
const tabs = new Map();
const created = [];
const calls = [];
let loggedIn = false, nextTab = 10;
const context = {
  URL, TextDecoder, Uint8Array, atob, AbortSignal, crypto: webcrypto,
  location: new URL('https://weixin.qq.com/sph/abc123'),
  fetch: async (path, init) => {
    calls.push({ origin: context.location.origin, path, init });
    if (path === '/api/weixin/get_parse_result') {
      assert.equal(init.credentials, 'same-origin');
      if (!loggedIn) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ code: 0, data: {
        playable_url: 'https://channels.weixin.qq.com/finder-preview/pages/feed?eid=fixture&token=private-page-token',
      } }));
    }
    assert.equal(context.location.origin, 'https://channels.weixin.qq.com');
    assert.equal(init.credentials, 'omit');
    return new Response(JSON.stringify({ errCode: 0, data: { errMsg: { type: 0 }, feedInfo: {
      description: 'Fixture', h264VideoInfo: { videoUrl: 'https://finder.video.qq.com/1/2/stodownload?signature=fixture' },
    } } }));
  },
  chrome: {
    tabs: {
      async create({ url }) { const id = nextTab++; tabs.set(id, { id, url, status: 'complete' }); created.push(url); return tabs.get(id); },
      async get(id) { return tabs.get(id); },
    },
    scripting: {
      async executeScript({ target, func, args }) {
        context.location = new URL(tabs.get(target.tabId).url);
        return [{ result: await func(...args) }];
      },
    },
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-sites.js', import.meta.url), 'utf8')
  .replace('const CATALOG = [];', `const CATALOG = ${JSON.stringify(catalog)};`), context);
vm.runInNewContext(fs.readFileSync(new URL('../src/background/site-resolver.js', import.meta.url), 'utf8'), context);
const request = context.lexihaloResolveChannelsRequest;
const page = 'https://weixin.qq.com/sph/abc123';
const sender = { url: page, tab: { id: 1 }, frameId: 0 };
await assert.rejects(request({ mode: 'open', mediaPageUrl: page, userInitiated: false }, sender), /确认打开元宝/);
assert.equal(created.length, 0);
const opened = await request({ mode: 'open', mediaPageUrl: page, userInitiated: true }, sender);
const follow = { mode: 'read', mediaPageUrl: page, sessionId: opened.sessionId };
assert.equal((await request(follow, sender)).state, 'login');
loggedIn = true;
assert.equal((await request(follow, sender)).state, 'loading');
const ready = await request(follow, sender);
assert.equal(ready.state, 'ready');
assert(ready.mediaUrl.startsWith('https://finder.video.qq.com/'));
assert(!JSON.stringify(ready).includes('private-page-token'));
assert.equal(created.length, 2);
await assert.rejects(request(follow, { ...sender, frameId: 1 }), /任务已过期/);
assert(calls.every(call => ['https://yuanbao.tencent.com', 'https://channels.weixin.qq.com'].includes(call.origin)));
console.log('User-confirmed Channels resolver and token-isolation tests passed');
