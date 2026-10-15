import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../config/media-platforms.json", import.meta.url),
    "utf8",
  ),
).filter((site) => site.mode === "browser");
let href = "/artist/current",
  playing = true,
  clicks = 0;
const attributes = { "aria-valuenow": "84.5", "aria-valuemax": "300" };
const elapsed = { textContent: "Current time: 1 minute 24 seconds 1:24" },
  duration = { textContent: "Duration: 5 minutes 5:00" };
const button = {
  classList: {
    contains: (value) => value === (playing ? "playing" : "sc-button-play"),
  },
  click: () => {
    clicks++;
    playing = !playing;
  },
};
const root = {
  querySelector: (selector) =>
    ({
      ".playbackSoundBadge__titleLink[href]": { getAttribute: () => href },
      ".playbackTimeline__progressWrapper": {
        getAttribute: (name) => attributes[name] ?? null,
      },
      ".playbackTimeline__timePassed": elapsed,
      ".playbackTimeline__duration": duration,
      ".playControl": button,
    })[selector] || null,
};
const ticks = [],
  events = [];
const context = {
  URL,
  Event,
  TextDecoder,
  Uint8Array,
  atob,
  location: new URL("https://soundcloud.com/artist/current"),
  document: {
    querySelector: (selector) => (selector === ".playControls" ? root : null),
  },
  setInterval: (fn) => {
    ticks.push(fn);
    return ticks.length;
  },
  clearInterval() {},
  addEventListener() {},
  removeEventListener() {},
};
context.window = context;
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
for (const file of ["native-audio-clock", "soundcloud-playback"])
  vm.runInNewContext(
    fs.readFileSync(
      new URL(`../src/video/${file}.js`, import.meta.url),
      "utf8",
    ),
    context,
  );
const clock = context.lexihaloSoundcloudPlayback;
assert.deepEqual(
  { ...clock.read() },
  { current: 84.5, duration: 300, paused: false },
);
const attrs = new Map();
const media = {
  isConnected: true,
  hasAttribute: (key) => attrs.has(key),
  setAttribute: (k, v) => attrs.set(k, v),
  dispatchEvent: (e) => events.push(e.type),
};
clock.bind(media);
assert.equal(media.currentTime, 84.5);
assert.equal(clicks, 0);
playing = false;
attributes["aria-valuenow"] = "120";
ticks[0]();
assert.equal(media.currentTime, 120);
assert.deepEqual(events, ["pause"]);
await media.play();
assert.equal(clicks, 1);
media.pause();
assert.equal(clicks, 2);
href = "/artist/next";
assert.equal(clock.read(), null);
assert.equal(Number.isNaN(media.currentTime), true);
await media.play();
media.pause();
assert.equal(clicks, 2);
href = "https://other.example/artist/current";
assert.equal(clock.read(), null);
href = "/artist/current";
delete attributes["aria-valuenow"];
delete attributes["aria-valuemax"];
assert.equal(
  clock.read().current,
  84,
  "Fallback ignores the localized accessible prose and reads the displayed timestamp",
);
elapsed.textContent = "Loading";
assert.equal(clock.read(), null);
console.log(
  "SoundCloud native clock, identity, seek/pause and accessible time tests passed",
);
