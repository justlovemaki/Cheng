# Maintained source

The legacy translation/video core remains a single-bundle runtime. First-party UI is maintained here and installed into the recovered bundles during `npm run build`. Cheng's new learning workspace is built separately rather than added to the recovered React scope.

- `learning/`: Extension-owned IndexedDB schema/repositories, backup formats, AI/glossary services, privileged media actions, and the standalone learning workbench. See `docs/CHENG_LEARNING.md` at the repository root. Workspace scripts load in explicit order; background services are appended by the builder. Website scripts must never get database or secret access.
- `reader/`: Reader settings, pages, cards, navigation, quick-translation panel, control-center UI, and slider root.
- `video/`: video learning app, dual-caption app, toggle button, video router initialization, and caption-scheduler.
- `popup/ui/`: popup application and popup-specific UI behavior.
- `pages/`: HTML entry templates copied to the extension root during build.
- `locales/`: extension UI messages synchronized to `_locales/` during build.
- `options/`, `content/`, `video/onload.js`, `background/`: directly maintained runtime scripts and structured AI bridge.
- `styles/`: maintained CSS copied to `assets/`. Video CSS is compiled through `tools/scope-video-css.mjs`: legacy generic selectors (such as `.bar`, `.token`, and `.icon-back`) are restricted to extension-owned UI roots with zero-specificity `:where(...)`. Never use html/body or native player hosts as the generic-style scope. Run `npm run test:video-style-isolation` after changing video styles.
- Shared themes: `config/themes.json` → `tools/theme-system.mjs` generates palette tokens for pages, Reader, Video and previews. Theme reducers synchronize `edreader.theme` / `setting.theme`; background mirrors only the public preference to `cheng_theme`. `shared/theme-runtime.js` subscribes in isolated scripts and extension pages. Reader Shadow DOM roots subscribe directly; Video's main-world UI observes the public DOM attribute without forwarding it as a privileged settings request. Run `npm run test:theme`.
- `shared/`: behavior shared with recovered bundles. `challenge-page-guard.js` is embedded around every content script at build time to skip Cloudflare challenge documents before any runtime side effects; ordinary pages with embedded Turnstile widgets remain enabled.

The recovered reader/video Lodash module must remain private: `patchLodashGlobalExport` in the builder removes its legacy `window._` publication while preserving CommonJS exports. Publishing and then calling `noConflict()` is not safe in the page's MAIN world (LuCI uses `_` for translation, and host setters must never be invoked). Run `npm run test:page-global-isolation` and `npm run test:video-style-isolation` for VM and real-extension LuCI compatibility checks.

The build validates every `recover*` UI factory, resolves its dependency contract against the legacy bundle, lazily installs the replacement, and records installed component names in `artifacts/reports/bundle-renames.json`. Do not edit generated UI in `assets/` or root HTML files directly.
