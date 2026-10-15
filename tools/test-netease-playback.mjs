import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let state = { track: { id: 156717, duration: 120000 }, playing: true };
const time = { textContent: "00:12 / 02:00" },
  progress = { style: { width: "10%" } };
let playClicks = 0,
  pauseCalls = 0,
  clears = 0;
const ticks = [],
  events = [];
const context = {
  URL,
  Event,
  location: new URL("https://music.163.com/#/song?id=156717"),
  lexihaloSites: {
    page: (url) =>
      /song\?id=156717/.test(url) ? { id: "netease", itemId: "156717" } : null,
  },
  player: {
    getPlaying: () => state,
    pause: () => {
      pauseCalls++;
      state.playing = false;
    },
  },
  document: {
    querySelector: (selector) =>
      ({
        ".m-playbar .time": time,
        ".m-playbar .m-pbar .cur": progress,
        ".m-playbar .btns .ply": {
          click: () => {
            playClicks++;
            state.playing = true;
          },
        },
      })[selector] || null,
  },
  setInterval: (fn) => {
    ticks.push(fn);
    return ticks.length;
  },
  clearInterval: () => {
    clears++;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};
context.window = context;
vm.runInNewContext(
  fs.readFileSync(
    new URL("../src/video/native-audio-clock.js", import.meta.url),
    "utf8",
  ),
  context,
);
vm.runInNewContext(
  fs.readFileSync(
    new URL("../src/video/netease-playback.js", import.meta.url),
    "utf8",
  ),
  context,
);
const clock = context.lexihaloNeteasePlayback;
assert.deepEqual(
  { ...clock.read() },
  { current: 12, duration: 120, paused: false },
);
const attributes = new Map();
const media = {
  isConnected: true,
  hasAttribute: (name) => attributes.has(name),
  setAttribute: (key, value) => attributes.set(key, value),
  dispatchEvent: (event) => events.push(event.type),
};
clock.bind(media);
clock.bind(media);
assert.equal(
  ticks.length,
  1,
  "Binding the same tool anchor must not start duplicate observers",
);
assert.equal(media.currentTime, 12);
assert.equal(media.duration, 120);
assert.equal(media.paused, false);
assert.equal(
  playClicks,
  0,
  "Reading the clock must never start a second playback",
);
progress.style.width = "50%";
assert.equal(
  media.currentTime,
  60,
  "Follow native seek, not the placeholder's zero clock",
);
state.playing = false;
ticks[0]();
assert.deepEqual(events, ["pause"]);
await media.play();
assert.equal(playClicks, 1);
ticks[0]();
assert.deepEqual(events, ["pause", "play"]);
media.pause();
assert.equal(pauseCalls, 1);
progress.style.width = "";
time.textContent = "01:02 / 02:00";
assert.equal(
  media.currentTime,
  62,
  "Visible native time is the fallback when progress is unavailable",
);
progress.style.width = "100%";
assert.equal(media.ended, true);
state.track.id = 999999;
assert.equal(
  clock.read(),
  null,
  "Never sync this page's captions to a different playing song",
);
assert.equal(Number.isNaN(media.currentTime), true);
assert.equal(media.paused, true);
await media.play();
media.pause();
assert.equal(playClicks, 1);
assert.equal(pauseCalls, 1, "Controls must not interfere with another song");
media.isConnected = false;
ticks[0]();
assert.equal(clears, 1);
console.log(
  "NetEase native playback clock, pause/seek tracking, identity and cleanup tests passed",
);
