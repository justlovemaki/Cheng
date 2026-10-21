import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { scopeVideoCss } from "./scope-video-css.mjs";
import { compileThemeCss } from "./theme-system.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "src/styles/edvideo.css"),
  "utf8",
);
const compiled = await scopeVideoCss(compileThemeCss(source, "edvideo.css"));
assert.equal(
  fs.readFileSync(path.join(root, "assets/edvideo.css"), "utf8"),
  compiled,
);
const sample = await scopeVideoCss(`/* comment */
.trancy-caption, .token:is(.active, .selected) { color: red; }
.zh-CN .trancy-primary-subtitle { color: blue; }
@media (min-width: 1px) { .bar, .details { display: flex; } }
@keyframes test { from { opacity: 0; } 50%, to { opacity: 1; } }`);
assert.match(sample, /\.trancy-caption, :where\([^\n]+\) \.token:is/);
assert.match(sample, /@media[^\n]+:where\([^\n]+\) \.bar/);
assert.ok(
  sample.includes("\n.zh-CN .trancy-primary-subtitle {"),
  "Root language selectors must remain usable",
);
assert.match(sample, /@keyframes test \{ from \{ opacity: 0; \} 50%, to/);
assert.equal(
  await scopeVideoCss(compiled),
  compiled,
  "Scoping must be idempotent",
);

const fixture = `<!doctype html><html><head><style>
.bar { width: 240px; height: 20px; margin: 0; background: green; }
.token { display: inline; position: static; white-space: normal; }
.details { margin-right: 0; }
.icon-back { display: inline-block; width: 16px; height: 16px; }
.icon-back::before { content: '←'; display: inline; }
.MuiButtonBase-root { padding: 12px; }
</style></head><body><h1>OpenWrt LuCI status fixture</h1>
<div class="cbi-progressbar"><div class="bar">Memory usage</div></div>
<span class="token">Host syntax token</span><span class="details">Details</span>
<a class="icon-back">Back</a><button class="MuiButtonBase-root">Host control</button>
<span id="luci-status"></span><script>
String.prototype.format = function(value) { return this.replace('%s', value); };
window.__luciTranslate = window._ = function(text) { return String(text); };
window.__luciFormat = String.prototype.format;
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  document.querySelector('#luci-status').textContent = _('Memory %s').format('42%');
}, 0));
</script></body></html>`;
const assertLuciGlobals = async (page) => {
  assert.deepEqual(
    await page.evaluate(() => ({
      sameTranslate: window._ === window.__luciTranslate,
      sameFormat: String.prototype.format === window.__luciFormat,
      translated: _("Memory %s").format("42%"),
    })),
    { sameTranslate: true, sameFormat: true, translated: "Memory 42%" },
  );
  await page.waitForFunction(
    () => document.querySelector("#luci-status")?.textContent === "Memory 42%",
  );
};
const hostState = (page) =>
  page.evaluate(() =>
    [".bar", ".token", ".details", ".icon-back", ".MuiButtonBase-root"].map(
      (selector) => {
        const el = document.querySelector(selector),
          css = getComputedStyle(el);
        return {
          selector,
          width: css.width,
          height: css.height,
          margin: css.margin,
          padding: css.padding,
          display: css.display,
          position: css.position,
          whiteSpace: css.whiteSpace,
          animation: css.animationName,
          before: getComputedStyle(el, "::before").display,
        };
      },
    ),
  );

const browser = await chromium.launch({ headless: true });
let baseline;
try {
  const page = await browser.newPage();
  await page.setContent(fixture);
  baseline = await hostState(page);
  const legacy = await page.addStyleTag({ content: source });
  assert.notDeepEqual(
    await hostState(page),
    baseline,
    "Fixture must reproduce legacy CSS pollution",
  );
  await legacy.evaluate((node) => node.remove());
  await page.addStyleTag({ content: compiled });
  assert.deepEqual(
    await hostState(page),
    baseline,
    "Video CSS must not restyle host UI",
  );
  await page.evaluate(() => {
    for (const className of ["trancy-container", "trancy-caption"]) {
      const ui = document.createElement("section");
      ui.className = className;
      ui.innerHTML =
        '<div class="bar"></div><span class="token">Subtitle</span><a class="icon-back">Back</a>';
      document.body.appendChild(ui);
    }
  });
  for (const owner of [".trancy-container", ".trancy-caption"]) {
    assert.equal(
      await page
        .locator(`${owner} .bar`)
        .evaluate((el) => getComputedStyle(el).width),
      "3px",
    );
    assert.equal(
      await page
        .locator(`${owner} .token`)
        .evaluate((el) => getComputedStyle(el).display),
      "inline-block",
    );
    assert.equal(
      await page
        .locator(`${owner} .icon-back`)
        .evaluate((el) => getComputedStyle(el).display),
      "flex",
    );
  }
} finally {
  await browser.close();
}

// Real manifest injection, not just a stylesheet loaded by the test.
const profile = fs.mkdtempSync(
  path.join(os.tmpdir(), "cheng-style-isolation-"),
);
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${path.join(root, "dist")}`,
      `--load-extension=${path.join(root, "dist")}`,
    ],
  });
  const errors = [];
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await context.route("http://192.168.1.1/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://192.168.1.1/cgi-bin/luci/admin/status/overview");
  await page.waitForFunction(() =>
    document.documentElement.hasAttribute("data-lexihalo-video-runtime"),
  );
  await page.waitForTimeout(1000);
  assert.deepEqual(
    await hostState(page),
    baseline,
    "Manifest CSS must preserve LuCI-style host elements",
  );
  assert.equal(
    await page
      .locator("#xt-toggle-button, trancy-caption-window, .lexihalo-audio-host")
      .count(),
    0,
    "Non-media pages must not receive video controls",
  );
  await assertLuciGlobals(page);
  assert.deepEqual(errors, []);
  assert.ok(worker, "Extension must be running");
  const options = await context.newPage();
  await options.goto(
    `chrome-extension://${new URL(worker.url()).hostname}/byok.html`,
  );
  await options.evaluate(async () => {
    for (const [key, value] of [
      ["subtitle", "en"],
      ["translation", "zh-CN"],
    ]) {
      await new Promise((resolve, reject) => {
        const uuid = crypto.randomUUID();
        const listener = (message) => {
          if (message.uuid !== uuid || !message.response) return;
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          message.response.message === "ok"
            ? resolve()
            : reject(new Error(JSON.stringify(message.response)));
        };
        const timer = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error("Language setup timeout"));
        }, 10000);
        chrome.runtime.onMessage.addListener(listener);
        chrome.runtime.sendMessage({
          from: "content",
          to: ["background"],
          name: "dispatch",
          body: { type: "setting/setLanguage", payload: { key, value } },
          uuid,
        });
      });
    }
  });
  await options.close();
  await context.route("https://media-style.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: fixture.replace(
        "</body>",
        `<div id="player" style="position:relative;width:640px;height:360px">
    <video controls style="width:640px;height:360px"></video></div><script>
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', {value: 60});
    const track = video.addTextTrack('subtitles', 'English', 'en');
    track.addCue(new VTTCue(0, 30, 'A subtitle for testing.')); track.mode = 'showing';
    </script></body>`,
      ),
    }),
  );
  await page.goto("https://media-style.example/watch");
  await page.locator("#xt-toggle-button .trancy-button-logo").waitFor();
  await page.waitForFunction(() => window.captionProvider?.lines?.length > 0);
  await page.locator("#xt-toggle-button .trancy-button-logo").click();
  await page.locator("#xt-toggle-button .trancy-panel-menu.visible").waitFor();
  assert.deepEqual(
    await hostState(page),
    baseline,
    "Host UI must remain unchanged even with the video menu open",
  );
  await assertLuciGlobals(page);
  assert.deepEqual(errors, []);
} finally {
  await context?.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(
  "Video CSS isolation: host classes preserved, extension UI styled, non-video LuCI fixture has no video controls.",
);
