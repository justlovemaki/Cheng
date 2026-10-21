import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { themes } from "./theme-system.mjs";
const rgb = (hex) =>
  `rgb(${hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16))
    .join(", ")})`;
const root = process.cwd(),
  profile = path.join(root, ".pi/cheng-theme-profile");
fs.rmSync(profile, { recursive: true, force: true });
const errors = [];
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
  const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker")),
    id = new URL(worker.url()).hostname;
  const pages = [
    {
      file: "workspace.html?view=materials",
      surface: ".panel",
      primary: "#capture",
      mark: ".brand img",
    },
    {
      file: "study.html",
      surface: ".subtitles",
      primary: null,
      mark: "header .cheng-brand-icon",
    },
    {
      file: "byok.html",
      surface: ".card",
      primary: "button.primary",
      mark: ".cheng-mark",
    },
    {
      file: "site-rules.html",
      surface: ".card",
      primary: "button.primary",
      mark: ".cheng-mark",
    },
    {
      file: "popup.html",
      surface: ".trancy-popup",
      primary: ".trancy-popup-btn.primary",
      mark: ".cheng-brand-icon",
    },
  ];
  for (const entry of pages) {
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      errors.push(`${entry.file}: ${error.message}`),
    );
    await page.goto(`chrome-extension://${id}/${entry.file}`);
    await page.locator(entry.surface).first().waitFor({ state: "attached" });
    const visual = await page.evaluate(({ surface, primary, mark }) => {
      const body = getComputedStyle(document.body),
        card = getComputedStyle(document.querySelector(surface)),
        button = primary
          ? getComputedStyle(document.querySelector(primary))
          : null,
        node = document.querySelector(mark);
      return {
        bodyBg: body.backgroundColor,
        bodyColor: body.color,
        font: body.fontFamily,
        surfaceBg: card.backgroundColor,
        radius: card.borderRadius,
        primary: button?.backgroundColor,
        mark:
          node?.textContent.trim() ||
          node?.alt ||
          node?.querySelector?.("img")?.alt,
        accent: getComputedStyle(document.documentElement)
          .getPropertyValue("--cheng-accent")
          .trim(),
      };
    }, entry);
    assert.equal(visual.bodyBg, "rgb(247, 247, 241)", `${entry.file} paper`);
    assert.equal(visual.bodyColor, "rgb(38, 61, 53)", `${entry.file} ink`);
    assert.ok(
      /system-ui|Segoe UI|Arial/i.test(visual.font),
      `${entry.file} font: ${visual.font}`,
    );
    assert.equal(visual.accent, "#386753");
    if (entry.file !== "popup.html")
      assert.equal(
        visual.surfaceBg,
        "rgb(255, 254, 251)",
        `${entry.file} surface`,
      );
    if (entry.primary)
      assert.equal(visual.primary, "rgb(56, 103, 83)", `${entry.file} primary`);
    assert.ok(visual.mark?.includes("澄"), `${entry.file} brand mark`);
    await page.close();
  }
  await context.route("https://cheng-theme.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: route.request().url().endsWith("/video")
        ? `<!doctype html><html><body><video controls style="width:640px;height:360px"></video><script>const track=document.querySelector('video').addTextTrack('subtitles','English','en');track.mode='showing';track.addCue(new VTTCue(0,2,'Theme caption'));</script></body></html>`
        : "<!doctype html><html><body><p>Reader theme fixture</p></body></html>",
    }),
  );
  const reader = await context.newPage();
  await reader.goto("https://cheng-theme.example/article");
  await reader.locator(".rd-float-btn").waitFor();
  const dock = await reader.locator(".rd-float-btn").evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    radius: getComputedStyle(node).borderRadius,
  }));
  assert.equal(dock.background, "rgba(56, 103, 83, 0.18)");
  assert.equal(dock.radius, "10px 0px 0px 10px");
  const fixedIcon = reader.locator(".rd-float-btn .fix-rd-app .t-icon svg");
  const closeButton = reader.locator(".rd-float-btn .btn-float-close");
  await closeButton.evaluate((node) => {
    node.style.transition = "none";
  });
  const originalDockClass = await reader
    .locator(".rd-float-btn")
    .getAttribute("class");
  for (const theme of ["light", "dark", "auto"]) {
    const palette = themes[theme === "auto" ? "light" : theme];
    const accent = rgb(palette.accent);
    const close = accent.replace("rgb(", "rgba(").replace(")", ", 0.3)");
    await reader.locator(".rd-float-btn").evaluate((node, theme) => {
      node.classList.remove("light", "dark", "auto");
      node.classList.add(theme);
    }, theme);
    await reader.mouse.move(0, 0);
    await fixedIcon.evaluate((node) => {
      // Ignore color interpolation when verifying the final theme token.
      node.style.transition = "none";
    });
    assert.equal(
      await fixedIcon.evaluate((node) => getComputedStyle(node).fill),
      accent,
      `${theme}: idle translation icon must match its palette`,
    );
    assert.equal(
      await closeButton.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      ),
      close,
      `${theme}: close button must match its palette`,
    );
    await reader.locator(".rd-float-btn .fix-rd-app").hover();
    assert.equal(
      await fixedIcon.evaluate((node) => getComputedStyle(node).fill),
      accent,
      `${theme}: hovered translation icon must match its palette`,
    );
  }
  await reader.locator(".rd-float-btn").evaluate((node, className) => {
    node.className = className;
  }, originalDockClass);
  // Provider icons use a nested path rule, separate from the toolbar SVG rule.
  await reader.locator(".rd-float-btn").evaluate((node) => {
    const button = document.createElement("div");
    button.className = "btn-rd-app show";
    button.id = "theme-provider-icon-fixture";
    button.innerHTML =
      '<span class="t-icon"><span class="svg-icon"><svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg></span></span>';
    button.querySelector("path").style.transition = "none";
    node.appendChild(button);
  });
  await reader.locator("#theme-provider-icon-fixture").hover();
  assert.equal(
    await reader
      .locator("#theme-provider-icon-fixture path")
      .evaluate((node) => getComputedStyle(node).fill),
    "rgb(56, 103, 83)",
    "Hovered provider paths must not override the green SVG color with purple",
  );
  await reader
    .locator("#theme-provider-icon-fixture")
    .evaluate((node) => node.remove());
  await reader.locator(".rd-float-btn-hover").hover();
  await reader.locator(".rd-quick-apps .btn-rd-app").first().click();
  await reader.locator("#trancy-root").waitFor();
  const tokens = await reader.locator("#trancy-root").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      primary: style.getPropertyValue("--rd-primary").trim(),
      surface: style.getPropertyValue("--rd-bg-0").trim(),
    };
  });
  assert.equal(tokens.primary, "#386753");
  assert.equal(tokens.surface, "#fffefb");
  const bridge = await context.newPage();
  await bridge.goto(`chrome-extension://${id}/byok.html`);
  for (const [key, value] of [
    ["subtitle", "en"],
    ["translation", "zh-CN"],
  ])
    await bridge.evaluate(
      ({ key, value }) =>
        new Promise((resolve, reject) => {
          const uuid = crypto.randomUUID(),
            timer = setTimeout(
              () => reject(new Error("dispatch timeout")),
              10000,
            ),
            listener = (message) => {
              if (message.uuid === uuid && message.response) {
                clearTimeout(timer);
                chrome.runtime.onMessage.removeListener(listener);
                resolve();
              }
            };
          chrome.runtime.onMessage.addListener(listener);
          chrome.runtime.sendMessage({
            from: "content",
            to: ["background"],
            name: "dispatch",
            body: { type: "setting/setLanguage", payload: { key, value } },
            uuid,
          });
        }),
      { key, value },
    );
  await bridge.close();
  const video = await context.newPage();
  await video.goto("https://cheng-theme.example/video");
  await video.locator("#xt-toggle-button .trancy-button-logo").waitFor();
  await video.locator("#xt-toggle-button .trancy-button-logo").click();
  await video.locator("#xt-toggle-button .trancy-panel-menu.visible").waitFor();
  const videoVisual = await video
    .locator("#xt-toggle-button .trancy-panel-menu")
    .evaluate((node) => {
      const style = getComputedStyle(node),
        label = getComputedStyle(node.querySelector(".trancy-menuitem-label"));
      return {
        background: style.backgroundColor,
        radius: style.borderRadius,
        border: style.borderColor,
        label: label.color,
      };
    });
  assert.equal(videoVisual.background, "rgb(255, 254, 251)");
  assert.equal(videoVisual.radius, "10px");
  assert.equal(videoVisual.border, "rgb(220, 227, 217)");
  assert.equal(videoVisual.label, "rgb(38, 61, 53)");
  assert.deepEqual(errors, []);
  console.log(
    "Cheng visual system passed: workspace, side panel, BYOK, site rules, popup, Reader dock/settings and video menu share paper/ink/green/surface tokens.",
  );
} finally {
  await context?.close();
}
