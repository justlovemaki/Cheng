/* SoundCloud's persistent player may keep its real audio outside the DOM. */
(() => {
  "use strict";
  const playerForPage = () => {
    const policy = globalThis.lexihaloSites,
      page = policy?.page(location.href);
    if (page?.id !== "soundcloud") return null;
    const root = document.querySelector(".playControls");
    const href = root
      ?.querySelector(".playbackSoundBadge__titleLink[href]")
      ?.getAttribute("href");
    if (!href) return null;
    try {
      const playing = policy.page(new URL(href, location.href).href);
      if (playing?.id !== "soundcloud" || playing.identity !== page.identity)
        return null;
    } catch {
      return null;
    }
    return root;
  };
  const visibleTime = (node) => {
    const matches = String(node?.textContent || "").match(
      /\b(?:\d+:)?\d{1,2}:\d{2}\b/g,
    );
    return globalThis.lexihaloNativeAudioClock.parseTime(matches?.at(-1));
  };
  const read = () => {
    const root = playerForPage();
    if (!root) return null;
    const timeline = root.querySelector(".playbackTimeline__progressWrapper");
    const number = (name) => {
      const raw = timeline?.getAttribute(name);
      return raw == null || raw.trim() === "" ? NaN : Number(raw);
    };
    const elapsed = number("aria-valuenow"),
      total = number("aria-valuemax");
    const current = Number.isFinite(elapsed)
      ? elapsed
      : visibleTime(root.querySelector(".playbackTimeline__timePassed"));
    const duration =
      total > 0
        ? total
        : visibleTime(root.querySelector(".playbackTimeline__duration"));
    const button = root.querySelector(".playControl");
    if (!button || !Number.isFinite(current) || current < 0 || !(duration > 0))
      return null;
    return {
      current: Math.min(duration, current),
      duration,
      paused: !(
        button.classList.contains("playing") ||
        button.classList.contains("sc-button-pause")
      ),
    };
  };
  const bind = (media) =>
    globalThis.lexihaloNativeAudioClock.bind(media, {
      id: "soundcloud",
      read,
      play: () => playerForPage()?.querySelector(".playControl")?.click(),
      pause: () => playerForPage()?.querySelector(".playControl")?.click(),
    });
  globalThis.lexihaloSoundcloudPlayback = Object.freeze({ read, bind });
})();
