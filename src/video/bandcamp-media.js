/* Bandcamp track/album selection. Never assume trackinfo[0] is the playing song. */
(() => {
  "use strict";
  const policy = globalThis.lexihaloSites;
  let cachedRaw, cachedData;
  const dataForPage = () => {
    let data = globalThis.TralbumData;
    if (!Array.isArray(data?.trackinfo)) {
      const raw = document
        .querySelector("script[data-tralbum]")
        ?.getAttribute("data-tralbum");
      if (!raw || raw.length > 2_000_000) return null;
      try {
        if (raw !== cachedRaw) {
          cachedRaw = raw;
          cachedData = JSON.parse(raw);
        }
        data = cachedData;
      } catch {
        cachedRaw = null;
        cachedData = null;
        return null;
      }
    }
    if (!Array.isArray(data?.trackinfo)) return null;
    try {
      if (
        data.url &&
        new URL(data.url, location.href).hostname !== location.hostname
      )
        return null;
    } catch {
      return null;
    }
    return data;
  };
  const selected = () => {
    const page = policy.page(location.href);
    if (page?.id !== "bandcamp") return null;
    const data = dataForPage();
    if (!data) return null;
    const tracks = data.trackinfo
      .slice(0, 2000)
      .filter((track) => track && typeof track === "object");
    const row = document.querySelector(".track_row_view.current_track");
    const number = row
      ?.getAttribute("rel")
      ?.match(/(?:^|[&\s])tracknum=(\d+)(?:$|[&\s])/)?.[1];
    let track;
    if (row) {
      track = tracks.find(
        (value) => Number(value.track_num) === Number(number),
      );
      if (!track) return null; // A stale/unknown selected row is not the first track.
    } else if (new URL(page.url).pathname.startsWith("/track/")) {
      track = tracks.find((value) => {
        try {
          return (
            value.title_link &&
            new URL(value.title_link, location.href).pathname ===
              new URL(page.url).pathname
          );
        } catch {
          return false;
        }
      });
      if (!track && data.current?.type === "track")
        track = tracks.find(
          (value) => String(value.track_id) === String(data.current.id),
        );
    } else {
      const featured =
        data.featured_track_id || data.current?.featured_track_id;
      track = tracks.find(
        (value) => featured && String(value.track_id) === String(featured),
      );
      if (!track && data.initial_track_num)
        track = tracks.find(
          (value) => Number(value.track_num) === Number(data.initial_track_num),
        );
    }
    if (!track || !/^\d+$/.test(String(track.track_id || ""))) return null;
    let trackUrl = null;
    try {
      const raw =
        track.title_link ||
        (data.current?.type === "track" &&
        String(data.current.id) === String(track.track_id)
          ? page.url
          : null);
      if (raw) {
        const url = new URL(raw, location.href);
        if (
          url.origin === location.origin &&
          /^\/track\/[^/?]+\/?$/.test(url.pathname)
        ) {
          url.search = "";
          url.hash = "";
          trackUrl = url.href;
        }
      }
    } catch {}
    const files = Object.entries(track.file || {}).filter(
      ([kind, url]) =>
        /^(?:mp3|aac|opus|ogg|flac|wav|alac)(?:-|$)/.test(kind) &&
        typeof url === "string" &&
        policy.isMediaUrl(page.url, url),
    );
    return { page, track, trackUrl, files };
  };
  const currentItem = (page) => {
    const value = selected();
    const album = new URL(page.url).pathname.startsWith("/album/");
    if (!value)
      return {
        ...page,
        identity: album ? `${page.identity}:unselected` : page.identity,
        requiresTrackPage: album,
        trackUrl: album ? null : page.url,
      };
    return {
      ...page,
      identity: `bandcamp:${location.origin}:track:${value.track.track_id}`,
      itemId: String(value.track.track_id),
      trackUrl: value.trackUrl,
      trackTitle: String(value.track.title || "").slice(0, 240),
      requiresTrackPage:
        album ||
        !value.trackUrl ||
        new URL(value.trackUrl).pathname !== new URL(page.url).pathname,
    };
  };
  const sameSource = (left, right) => {
    try {
      const a = new URL(left),
        b = new URL(right);
      return a.origin === b.origin && a.pathname === b.pathname;
    } catch {
      return false;
    }
  };
  const pickMedia = ({ candidates }) => {
    const value = selected();
    if (value) {
      const matches = candidates.filter(
        (media) =>
          !media.hasAttribute?.("data-lexihalo-placeholder") &&
          value.files.some(([, url]) =>
            sameSource(media.currentSrc || media.src, url),
          ),
      );
      const observed = read()?.current;
      const score = (media) =>
        (!media.paused && !media.ended ? 1e6 : 0) -
        (Number.isFinite(observed)
          ? Math.abs((media.currentTime || 0) - observed)
          : 0);
      matches.sort((left, right) => score(right) - score(left));
      if (matches.length) return matches[0];
    } else {
      // A single-track page with one legal DOM source needs no album metadata.
      const page = policy.page(location.href);
      const visible = candidates.filter(
        (media) =>
          !media.hasAttribute?.("data-lexihalo-placeholder") &&
          policy.isMediaUrl(location.href, media.currentSrc || media.src),
      );
      if (
        page?.id === "bandcamp" &&
        new URL(page.url).pathname.startsWith("/track/") &&
        visible.length === 1
      )
        return visible[0];
    }
    return (
      candidates.find((media) =>
        media.hasAttribute?.("data-lexihalo-tool-anchor"),
      ) || null
    );
  };
  const snapshot = ({ page, sources, add }) => {
    const value = selected();
    if (!value || String(value.track.track_id) !== page.itemId) return;
    for (const [kind, url] of value.files) {
      const ext = kind.split("-")[0];
      const mimeType = {
        mp3: "audio/mpeg",
        aac: "audio/aac",
        opus: "audio/ogg",
        ogg: "audio/ogg",
        flac: "audio/flac",
        wav: "audio/wav",
        alac: "audio/mp4",
      }[ext];
      const existing = sources.find((source) => sameSource(source.url, url));
      if (existing) Object.assign(existing, { mimeType, ext });
      else add(sources, page, url, { kind: "audio", mimeType });
    }
  };
  const prepare = async ({ result, signal }) => {
    if (typeof globalThis.lexihaloGetCapturedSources !== "function") return;
    const urls = result.sources
      .filter((source) => source.url && source.kind === "audio")
      .map((source) => source.url)
      .slice(0, 4);
    if (!urls.length) return;
    let captured = await globalThis.lexihaloGetCapturedSources(urls);
    if (!captured?.sources?.length) {
      // Bandcamp's CDN blocks page-context CORS. Prime only the selected public
      // stream, cancel at headers, and let the frame-bound broker read its bytes.
      const controller = new AbortController();
      try {
        const response = await fetch(urls[0], {
          mode: "no-cors",
          credentials: "omit",
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.any(
            [controller.signal, signal, AbortSignal.timeout(10000)].filter(
              Boolean,
            ),
          ),
        });
        await response.body?.cancel();
      } catch (error) {
        if (signal?.aborted) throw error;
      } finally {
        controller.abort();
      }
      captured = await globalThis.lexihaloGetCapturedSources(urls);
    }
    if (captured?.sources?.length)
      result.sources = globalThis.lexihaloMediaContract.merge(
        captured.sources,
        result.sources,
      );
  };
  const read = () => {
    const value = selected();
    if (!value) return null;
    const root = document.querySelector(".inline_player"),
      button = root?.querySelector(".playbutton");
    const time = root?.querySelector(".time")?.textContent?.split("/") || [];
    const current = globalThis.lexihaloNativeAudioClock.parseTime(time[0]);
    const duration =
      Number(value.track.duration) ||
      globalThis.lexihaloNativeAudioClock.parseTime(time[1]);
    if (!button || !Number.isFinite(current) || !(duration > 0)) return null;
    return {
      current: Math.min(duration, current),
      duration,
      paused: !button.classList.contains("playing"),
    };
  };
  const bindMedia = ({ media }) =>
    globalThis.lexihaloNativeAudioClock.bind(media, {
      id: "bandcamp",
      read,
      play: () => document.querySelector(".inline_player .playbutton")?.click(),
      pause: () =>
        document.querySelector(".inline_player .playbutton")?.click(),
    });
  globalThis.lexihaloBandcampMedia = Object.freeze({
    selected,
    currentItem,
    pickMedia,
    snapshot,
    prepare,
    bindMedia,
    read,
  });
})();
