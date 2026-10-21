// Read only the public theme preference; never expose settings or API keys.
(() => {
  "use strict";
  const themes = new Set([
    "auto",
    "light",
    "dark",
    "desert",
    "terra",
    "nautilus",
    "dragon",
    "tuber",
  ]);
  const apply = (value) =>
    document.documentElement?.setAttribute(
      "data-cheng-theme",
      themes.has(value) ? value : "auto",
    );
  apply("auto");
  let revision = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.cheng_theme) return;
    revision++;
    apply(changes.cheng_theme.newValue);
  });
  const initial = revision;
  chrome.storage.local
    .get("cheng_theme")
    .then((value) => {
      if (revision === initial) apply(value.cheng_theme);
    })
    .catch(() => {});
})();
