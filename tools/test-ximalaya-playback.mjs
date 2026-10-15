import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../config/media-platforms.json", import.meta.url),
    "utf8",
  ),
).filter((site) => site.mode === "browser");
let href = "/sound/546568325",
  paused = false,
  ambiguous = false,
  playerPresent = true;
let plays = 0,
  pauses = 0,
  clears = 0;
const ticks = [],
  events = [],
  listeners = new Map();
const time = { textContent: "00:01:24 / 00:14:43" },
  progress = { style: { width: "" } };
const root = {
  querySelector: (selector) =>
    ({
      ".xm-player-body-title a[href]": { getAttribute: () => href },
      ".xm-player-playtime": time,
      ".xm-player-progress_cur": progress,
      ".xm-player-btns .play":
        paused || ambiguous
          ? {
              click: () => {
                plays++;
                paused = false;
              },
            }
          : null,
      ".xm-player-btns .pause":
        !paused || ambiguous
          ? {
              click: () => {
                pauses++;
                paused = true;
              },
            }
          : null,
    })[selector] || null,
};
const context = {
  URL,
  Event,
  TextDecoder,
  Uint8Array,
  atob,
  location: new URL("https://www.ximalaya.com/sound/546568325"),
  document: {
    querySelector: (selector) =>
      selector === ".xm-player" && playerPresent ? root : null,
  },
  setInterval: (fn) => {
    ticks.push(fn);
    return ticks.length;
  },
  clearInterval: () => {
    clears++;
  },
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name) => listeners.delete(name),
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
for (const file of ["native-audio-clock", "ximalaya-playback"]) {
  vm.runInNewContext(
    fs.readFileSync(
      new URL(`../src/video/${file}.js`, import.meta.url),
      "utf8",
    ),
    context,
  );
}
const clock = context.lexihaloXimalayaPlayback;
assert.deepEqual(
  { ...clock.read() },
  { current: 84, duration: 883, paused: false },
);
const attributes = new Map();
const media = {
  isConnected: true,
  src: "",
  hasAttribute: (name) => attributes.has(name),
  setAttribute: (name, value) => attributes.set(name, value),
  dispatchEvent: (event) => events.push(event.type),
};
clock.bind(media);
clock.bind(media);
assert.equal(ticks.length, 1);
assert.equal(attributes.get("data-lexihalo-native-clock"), "ximalaya");
assert.equal(media.currentTime, 84);
assert.equal(media.duration, 883);
assert.equal(
  media.src,
  "",
  "Do not assign a second audio source to the anchor",
);
assert.equal(
  plays + pauses,
  0,
  "Reading captions must not start or stop native playback",
);
progress.style.width = "50%";
assert.equal(
  media.currentTime,
  441.5,
  "Follow native seeking rather than the placeholder's time",
);
paused = true;
ticks[0]();
assert.deepEqual(events, ["pause"]);
await media.play();
assert.equal(plays, 1);
ticks[0]();
assert.deepEqual(events, ["pause", "play"]);
media.pause();
assert.equal(pauses, 1);
progress.style.width = "100%";
assert.equal(media.ended, true);
href = "/sound/999999999";
assert.equal(clock.read(), null);
assert.equal(
  Number.isNaN(media.currentTime),
  true,
  "Do not show this episode's captions for another playing item",
);
await media.play();
media.pause();
assert.equal(plays + pauses, 2);
href = "https://other.example/sound/546568325";
assert.equal(clock.read(), null);
href = "https://www.ximalaya.com/sound/546568325?from=player";
assert.equal(
  media.duration,
  883,
  "Tracking parameters must not change the sound identity",
);
ambiguous = true;
assert.equal(
  clock.read(),
  null,
  "Do not guess a play/pause state when both controls are present",
);
ambiguous = false;
progress.style.width = "";
time.textContent = "invalid / --:--";
assert.equal(clock.read(), null);
playerPresent = false;
assert.equal(clock.read(), null);
media.isConnected = false;
ticks[0]();
assert.equal(clears, 1);
assert.equal(
  listeners.size,
  0,
  "Remove the pagehide listener when the anchor disappears",
);
console.log(
  "Ximalaya native playback, sound identity, pause/seek and no-extra-audio tests passed",
);
