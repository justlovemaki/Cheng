import fs from "node:fs";

export const themes = JSON.parse(
  fs.readFileSync(new URL("../config/themes.json", import.meta.url), "utf8"),
);
export const themeIds = ["auto", ...Object.keys(themes)];
const rgba = (hex, alpha) =>
  `rgba(${hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16))
    .join(", ")}, ${alpha})`;
const rule = (selector, values) =>
  `${selector} {\n${Object.entries(values)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n")}\n}\n`;
function tokens(p) {
  return {
    "--cheng-scheme": p.scheme,
    "color-scheme": p.scheme,
    "--cheng-paper": p.paper,
    "--cheng-surface": p.surface,
    "--cheng-surface-soft": p.soft,
    "--cheng-ink": p.ink,
    "--cheng-text": p.ink,
    "--cheng-muted": p.muted,
    "--cheng-accent": p.accent,
    "--cheng-accent-hover": p.hover,
    "--cheng-accent-soft": p.soft,
    "--cheng-primary-ink": p.scheme === "dark" ? p.paper : "#ffffff",
    "--cheng-border": p.border,
    "--cheng-border-strong": p.border,
    "--cheng-danger": p.scheme === "dark" ? "#ffaaa0" : "#9c4339",
    "--cheng-focus": rgba(p.accent, 0.2),
    "--cheng-shadow": "0 5px 18px rgba(0, 0, 0, 0.16)",
    "--cheng-menu-bg": rgba(p.surface, 0.97),
    "--cheng-dock-bg": rgba(p.accent, 0.18),
    "--cheng-close-bg": rgba(p.accent, 0.3),
    "--cheng-ink-90": rgba(p.ink, 0.9),
    "--cheng-ink-70": rgba(p.ink, 0.7),
  };
}
function legacyTokens(p, area) {
  const values = tokens(p);
  if (area === "reader") {
    for (let n = 100; n >= 30; n -= 10)
      values[`--rd-text-${n}`] = n === 100 ? p.ink : rgba(p.ink, n / 100);
    for (const n of [20, 15, 10, "08", "06", "05"])
      values[`--rd-border-${n}`] = rgba(p.ink, Number(n) / 100);
    Object.assign(values, {
      "--rd-primary": p.accent,
      "--purple": p.accent,
      "--icon-purple": p.accent,
      "--rd-bg-0": p.surface,
      "--rd-bg-1": p.paper,
      "--rd-bg-2": p.soft,
      "--rd-bg-3": p.soft,
      "--rd-bg-4": p.border,
      "--rd-card-bg": rgba(p.surface, 0.97),
      "--rd-border-slider": p.border,
      "--rd-shimmer-bg": p.soft,
      "--scrollbar-thumb": rgba(p.accent, 0.24),
      "--scrollbar-track": rgba(p.ink, 0.04),
      "--gd": `linear-gradient(90deg, ${p.accent}, ${p.hover})`,
      "--openai": `linear-gradient(90deg, ${p.accent}, ${p.hover})`,
    });
  } else {
    for (let n = 100; n >= 10; n -= 10)
      values[`--text-${n}`] = n === 100 ? p.ink : rgba(p.ink, n / 100);
    for (const n of [50, 40, 30, 20, 15, 10, "06", "05", "04"])
      values[`--border-${n}`] = rgba(p.ink, Number(n) / 100);
    Object.assign(values, {
      "--bg-0": p.surface,
      "--bg-1": p.surface,
      "--bgf": p.soft,
      "--root-bg": p.paper,
      "--bg-avatar": p.soft,
      "--card-bg": p.surface,
      "--card-border": `1px solid ${p.border}`,
      "--anker": p.accent,
      "--anker-hover": p.hover,
      "--anker-text": values["--cheng-primary-ink"],
      "--active-subtitle": p.accent,
      "--hightlight-word": p.accent,
      "--word-popup-bg": p.accent,
      "--word-popup-text": values["--cheng-primary-ink"],
      "--purple": p.accent,
      "--green": p.accent,
      "--switch-hover": p.soft,
      "--controller-bg": rgba(p.surface, 0.9),
      "--controller-timeline-bg": p.soft,
      "--controller-timeline-hover": p.border,
      "--readmode-bg": rgba(p.surface, 0.78),
    });
  }
  return values;
}
function selectors(id, area) {
  if (area === "pages") return `:root[data-cheng-theme="${id}"]`;
  if (area === "reader")
    return `#trancy-root.${id}, .rd-theme.${id}, .color-scheme.${id}`;
  const owned = [
    "#xt-toggle-button",
    "trancy-caption-window",
    "trancy-caption-setting",
    "trancy-caption-summary",
    ".trancy-container",
  ];
  return [
    `.trancy-container.${id}`,
    ...owned.map((node) => `html[data-cheng-theme="${id}"] ${node}`),
    `.trancy-page-setting .page-setting-wrapper .item-theme-wrapper .item-theme.${id}`,
  ].join(", ");
}
export function compileThemeCss(source, filename) {
  const area = {
    "cheng-theme.css": "pages",
    "edreader.css": "reader",
    "edvideo.css": "video",
  }[filename];
  if (!area) return source;
  let css =
    "\n/* Generated from config/themes.json — previews and live UI share these tokens. */\n";
  for (const id of themeIds) {
    const palette = themes[id === "auto" ? "light" : id];
    css += rule(
      selectors(id, area),
      area === "pages" ? tokens(palette) : legacyTokens(palette, area),
    );
  }
  css += `@media (prefers-color-scheme: dark) {\n${rule(selectors("auto", area), area === "pages" ? tokens(themes.dark) : legacyTokens(themes.dark, area))}}\n`;
  if (area === "reader") {
    css += `.rd-slider-inside .color-scheme[class] { background: var(--cheng-surface) !important; border-color: var(--cheng-border) !important; }
.rd-slider-inside .color-scheme[class] .anker { background: var(--cheng-accent) !important; }
.rd-slider-inside .color-scheme[class] .letter { color: var(--cheng-ink) !important; }
`;
  }
  return source + css;
}
