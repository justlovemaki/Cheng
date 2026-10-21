import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { themes } from "./theme-system.mjs";

const css = fs.readFileSync(
  new URL("../assets/edvideo.css", import.meta.url),
  "utf8",
);
const parse = (text) => {
  const numbers = text.match(/[\d.]+/g).map(Number);
  return [...numbers.slice(0, 3), numbers[3] ?? 1];
};
const blend = (front, back) =>
  front.slice(0, 3).map((n, i) => n * front[3] + back[i] * (1 - front[3]));
const luminance = (color) =>
  color.reduce((sum, n, i) => {
    const v = n / 255;
    return (
      sum +
      (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][i]
    );
  }, 0);
const contrast = (front, back) => {
  const a = luminance(front),
    b = luminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// Reproduce the deep legacy selectors that ordinary first-label assertions miss.
const fixture = `<div id="xt-toggle-button" class="trancy-html5-button trancy-floating">
<div class="trancy-button-container" data-lexihalo-menu-open="true">
<div class="trancy-button-logo"><svg class="lexihalo-brand-icon" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor"/></svg></div>
<div class="trancy-panel-menu visible"><div class="trancy-panel-menu-container"><div class="trancy-primary-panel-menu">
<div class="trancy-menuitem"><div class="trancy-menuitem-label" data-contrast>字幕语言</div><div class="trancy-menuitem-action"><span class="trancy-action-label" data-contrast>English</span><span class="trancy-menuitem-shrotcut" data-contrast>Alt+C</span></div></div>
<div class="trancy-menuitem-desc" data-contrast>音频识别与翻译说明</div>
<div class="trancy-menuitem"><span class="trancy-caption-keycap" data-contrast>Q</span></div>
<div class="trancy-menuitem-label"><div class="trancy-menuitem-label-info"><div class="trancy-menuitem-label-info-tooltip" style="display:block;opacity:1" data-contrast>字幕提示<span class="tc-shortcuts" data-contrast>Ctrl+E</span></div></div></div>
<div class="trancy-menuitem-focus-wrapper"><div class="trancy-menuitem-focus"><span class="trancy-menuitem-label" data-contrast>学习模式</span></div></div>
<div class="trancy-second-panel-menu-container"><div class="second-panel-menu-header"><div class="btn-back-panel-header"><span data-contrast>下载媒体</span></div><div class="btn-back-panel-action"><span data-contrast>刷新</span></div></div>
<div class="lexihalo-video-download-panel"><span class="lexihalo-download-format-title" data-contrast>1080p MP4</span><span class="lexihalo-download-format-meta" data-contrast>视频与音轨</span><div class="lexihalo-download-status"><span class="trancy-menuitem-label" data-contrast>准备下载</span></div><span class="lexihalo-download-progress-value" data-contrast>50%</span><div class="lexihalo-download-status done"><span class="trancy-menuitem-label" data-contrast>下载完成</span></div><div class="lexihalo-download-status error"><span class="trancy-menuitem-label" data-contrast>下载失败</span></div></div>
</div></div></div></div></div></div>`;

const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  const page = await browser.newPage();
  await page.setContent(fixture);
  await page.addStyleTag({ content: css });
  await page.addStyleTag({
    content:
      "#xt-toggle-button, #xt-toggle-button * { transition: none !important; animation: none !important; }",
  });
  for (const [id, palette] of Object.entries(themes)) {
    for (const videoBackground of ["rgb(0, 0, 0)", "rgb(255, 255, 255)"]) {
      await page.evaluate(
        ({ id, videoBackground }) => {
          document.documentElement.dataset.chengTheme = id;
          document.body.style.background = videoBackground;
        },
        { id, videoBackground },
      );
      const rows = await page.locator("[data-contrast]").evaluateAll((nodes) =>
        nodes.map((el) => {
          const chain = [];
          for (let parent = el; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            chain.unshift({
              bg: style.backgroundColor,
              opacity: Number(style.opacity),
            });
          }
          return {
            text: el.textContent,
            color: getComputedStyle(el).color,
            chain,
          };
        }),
      );
      for (const row of rows) {
        let bg = [255, 255, 255];
        for (const layer of row.chain) {
          assert.equal(
            layer.opacity,
            1,
            `${id}: ${row.text} must not be faded by an ancestor`,
          );
          bg = blend(parse(layer.bg), bg);
        }
        const ratio = contrast(blend(parse(row.color), bg), bg);
        assert.ok(
          ratio >= 4.5,
          `${id}: ${row.text} contrast ${ratio.toFixed(2)} < 4.5:1 on ${videoBackground}`,
        );
        checks++;
      }
      const glyph = await page
        .locator(".trancy-button-logo")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          bg: getComputedStyle(el).backgroundColor,
          stroke: getComputedStyle(el.querySelector("circle")).stroke,
        }));
      assert.equal(
        glyph.stroke,
        glyph.color,
        `${id}: glyph must use theme color, not a fixed PNG`,
      );
      assert.ok(
        contrast(parse(glyph.color).slice(0, 3), parse(glyph.bg).slice(0, 3)) >=
          3,
        `${id}: icon contrast >= 3:1`,
      );
      assert.equal(
        await page
          .locator(".trancy-panel-menu")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        `rgb(${palette.surface
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16))
          .join(", ")})`,
        "Menu must have an opaque theme background",
      );
    }
  }
  // Only the closed-menu icon fades; its menu-bearing ancestor stays opaque.
  await page
    .locator(".trancy-button-container")
    .evaluate((el) => (el.dataset.lexihaloMenuOpen = "false"));
  await page.mouse.move(1200, 700);
  assert.equal(
    await page
      .locator("#xt-toggle-button")
      .evaluate((el) => getComputedStyle(el).opacity),
    "1",
  );
  assert.equal(
    await page
      .locator(".trancy-button-logo")
      .evaluate((el) => getComputedStyle(el).opacity),
    "0.25",
  );
  console.log(
    `Video contrast passed: ${checks} text checks >= 4.5:1, themed glyph >= 3:1, bright/dark video backgrounds, idle icon fading and opaque open menus.`,
  );
} finally {
  await browser.close();
}
