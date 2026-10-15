import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { recoverDualSubtitleSettings } from "../src/reader/settings/DualSubtitleSettings.js";

const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../config/media-platforms.json", import.meta.url),
    "utf8",
  ),
);
const stylesheet = fs.readFileSync(
  new URL("../src/styles/edreader.css", import.meta.url),
  "utf8",
);
const importedIcons = JSON.parse(
  fs.readFileSync(
    new URL("../assets/platform/sources.json", import.meta.url),
    "utf8",
  ),
);
for (const asset of importedIcons) {
  const data = fs.readFileSync(
    new URL(`../assets/platform/${asset.file}`, import.meta.url),
  );
  assert.equal(
    data.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `${asset.id}: not a PNG`,
  );
  assert.equal(
    createHash("sha256").update(data).digest("hex"),
    asset.sha256,
    `${asset.id}: icon checksum mismatch`,
  );
  assert.ok(asset.source.startsWith("https://"));
}
const context = {};
vm.runInNewContext(
  fs
    .readFileSync(
      new URL("../src/shared/platform-capabilities.js", import.meta.url),
      "utf8",
    )
    .replace(
      "const PLATFORM_CATALOG = [];",
      `const PLATFORM_CATALOG = ${JSON.stringify(catalog)};`,
    ),
  context,
);
const previous = globalThis.lexihaloPlatformCapabilities;
globalThis.lexihaloPlatformCapabilities = context.lexihaloPlatformCapabilities;

const jsx = (type, props, key) => ({ type, props, key });
const nodes = (node) =>
  node && typeof node === "object"
    ? [node, ...[node.props?.children].flat().flatMap(nodes)]
    : [];
const render = (language = "zh-CN", enabled = true) =>
  recoverDualSubtitleSettings({
    Br: (value) => ({ type: "toggle", value }),
    Ta: () => null,
    aa: () => null,
    jsxRuntime: { jsx, jsxs: jsx },
    useApiClient: () => {},
    useAppSelector: (selector) =>
      selector({
        setting: {
          language: { interface: language },
          dualSubtitleEnabled: enabled,
        },
      }),
    useDispatchBridge: () => ({ dispatch: () => {} }),
    useLocale: () => ({ locale: (key) => key }),
    useSliderNavigation: () => ({ navigate: () => {} }),
  })({});

try {
  const rendered = nodes(render());
  const cards = rendered.filter(
    (node) => node.props?.className === "support-platform-item",
  );
  assert.equal(cards.length, catalog.length);
  assert.deepEqual(
    cards.map((card) => card.props["data-platform-id"]),
    catalog.map((entry) => entry.id),
  );
  cards.forEach((card, index) => {
    const platform = catalog[index];
    const homepage = new URL(platform.homepage);
    assert.equal(homepage.protocol, "https:");
    assert.equal(homepage.username, "");
    assert.equal(homepage.password, "");
    assert.ok(
      platform.hosts.some(
        (host) =>
          homepage.hostname === host || homepage.hostname.endsWith(`.${host}`),
      ),
      `Homepage is outside platform domains: ${platform.id}`,
    );
    assert.equal(card.props.href, platform.homepage);
    assert.equal(card.props.title, platform.homepage);
    assert.equal(card.props.target, "_blank");
    assert.equal(card.props.rel, "noopener noreferrer");
    assert.equal(card.key, platform.id);
    assert.equal(card.props.children[1].props.children, platform.name);
    const icon = card.props.children[0];
    assert.ok(
      !icon.props.className.includes("platform-icon-fallback"),
      `Real icon missing: ${platform.id}`,
    );
    assert.equal(icon.props.children, null);
    const iconClass = icon.props.className
      .split(" ")
      .find((value) => value.startsWith("p_"));
    const selector = `.support-platform .support-platform-item .platform-icon${iconClass ? `.${iconClass}` : ""}`;
    const ruleStart = stylesheet.indexOf(`${selector} {`);
    assert.ok(ruleStart >= 0, `Missing icon CSS: ${platform.id}`);
    const rule = stylesheet.slice(
      ruleStart,
      stylesheet.indexOf("}", ruleStart),
    );
    const filename = rule.match(
      /background-image: url\("chrome-extension:\/\/__MSG_@@extension_id__\/assets\/platform\/([^"/]+)"\)/,
    )?.[1];
    assert.ok(filename, `Icon must use a bundled local image: ${platform.id}`);
    assert.ok(
      fs.statSync(new URL(`../assets/platform/${filename}`, import.meta.url))
        .size > 0,
    );
    const imported = importedIcons.find((asset) => asset.id === platform.id);
    if (imported) assert.equal(filename, imported.file);
  });
  assert.equal(
    rendered.find((node) => node.type === "input").props.checked,
    true,
  );
  assert.equal(
    nodes(render("zh-CN", false)).find((node) => node.type === "input").props
      .checked,
    false,
  );
  for (const [locale, fragment] of [
    ["zh-CN", "音频站点"],
    ["zh-Hant", "音訊網站"],
    ["en", "Audio sites"],
    ["ja", "Audio sites"],
  ]) {
    const note = nodes(render(locale)).find(
      (node) => node.props?.className === "tips support-platform-note",
    );
    assert.ok(note.props.children.includes(fragment));
    assert.ok(note.props.children.includes("HTML5"));
    assert.ok(note.props.children.includes("DRM"));
  }
  // Adding a catalog entry must not require editing the settings component.
  globalThis.lexihaloPlatformCapabilities = {
    catalog: [
      ...catalog,
      {
        id: "new-site",
        name: "New Site",
        hosts: ["new.example.com"],
        homepage: "https://www.new.example.com/explore",
      },
    ],
  };
  const added = nodes(render()).find(
    (node) => node.props?.["data-platform-id"] === "new-site",
  );
  assert.equal(added.props.href, "https://www.new.example.com/explore");
  assert.equal(added.props.children[0].props.children, "NE");
  console.log(
    `Dual subtitle settings tests passed (${catalog.length} catalog platforms + dynamic entry)`,
  );
} finally {
  if (previous === undefined) delete globalThis.lexihaloPlatformCapabilities;
  else globalThis.lexihaloPlatformCapabilities = previous;
}
