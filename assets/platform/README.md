# Platform icons

The 20 PNG icons listed in `sources.json` were downloaded from the platforms' own sites/CDNs (favicons or Apple touch icons). The WeChat Channels icon is from the Channels backend, not the generic WeChat logo.

ICO/WebP images were decoded to RGBA PNG; images larger than 192 px were proportionally downscaled to at most 192×192. Artwork and colors were not redrawn. `sources.json` records the original URL, dimensions, format and SHA-256 of each bundled PNG. The other 12 existing platform assets are retained unchanged.

These logos identify third-party services; their trademarks and artwork remain the property of their respective owners. This does not imply endorsement or grant a general logo license.

All icons ship inside `assets/platform/` and are copied into `dist/` by `npm run build`. The settings page never contacts a favicon service or third-party CDN to render icons.

When adding a supported platform, import its actual icon, add its `platformIcons` entry in `src/reader/settings/DualSubtitleSettings.js` and matching rule in `src/styles/edreader.css`. Run `npm run test:subtitle-settings`, `npm run check` and `npm run test:browser`; tests require every registered platform to have a real, locally loadable icon. The text fallback is reserved for as-yet-unregistered future entries.
