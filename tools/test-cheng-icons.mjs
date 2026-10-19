import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd(),
  manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  ),
  logo = fs.readFileSync(path.join(root, "assets/logo.svg"), "utf8");
assert.match(logo, /#386753/);
assert.match(logo, /circle cx="32" cy="21"/);
assert.match(logo, /C20\.2 19\.6/);
assert.doesNotMatch(logo, /#4338CA|#7C3AED|#071A3D/i);
const dimensions = (file) => {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
};
const main = Object.entries(manifest.icons);
for (const [size, relative] of main) {
  const result = dimensions(path.join(root, relative));
  assert.equal(result.width, Number(size), relative);
  assert.equal(result.height, Number(size), relative);
  const dist = dimensions(path.join(root, "dist", relative));
  assert.equal(dist.hash, result.hash, `${relative} dist drift`);
}
for (const [relative, size] of [
  ["assets/icons/lexihalo-1024.png", 1024],
  ...[48, 64, 96, 128, 256, 512].map((size) => [
    `assets/icons/mac/safari_${size}.png`,
    size,
  ]),
  ...[16, 19, 32, 38, 48, 72].map((size) => [
    `assets/icons/mac/safari_toolbar_${size}.png`,
    size,
  ]),
]) {
  const result = dimensions(path.join(root, relative));
  assert.equal(result.width, size);
  assert.equal(result.height, size);
}
const control = fs.readFileSync(
  path.join(root, "src/reader/control/ControlCenterWidget.js"),
  "utf8",
);
assert.match(control, /cx: 12/);
assert.match(control, /cy: 7/);
assert.match(control, /M3\.5 8\.5c3\.3-1\.2/);
assert.match(control, /cheng-study-button/);
const video = fs.readFileSync(
  path.join(root, "src/video/ui/VideoToggleButton.js"),
  "utf8",
);
assert.match(video, /assets\/icons\/ic48\.png/);
console.log(
  "Cheng icon system passed: green halo/book brand at every manifest/Safari size, matching dock and video identities, with dist hash parity.",
);
