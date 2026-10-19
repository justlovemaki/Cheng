import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { monitorExtensionErrors } from "./extension-error-monitor.mjs";
import { attachExtensionPanel } from "./extension-panel.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = path.join(root, ".pi/floating-controls-profile");
fs.rmSync(profile, { recursive: true, force: true });
let context;
const errors = [];
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
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await monitorExtensionErrors(context, worker, errors);
  const extensionId = new URL(worker.url()).hostname;
  const openPanel = async (click) => {
    const tabCount = context.pages().length;
    await click();
    const panel = await attachExtensionPanel(
      context,
      `chrome-extension://${extensionId}/study.html`,
      errors,
    );
    await panel.waitFor(
      () =>
        !!globalThis.ChengLearning?.studyPanel?.current &&
        document.querySelector("#engine").options.length > 0,
    );
    assert.equal(
      context.pages().length,
      tabCount,
      "Learning must stay beside the original video, not open a new tab",
    );
    assert.equal(
      await panel.evaluate(
        () => document.querySelector("#source-tabs") === null,
      ),
      true,
      "No manual video-tab selection",
    );
    assert.equal(
      await panel.evaluate(() =>
        document
          .querySelector("#connection")
          .textContent.includes("Cannot read properties"),
      ),
      false,
      "Empty/non-video pages must show a friendly state",
    );
    await panel.close();
  };
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/byok.html`);
  // Do not seed language preferences before testing a fresh profile. The dock
  // must be available so users can open language/settings in the first place.
  await context.route("https://cheng-controls.example/fresh", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><p>Fresh profile without configured languages.</p></body></html>",
    }),
  );
  const fresh = await context.newPage();
  fresh.on("pageerror", (error) =>
    errors.push(`fresh: ${error.stack || error.message}`),
  );
  await fresh.goto("https://cheng-controls.example/fresh");
  await fresh.locator(".rd-float-btn").waitFor({ timeout: 5000 });
  assert.equal(
    await fresh.locator(".rd-quick-apps .btn-rd-app").count(),
    3,
    "Keep settings and quick translation; add learning as a third entry",
  );
  assert.equal(
    await fresh.locator(".rd-float-btn .fix-rd-app").count(),
    1,
    "Keep the original immersive-translation control",
  );
  await openPanel(() =>
    fresh.locator(".rd-float-btn [data-cheng-workspace]").click(),
  );
  await fresh.locator(".rd-float-btn-hover").hover();
  await fresh.locator(".rd-quick-apps .btn-rd-app").first().click();
  await fresh.locator("#trancy-root").waitFor();
  await fresh.close();
  const dispatch = (type, payload) =>
    options.evaluate(
      ({ type, payload }) =>
        new Promise((resolve, reject) => {
          const uuid = crypto.randomUUID();
          const timer = setTimeout(
            () => reject(new Error("dispatch timeout")),
            10000,
          );
          const listener = (message) => {
            if (message.uuid !== uuid || !message.response) return;
            clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(listener);
            message.response.message === "ok"
              ? resolve()
              : reject(new Error(JSON.stringify(message.response)));
          };
          chrome.runtime.onMessage.addListener(listener);
          chrome.runtime.sendMessage({
            from: "content",
            to: ["background"],
            name: "dispatch",
            body: { type, payload },
            uuid,
          });
        }),
      { type, payload },
    );
  for (const [key, value] of [
    ["subtitle", "en"],
    ["translation", "zh-CN"],
  ])
    await dispatch("setting/setLanguage", { key, value });
  await context.route("https://cheng-controls.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: route.request().url().endsWith("/video")
        ? `<!doctype html><html><body><video controls style="width:640px;height:360px"></video><script>
        const video=document.querySelector('video');
        const track=video.addTextTrack('subtitles','English','en');track.mode='showing';
        track.addCue(new VTTCue(0,2,'Control test caption'));
      </script></body></html>`
        : "<!doctype html><html><body><p>Original floating controls must continue to open the original settings.</p></body></html>",
    }),
  );
  await context.route("https://www.youtube.com/about", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><p>Video-site page must retain the original edge dock.</p></body></html>",
    }),
  );
  const videoHost = await context.newPage();
  videoHost.on("pageerror", (error) =>
    errors.push(`video-host: ${error.stack || error.message}`),
  );
  await videoHost.goto("https://www.youtube.com/about");
  await videoHost.locator(".rd-float-btn").waitFor();
  const edge = await videoHost.locator(".rd-float-btn").evaluate((node) => ({
    right: getComputedStyle(node).right,
    position: getComputedStyle(node).position,
  }));
  assert.deepEqual(edge, { right: "0px", position: "fixed" });
  await videoHost.close();
  // Explicit user choices still win; restoring availability is not a forced reset.
  for (const type of ["disabled", "blacklisted"]) {
    await dispatch("setControlCenterEnable", type !== "disabled");
    await dispatch(
      "setControlCenterBlackList",
      type === "blacklisted" ? ["cheng-controls.example"] : [],
    );
    const hidden = await context.newPage();
    await hidden.goto(`https://cheng-controls.example/${type}`);
    await hidden
      .locator('html[data-lexihalo-reader-runtime="readable"]')
      .waitFor();
    await hidden.waitForTimeout(700);
    assert.equal(
      await hidden.locator(".rd-float-btn").count(),
      0,
      `${type}: honor the user's floating-bar preference`,
    );
    await hidden.close();
  }
  await dispatch("setControlCenterEnable", true);
  await dispatch("setControlCenterBlackList", []);
  const article = await context.newPage();
  article.on("pageerror", (error) =>
    errors.push(`article: ${error.stack || error.message}`),
  );
  await article.goto("https://cheng-controls.example/article");
  const floating = article.locator(".rd-float-btn");
  await floating.waitFor();
  await floating.locator(".rd-float-btn-hover").hover();
  await floating.locator(".rd-quick-apps .btn-rd-app").first().click();
  await article.locator("#lexihalo-global-cache-group").waitFor();
  assert.equal(
    await article.locator("#cheng-learning-entry").count(),
    0,
    "Do not add a second floating toolbar",
  );
  const articleTabId = await options.evaluate(
    async (address) =>
      (await chrome.tabs.query({})).find((tab) => tab.url === address).id,
    article.url(),
  );
  assert.equal(
    await options.evaluate(
      (tabId) => chrome.action.getPopup({ tabId }),
      articleTabId,
    ),
    "",
    "Keep the original action-click settings behavior on supported pages",
  );
  assert.equal(
    await article.locator("#trancy-root [data-cheng-workspace]").count(),
    0,
    "The console entry belongs to the original edge dock, not settings content",
  );
  await article.locator(".rd-slider-bar .item-quick-action").first().click();
  await article.locator("#trancy-root").waitFor({ state: "detached" });
  const dockEntry = floating.getByRole("button", {
    name: "学习控制台",
    exact: true,
  });
  await dockEntry.waitFor();
  await openPanel(() => dockEntry.click());
  await floating.locator(".rd-float-btn-hover").hover();
  await floating.locator(".rd-quick-apps .btn-rd-app").first().click();
  await article.locator("#lexihalo-global-cache-group").waitFor();
  assert.equal(
    await article.locator("#lexihalo-global-cache-group").count(),
    1,
    "Opening the workbench must not replace existing settings",
  );
  const video = await context.newPage();
  video.on("pageerror", (error) =>
    errors.push(`video: ${error.stack || error.message}`),
  );
  await video.goto("https://cheng-controls.example/video");
  await video.locator("#xt-toggle-button .trancy-button-logo").waitFor();
  await video.locator("#xt-toggle-button .trancy-button-logo").click();
  await video.locator("#xt-toggle-button .trancy-panel-menu.visible").waitFor();
  assert.equal(
    await video.locator("#xt-toggle-button [data-cheng-workspace]").count(),
    0,
    "The video floating menu must not contain the learning-console entry",
  );
  assert.equal(await video.locator("#cheng-learning-entry").count(), 0);
  await video.locator("#xt-toggle-button .trancy-button-logo").click();
  await openPanel(() =>
    video
      .locator(".rd-float-btn")
      .getByRole("button", { name: "学习控制台", exact: true })
      .click(),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.action.default_popup,
    undefined,
    "Do not globally replace action clicks with the workbench popup",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Edge-dock console opens and initializes with zero page/background exceptions; original reader/video controls remain compatible.",
  );
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await context?.close();
}
