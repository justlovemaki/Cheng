/* Ximalaya's desktop player can keep its audio detached from the document. */
(() => {
  "use strict";
  const playerForPage = () => {
    const policy = globalThis.lexihaloSites;
    const page = policy?.page(location.href);
    if (page?.id !== "ximalaya") return null;
    const root = document.querySelector(".xm-player");
    const href = root
      ?.querySelector(".xm-player-body-title a[href]")
      ?.getAttribute("href");
    if (!href) return null;
    try {
      const playing = policy.page(new URL(href, location.href).href);
      const soundId = new URL(page.url).pathname.match(
        /^\/sound\/(\d+)\/?$/,
      )?.[1];
      const playingId =
        playing?.id === "ximalaya" &&
        new URL(playing.url).pathname.match(/^\/sound\/(\d+)\/?$/)?.[1];
      if (!soundId || playingId !== soundId) return null;
    } catch {
      return null;
    }
    return root;
  };
  const read = () => {
    const root = playerForPage();
    if (!root) return null;
    const time =
      root.querySelector(".xm-player-playtime")?.textContent?.split("/") || [];
    const duration = globalThis.lexihaloNativeAudioClock.parseTime(time[1]);
    const progress =
      root.querySelector(".xm-player-progress_cur")?.style?.width || "";
    const percent = /^\d+(?:\.\d+)?%$/.test(progress)
      ? Number.parseFloat(progress)
      : NaN;
    const current =
      Number.isFinite(percent) && percent >= 0 && percent <= 100 && duration > 0
        ? (duration * percent) / 100
        : globalThis.lexihaloNativeAudioClock.parseTime(time[0]);
    const pause = root.querySelector(".xm-player-btns .pause");
    const play = root.querySelector(".xm-player-btns .play");
    if (
      !Number.isFinite(current) ||
      !(duration > 0) ||
      Boolean(pause) === Boolean(play)
    )
      return null;
    return {
      current: Math.max(0, Math.min(duration, current)),
      duration,
      paused: !pause,
    };
  };
  const bind = (media) =>
    globalThis.lexihaloNativeAudioClock.bind(media, {
      id: "ximalaya",
      read,
      play: () =>
        playerForPage()?.querySelector(".xm-player-btns .play")?.click(),
      pause: () =>
        playerForPage()?.querySelector(".xm-player-btns .pause")?.click(),
    });
  globalThis.lexihaloXimalayaPlayback = Object.freeze({ read, bind });
})();
