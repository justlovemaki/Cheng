/* Bind a hidden tool anchor to a site's real playback clock, never a new audio. */
(() => {
  "use strict";
  const parseTime = (value) => {
    const text = String(value || "").trim();
    if (!/^(?:\d+:)?\d{1,2}:\d{2}$/.test(text)) return NaN;
    const parts = text.split(":").map(Number);
    if (parts[parts.length - 1] >= 60 || (parts.length === 3 && parts[1] >= 60))
      return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  };
  const bind = (media, { id, read, play, pause }) => {
    if (media.hasAttribute("data-lexihalo-native-clock")) return;
    media.setAttribute("data-lexihalo-native-clock", id);
    // Clock readers expose no stable seek API. Native player controls still work.
    media.setAttribute("data-lexihalo-readonly-clock", "true");
    Object.defineProperties(media, {
      currentTime: { configurable: true, get: () => read()?.current ?? NaN },
      duration: { configurable: true, get: () => read()?.duration ?? NaN },
      paused: { configurable: true, get: () => read()?.paused ?? true },
      ended: {
        configurable: true,
        get: () => {
          const state = read();
          return Boolean(state && state.current >= state.duration);
        },
      },
      play: {
        configurable: true,
        value: () => {
          if (read()?.paused === true) play?.();
          return Promise.resolve();
        },
      },
      pause: {
        configurable: true,
        value: () => {
          if (read()?.paused === false) pause?.();
        },
      },
    });
    let wasPaused = media.paused;
    const stop = () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", stop);
    };
    const timer = window.setInterval(() => {
      if (!media.isConnected) {
        stop();
        return;
      }
      const paused = media.paused;
      if (paused !== wasPaused) {
        wasPaused = paused;
        media.dispatchEvent(new Event(paused ? "pause" : "play"));
      }
    }, 250);
    window.addEventListener("pagehide", stop, { once: true });
  };
  globalThis.lexihaloNativeAudioClock = Object.freeze({ parseTime, bind });
})();
