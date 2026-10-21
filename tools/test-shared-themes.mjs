import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { themeIds, themes } from "./theme-system.mjs";
import { monitorExtensionErrors } from "./extension-error-monitor.mjs";

const root = process.cwd();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cheng-shared-theme-"));
const rgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16))
    .join(", ");
let context;
const errors = [];
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: false,
    colorScheme: "light",
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
  const extension = `chrome-extension://${new URL(worker.url()).hostname}`;
  const options = await context.newPage();
  await options.goto(`${extension}/byok.html`);
  const dispatch = (type, payload) =>
    options.evaluate(
      ({ type, payload }) =>
        new Promise((resolve, reject) => {
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
            reject(new Error("Theme dispatch timeout"));
          }, 10000);
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
  await dispatch("setting/setLanguage", { key: "subtitle", value: "en" });
  await dispatch("setting/setLanguage", { key: "translation", value: "zh-CN" });
  await context.route("https://shared-theme.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="background:rgb(255, 255, 255);color:rgb(0, 0, 0)"><p>Host page remains unchanged</p><div id="player" style="position:relative;width:640px;height:360px"><video controls style="width:640px;height:360px"></video></div><script>const video=document.querySelector('video');Object.defineProperty(video,'duration',{value:60});const track=video.addTextTrack('subtitles','English','en');track.addCue(new VTTCue(0,30,'Shared theme caption'));track.mode='showing';</script></body></html>`,
    }),
  );
  const reader = await context.newPage();
  reader.on("pageerror", (error) => errors.push(error.message));
  await reader.goto("https://shared-theme.example/watch");
  await reader.locator(".rd-float-btn").waitFor();
  await reader.locator("#xt-toggle-button .trancy-button-logo").waitFor();
  await reader.locator(".rd-float-btn-hover").hover();
  await reader.locator(".rd-quick-apps .btn-rd-app").first().click();
  await reader.locator("#trancy-root").waitFor();
  await reader.evaluate(() =>
    window.postMessage(
      { eventName: "trancy:slider-toggle", path: "/setting/theme-config" },
      "*",
    ),
  );
  await reader.locator('[data-cheng-theme-option="dark"]').waitFor();
  assert.equal(
    await reader.locator("[data-cheng-theme-option]").count(),
    themeIds.length,
  );

  const study = await context.newPage(),
    workspace = await context.newPage();
  for (const [page, file] of [
    [study, "study.html"],
    [workspace, "workspace.html"],
  ]) {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${extension}/${file}`);
  }
  await reader.evaluate((ids) => {
    const previews = document.createElement("div");
    previews.id = "video-theme-previews-fixture";
    previews.className = "trancy-page-setting";
    previews.hidden = true;
    previews.innerHTML =
      '<div class="page-setting-wrapper"><div class="item-theme-wrapper">' +
      ids
        .map(
          (id) =>
            `<div class="item-theme ${id}"><div class="item-box"><div class="top-box"><div class="subtitle-box"><span class="letter">Aa</span></div></div></div></div>`,
        )
        .join("") +
      "</div></div>";
    for (const node of previews.querySelectorAll("*"))
      node.style.transition = "none";
    document.body.appendChild(previews);
  }, themeIds);
  const waitPreference = async (page, id) =>
    page.waitForFunction(
      (id) => document.documentElement.dataset.chengTheme === id,
      id,
    );
  const paletteOf = (page, selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const css = getComputedStyle(el);
        return {
          surface: css.getPropertyValue("--cheng-surface").trim(),
          accent: css.getPropertyValue("--cheng-accent").trim(),
          ink: css.getPropertyValue("--cheng-ink").trim(),
          scheme: css.colorScheme,
        };
      });
  for (const id of themeIds) {
    const palette = themes[id === "auto" ? "light" : id];
    const preview = reader.locator(`.color-scheme.${id}`);
    assert.equal(
      await preview.evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.surface)})`,
      `${id}: preview surface`,
    );
    assert.equal(
      await preview
        .locator(".anker")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.accent)})`,
      `${id}: preview accent`,
    );
    assert.equal(
      await reader
        .locator(`#video-theme-previews-fixture .item-theme.${id} .item-box`)
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.surface)})`,
      `${id}: video preview surface`,
    );
    await reader.locator(`[data-cheng-theme-option="${id}"]`).click();
    for (const page of [reader, study, workspace])
      await waitPreference(page, id);
    await reader.locator(`.rd-float-btn.${id}`).waitFor();
    await reader.locator(`#trancy-root.${id}`).waitFor();
    const expected = {
      surface: palette.surface,
      accent: palette.accent,
      ink: palette.ink,
      scheme: palette.scheme,
    };
    for (const [page, selector] of [
      [reader, ".rd-float-btn"],
      [reader, "#xt-toggle-button"],
      [reader, "#trancy-root"],
      [study, "html"],
      [workspace, "html"],
    ]) {
      assert.deepEqual(
        await paletteOf(page, selector),
        expected,
        `${id}: ${selector} shares preview tokens`,
      );
    }
    await reader.locator("#xt-toggle-button .trancy-button-logo").click();
    await reader
      .locator("#xt-toggle-button .trancy-panel-menu.visible")
      .waitFor();
    assert.equal(
      await reader
        .locator("#xt-toggle-button .trancy-panel-menu")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.surface)})`,
      `${id}: actual video menu background`,
    );
    assert.equal(
      await reader
        .locator("#xt-toggle-button .trancy-menuitem-label")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      `rgb(${rgb(palette.ink)})`,
      `${id}: video menu text`,
    );
    const actions = await reader
      .locator(
        "#xt-toggle-button .trancy-primary-panel-menu .trancy-action-label",
      )
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.textContent.trim())
          .map((node) => getComputedStyle(node).color),
      );
    assert.ok(
      actions.length,
      "Check actual engine/language labels, not just the first menu label",
    );
    for (const color of actions)
      assert.equal(
        color,
        `rgb(${rgb(palette.ink)})`,
        `${id}: nested engine/language label`,
      );
    const glyph = reader.locator(
      "#xt-toggle-button .trancy-button-logo svg.lexihalo-brand-icon",
    );
    assert.equal(
      await glyph.evaluate((node) => getComputedStyle(node).color),
      `rgb(${rgb(palette.accent)})`,
      `${id}: video glyph follows theme accent`,
    );
    await reader.locator("#xt-toggle-button .trancy-button-logo").click();
    assert.equal(
      await study
        .locator(".subtitles")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.surface)})`,
    );
    assert.equal(
      await study
        .locator("textarea")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.surface)})`,
      `${id}: note editor`,
    );
    assert.equal(
      await workspace
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      `rgb(${rgb(palette.paper)})`,
    );
    assert.equal(
      await reader
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
      "Host website must not be themed",
    );
  }
  // The legacy video settings action updates the same preference in both directions.
  await dispatch("setting/setTheme", "dark");
  for (const page of [reader, study, workspace])
    await waitPreference(page, "dark");
  await workspace.reload();
  await waitPreference(workspace, "dark");
  assert.equal(
    (await paletteOf(workspace, "html")).surface,
    themes.dark.surface,
  );

  await dispatch("setEdreaderTheme", "auto");
  for (const page of [reader, study, workspace]) {
    await waitPreference(page, "auto");
    await page.emulateMedia({ colorScheme: "dark" });
  }
  for (const [page, selector] of [
    [reader, ".rd-float-btn"],
    [reader, "#xt-toggle-button"],
    [reader, ".color-scheme.auto"],
    [study, "html"],
    [workspace, "html"],
  ]) {
    assert.equal(
      (await paletteOf(page, selector)).surface,
      themes.dark.surface,
      `auto dark: ${selector}`,
    );
  }
  for (const page of [reader, study, workspace])
    await page.emulateMedia({ colorScheme: "light" });
  assert.equal(
    (await paletteOf(study, "html")).surface,
    themes.light.surface,
    "System theme changes apply without a reload",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Shared themes passed: every preview, Reader/video dock, study editor and workspace; live synchronization, persistence, system changes and host-page isolation.",
  );
} finally {
  await context?.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
