import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../config/media-platforms.json", import.meta.url),
    "utf8",
  ),
).filter((site) => site.mode === "browser");
let trackNum = 3;
const source = (id) =>
  `https://t4.bcbits.com/stream/hash/mp3-128/${id}?token=fixture`;
const data = {
  url: "https://artist.bandcamp.com/album/example",
  current: { type: "album", id: 999 },
  featured_track_id: 333,
  trackinfo: [
    {
      track_num: 1,
      track_id: 111,
      title: "Not publicly playable",
      title_link: null,
      file: null,
    },
    {
      track_num: 2,
      track_id: 222,
      title: "Second track",
      title_link: "/track/second",
      duration: 300,
      file: { "mp3-128": source(222) },
    },
    {
      track_num: 3,
      track_id: 333,
      title: "Selected third track",
      title_link: "/track/third",
      duration: 300,
      file: { "mp3-128": source(333) },
    },
  ],
};
const selectedRow = { getAttribute: () => `tracknum=${trackNum}` };
const player = {
  querySelector: (selector) =>
    ({
      ".time": { textContent: "01:46 / 05:00" },
      ".playbutton": { classList: { contains: () => false } },
    })[selector] || null,
};
const media = (id) => ({
  tagName: "AUDIO",
  isConnected: true,
  paused: true,
  ended: false,
  duration: 300,
  currentSrc: source(id).replace("fixture", "current-session"),
  currentTime: id === 333 ? 106.6 : 0,
  hasAttribute: () => false,
  getAttribute: () => "",
  closest: () => null,
  querySelectorAll: () => [],
  getBoundingClientRect: () => ({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  }),
});
const firstAudio = media(222),
  selectedAudio = media(333),
  emptyProbe = { ...media(0), currentSrc: "" };
const doc = {
  title: "Album title",
  querySelector: (selector) =>
    ({
      ".track_row_view.current_track": selectedRow,
      ".inline_player": player,
      "script[data-tralbum]": { getAttribute: () => JSON.stringify(data) },
    })[selector] || null,
  querySelectorAll: (selector) =>
    selector === "video, audio" ? [firstAudio, selectedAudio, emptyProbe] : [],
  scripts: [],
};
const context = {
  URL,
  Event,
  TextDecoder,
  Uint8Array,
  atob,
  AbortSignal,
  AbortController,
  location: new URL(data.url),
  document: doc,
  TralbumData: data,
  innerWidth: 1280,
  innerHeight: 720,
  getComputedStyle: () => ({ display: "none", visibility: "hidden" }),
};
context.window = context;
context.parent = context;
vm.runInNewContext(
  fs
    .readFileSync(
      new URL("../src/shared/media-sites.js", import.meta.url),
      "utf8",
    )
    .replace(
      "const CATALOG = [];",
      `const CATALOG = ${JSON.stringify(catalog)};`,
    ),
  context,
);
for (const file of [
  "shared/media-contract",
  "video/native-audio-clock",
  "video/bandcamp-media",
  "video/media-site-hooks",
  "video/site-adapters",
]) {
  vm.runInNewContext(
    fs.readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8"),
    context,
  );
}
const site = context.lexihaloSiteAdapters,
  bandcamp = context.lexihaloBandcampMedia;
assert.equal(bandcamp.selected().track.track_id, 333);
assert.equal(
  site.pickMedia(),
  selectedAudio,
  "Pick the selected hidden native audio, not a preceding/preload element",
);
const third = site.snapshot();
assert.equal(third.title, "Selected third track");
assert.equal(third.page.itemId, "333");
assert.equal(third.sources.length, 1);
assert.equal(
  third.sources[0].ext,
  "mp3",
  "The real stream path has no filename extension; preserve the official format metadata",
);
assert(third.sources[0].url.includes("/333?"));
assert.equal(third.page.requiresTrackPage, true);
assert.equal(third.page.trackUrl, "https://artist.bandcamp.com/track/third");
const pending = site.prepare();
trackNum = 2;
await assert.rejects(
  pending,
  /已切换/,
  "An album track switch with the same URL invalidates the pending request",
);
const second = site.snapshot();
assert.notEqual(second.page.identity, third.page.identity);
assert.equal(second.page.itemId, "222");
assert(second.sources.every((value) => value.url.includes("/222?")));
trackNum = 3;
const captureQueries = [];
context.lexihaloGetCapturedSources = async (urls) => {
  captureQueries.push(urls);
  return {
    sources: [
      {
        captureId: `selected-${new URL(urls[0]).pathname.split("/").at(-1)}`,
        ext: "mp3",
        mimeType: "audio/mpeg",
        kind: "audio",
        transport: "capture",
      },
    ],
  };
};
const capturedThird = await site.prepare();
assert.equal(
  capturedThird.sources[0].captureId,
  "selected-333",
  "Use the broker for a selected track instead of page-context CORS",
);
assert(captureQueries[0].every((url) => url.includes("/333?")));
trackNum = 2;
assert(
  !site.snapshot().sources.some((value) => value.captureId === "selected-333"),
  "Do not reuse another selected track capture",
);
let captureCalls = 0,
  probes = 0,
  bodyCancels = 0;
context.lexihaloGetCapturedSources = async () => ({
  sources:
    ++captureCalls === 1
      ? []
      : [
          {
            captureId: "selected-222",
            transport: "capture",
            kind: "audio",
            ext: "mp3",
            mimeType: "audio/mpeg",
          },
        ],
});
context.fetch = async (url, options) => {
  probes++;
  assert(url.includes("/222?"));
  assert.equal(options.mode, "no-cors");
  assert.equal(options.credentials, "omit");
  assert.equal(
    options.redirect,
    "follow",
    "Browsers reject no-cors fetch with redirect:error before sending a request",
  );
  return {
    body: {
      cancel: async () => {
        bodyCancels++;
      },
    },
  };
};
const primed = await site.prepare();
assert.equal(primed.sources[0].captureId, "selected-222");
assert.equal(probes, 1);
assert.equal(bodyCancels, 1);
trackNum = 99;
assert.equal(
  bandcamp.selected(),
  null,
  "Do not fall back to track zero for an unknown selected row",
);
assert.equal(site.snapshot().sources.length, 0);
trackNum = 3;
context.TralbumData = undefined;
assert.equal(
  bandcamp.selected().track.track_id,
  333,
  "Read the official data-tralbum script when the global is absent",
);
context.location = new URL("https://artist.bandcamp.com/track/third");
data.url = context.location.href;
assert.equal(site.currentItem().requiresTrackPage, false);
data.trackinfo[2].file = { "mp3-128": "https://other.example/track.mp3" };
assert.equal(
  bandcamp.selected().files.length,
  0,
  "Do not accept an unrelated media host",
);
console.log(
  "Bandcamp album/current-track selection, hidden audio, metadata and cache isolation tests passed",
);
