/* Read NetEase's persistent native player without creating a second playback. */
(() => {
  "use strict";
  const read = () => {
    const page = globalThis.lexihaloSites?.page(location.href);
    if (page?.id !== "netease") return null;
    let state;
    try {
      state = globalThis.player?.getPlaying?.();
    } catch {
      return null;
    }
    if (String(state?.track?.id || "") !== page.itemId) return null;
    const time =
      document.querySelector(".m-playbar .time")?.textContent?.split("/") || [];
    const trackDuration = Number(state.track.duration || state.track.dt) / 1000;
    const duration =
      trackDuration > 0
        ? trackDuration
        : globalThis.lexihaloNativeAudioClock.parseTime(time[1]);
    const progress =
      document.querySelector(".m-playbar .m-pbar .cur")?.style?.width || "";
    const percent = /^\d+(?:\.\d+)?%$/.test(progress)
      ? Number.parseFloat(progress)
      : NaN;
    const current =
      Number.isFinite(percent) && percent >= 0 && percent <= 100 && duration > 0
        ? (duration * percent) / 100
        : globalThis.lexihaloNativeAudioClock.parseTime(time[0]);
    if (!Number.isFinite(current) || !(duration > 0)) return null;
    return {
      current: Math.max(0, Math.min(duration, current)),
      duration,
      paused: state.playing !== true,
    };
  };
  const bind = (media) =>
    globalThis.lexihaloNativeAudioClock.bind(media, {
      id: "netease",
      read,
      play: () => document.querySelector(".m-playbar .btns .ply")?.click(),
      pause: () => globalThis.player?.pause?.(),
    });
  globalThis.lexihaloNeteasePlayback = Object.freeze({ read, bind });
})();
