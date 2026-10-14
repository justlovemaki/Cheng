/* Platform capability registry generated from config/media-platforms.json. */
(() => {
  "use strict";
  const PLATFORM_CATALOG = []; // Replaced by the readable-bundle build.
  const defaults = Object.freeze({ captions: true, aiTranscription: true, directAudio: false,
    browserCapture: false, nativePage: true, download: true, drm: false, specialized: true });
  const registry = new Map(PLATFORM_CATALOG.map(entry => [entry.id, Object.freeze({
    ...defaults,
    ...(entry.capabilities || {}),
    id: entry.id,
    platform: entry.platform || entry.id,
    mode: entry.mode,
    mediaKind: entry.mediaKind || "video",
    hosts: Object.freeze([...(entry.hosts || [])]),
    specialized: entry.mode === "specialized",
  })]));
  registry.set("html5", Object.freeze({ ...defaults, id: "html5", platform: "html5",
    mode: "generic", mediaKind: "video", browserCapture: true, specialized: false, hosts: [] }));
  const byPlatform = new Map([...registry.values()].map(entry => [entry.platform, entry]));
  const hostMatches = (host, entry) => entry.hosts.some(value => host === value || host.endsWith(`.${value}`));
  const resolve = ({ platform, page, host = "" } = {}) => {
    const normalizedHost = String(host || "").toLowerCase();
    const hostEntry = [...registry.values()].find(entry => entry.specialized && hostMatches(normalizedHost, entry));
    const entry = hostEntry || registry.get(page?.id) || byPlatform.get(platform) || registry.get(platform) || registry.get("html5");
    const pageCapabilities = globalThis.lexihaloMediaContract?.capabilities(page) || {};
    return Object.freeze({ ...entry,
      browserCapture: entry.browserCapture === true || entry.mode === "browser" ||
        (entry.id === "html5" && pageCapabilities.browserReadable === true),
      audioOnly: entry.mediaKind === "audio" || pageCapabilities.audioOnly === true,
      generic: pageCapabilities.generic === true,
      key: entry.id,
    });
  };
  globalThis.lexihaloPlatformCapabilities = Object.freeze({
    catalog: Object.freeze(PLATFORM_CATALOG), entries: Object.freeze([...registry.values()]),
    keys: Object.freeze([...registry.keys()]), get: id => registry.get(id) || null, resolve,
  });
})();
