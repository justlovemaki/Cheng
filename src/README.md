# Maintained source

The extension remains a single-bundle runtime, but first-party UI is maintained here and installed into the recovered bundles during `npm run build`.

- `reader/`: Reader settings, pages, cards, navigation, quick-translation panel, control-center UI, and slider root.
- `video/`: video learning app, dual-caption app, toggle button, video router initialization, and caption-scheduler.
- `popup/ui/`: popup application and popup-specific UI behavior.
- `pages/`: HTML entry templates copied to the extension root during build.
- `locales/`: extension UI messages synchronized to `_locales/` during build.
- `options/`, `content/`, `video/onload.js`, `background/`: directly maintained runtime scripts and structured AI bridge.
- `styles/`: maintained CSS copied to `assets/`.
- `shared/`: behavior shared with recovered bundles. `challenge-page-guard.js` is embedded around every content script at build time to skip Cloudflare challenge documents before any runtime side effects; ordinary pages with embedded Turnstile widgets remain enabled.

The build validates every `recover*` UI factory, resolves its dependency contract against the legacy bundle, lazily installs the replacement, and records installed component names in `artifacts/reports/bundle-renames.json`. Do not edit generated UI in `assets/` or root HTML files directly.
