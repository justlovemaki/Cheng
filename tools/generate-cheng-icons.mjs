import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const root = process.cwd(),
  source = fs.readFileSync(path.join(root, "assets/logo.svg"), "utf8");
const targets = new Map([
  ...[16, 32, 48, 96, 128, 256, 512].map((size) => [
    `assets/icons/ic${size}.png`,
    size,
  ]),
  ["assets/icons/lexihalo-1024.png", 1024],
  ...[48, 64, 96, 128, 256, 512].map((size) => [
    `assets/icons/mac/safari_${size}.png`,
    size,
  ]),
  ...[16, 19, 32, 38, 48, 72].map((size) => [
    `assets/icons/mac/safari_toolbar_${size}.png`,
    size,
  ]),
]);
const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: true,
});
try {
  for (const [relative, size] of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${source}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.screenshot({
      path: path.join(root, relative),
      omitBackground: true,
      type: "png",
      timeout: 120000,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Generated ${targets.size} Cheng icons from assets/logo.svg.`);
