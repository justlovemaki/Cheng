/* Site-specific extraction hooks. The orchestration pipeline stays site-agnostic;
 * each hook only contributes player selection, sources, or authenticated preparation. */
(() => {
  "use strict";
  const hooks = new Map((globalThis.lexihaloSites?.catalog || []).map(site => [
    site.id,
    Object.freeze({ id: site.id, mode: "generic" }),
  ]));
  const register = (id, value) => hooks.set(id, Object.freeze({
    ...(hooks.get(id) || { id }),
    ...value,
    id,
    mode: "custom",
  }));

  register("xiaohongshu", {
    pickMedia({ page }) {
      const root = document.querySelector("#noteContainer");
      if (!page || root?.closest("[note-id]")?.getAttribute("note-id") !== page.itemId || root?.getAttribute("data-type") !== "video") return null;
      return root.querySelector("video");
    },
    snapshot({ page, media, sources, add }) {
      const note = globalThis.__INITIAL_STATE__?.note?.noteDetailMap?.[page.itemId]?.note;
      if (note?.noteId !== page.itemId || note.type !== "video" || !media) return;
      let data = note.video?.media;
      try { if (typeof note.video?.mediaV2 === "string" && note.video.mediaV2.length < 500000) data = JSON.parse(note.video.mediaV2); } catch {}
      if (data?.video?.drm_type || data?.video?.drmType) throw new Error("不支持 DRM 视频");
      for (const stream of Object.values(data?.stream || {}).flat().slice(0, 40)) {
        if (stream?.format?.toLowerCase() === "mp4") add(sources, page, stream.master_url || stream.masterUrl,
          { resolution: stream.height || stream.video_height, size: stream.size, upgradeHttp: true });
      }
      for (const stream of Object.values(data?.audio_stream || {}).flat().slice(0, 20)) {
        add(sources, page, stream.master_url || stream.masterUrl, { kind: "audio", size: stream.size, upgradeHttp: true });
      }
    },
    openGraph: false,
  });

  register("xiaoyuzhou", {
    snapshot({ page, sources, add }) {
      for (const node of document.querySelectorAll('meta[property="og:audio"], meta[property="og:audio:url"]')) {
        add(sources, page, node.content, { kind: "audio" });
      }
      try {
        const data = JSON.parse(document.querySelector("#__NEXT_DATA__")?.textContent || "{}");
        const episode = data.props?.pageProps?.episode;
        if (episode && (episode.eid === page.url.split("/").pop() || episode.id === page.url.split("/").pop())) {
          add(sources, page, episode.media?.source?.url || episode.media?.source || episode.audio?.url, { kind: "audio" });
        }
      } catch {}
    },
  });

  register("tiktok", {
    snapshot({ page, sources, add }) {
      try {
        const data = JSON.parse(document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent || "{}");
        const item = data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
        if (String(item?.id) !== page.itemId) return;
        add(sources, page, item.video?.playAddr, { resolution: item.video?.height });
        for (const rate of (item.video?.bitrateInfo || []).slice(0, 20)) {
          for (const url of (rate?.PlayAddr?.UrlList || []).slice(0, 4)) {
            add(sources, page, url, { resolution: rate.PlayAddr.Height, bitrate: rate.Bitrate });
          }
        }
      } catch {}
    },
    observedFallback: true,
    observedCandidate(raw) {
      const url = new URL(raw);
      if (url.searchParams.get("mime_type") !== "video_mp4" || !url.pathname.includes("/video/tos/")) return null;
      return { key: url.pathname, bitrate: Number(url.searchParams.get("br")) || Infinity };
    },
    openGraph: false,
  });

  register("douyin", {
    snapshot({ page, sources, add }) {
      try {
        const raw = document.querySelector("#RENDER_DATA")?.textContent;
        if (!raw || raw.length >= 2_000_000) return;
        const queue = [JSON.parse(decodeURIComponent(raw))]; let visited = 0;
        while (queue.length && visited++ < 1500) {
          const item = queue.shift();
          if (!item || typeof item !== "object") continue;
          if (String(item.aweme_id || item.awemeId || "") === page.itemId) {
            const video = item.video || {};
            for (const url of (video.play_addr?.url_list || video.playAddr?.urlList || []).slice(0, 4)) {
              add(sources, page, url, { resolution: video.height });
            }
            for (const rate of (video.bit_rate || []).slice(0, 20)) {
              for (const url of (rate.play_addr?.url_list || []).slice(0, 4)) {
                add(sources, page, url, { resolution: rate.play_addr?.height, bitrate: rate.bit_rate });
              }
            }
            break;
          }
          queue.push(...Object.values(item).filter(entry => entry && typeof entry === "object").slice(0, 50));
        }
      } catch {}
    },
    observedFallback: true,
    observedCandidate(raw) {
      const url = new URL(raw), key = url.searchParams.get("l");
      if (url.searchParams.get("mime_type") !== "video_mp4" || !key) return null;
      return { key, bitrate: Number(url.searchParams.get("br")) || Infinity };
    },
    openGraph: false,
  });

  register("bandcamp", {
    snapshot({ page, sources, add }) {
      for (const url of Object.values(globalThis.TralbumData?.trackinfo?.[0]?.file || {})) {
        add(sources, page, url, { kind: "audio" });
      }
    },
  });

  register("xiaoe", {
    async prepare({ result, jsonFetch, signal }) {
      if (result.sources.length) return;
      const match = new URL(result.page.url), app = match.searchParams.get("app_id"), live = match.pathname.split("/").pop();
      const reply = await jsonFetch(`/_alive/v3/get_lookback_list?app_id=${encodeURIComponent(app)}&alive_id=${encodeURIComponent(live)}`,
        { credentials: "same-origin" }, signal);
      if (reply.code === 11302) throw new Error("请先在当前小鹅通店铺网页登录");
      if (reply.code !== 0) throw new Error(`小鹅通回放不可用：${String(reply.msg || reply.message || reply.code).slice(0, 160)}`);
      for (const line of (Array.isArray(reply.data) ? reply.data : []).slice(0, 10)) {
        for (const entry of (line.line_sharpness || []).slice(0, 12)) result.add(entry.url, {
          resolution: Number(String(entry.sharpness || entry.name || "").match(/\d{3,4}/)?.[0]) || 0,
        });
      }
      if (!result.sources.length) throw new Error("小鹅通尚未提供可读取的回放，请先在网页播放回放");
    },
  });

  register("channels", {
    async prepare({ result, jsonFetch, signal, onProgress }) {
      if (result.sources.length) return;
      if (location.hostname === "channels.weixin.qq.com" && location.pathname === "/finder-preview/pages/feed") {
        const url = new URL(location.href);
        const data = await jsonFetch("/finder-preview/api/feed/get_feed_info", {
          method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseReq: { generalToken: url.searchParams.get("token") }, exportId: url.searchParams.get("eid") }),
        }, signal);
        if (data.errCode !== 0 || data.data?.errMsg?.type !== 0) throw new Error("视频号官方播放信息不可用");
        result.add(data.data?.feedInfo?.h264VideoInfo?.videoUrl);
      } else {
        if (!globalThis.lexihaloResolveChannels) throw new Error("请在视频号官方播放页打开播放器后重试");
        const resolved = await globalThis.lexihaloResolveChannels(result.page.url, { signal, onProgress });
        result.add(resolved.mediaUrl);
      }
      if (!result.sources.length) throw new Error("视频号尚未返回可播放资源；请先完成原网站验证");
    },
  });

  const get = (pageOrId) => hooks.get(typeof pageOrId === "string" ? pageOrId : pageOrId?.id) || null;
  globalThis.lexihaloMediaSiteHooks = Object.freeze({
    ids: Object.freeze([...hooks.keys()]),
    entries: Object.freeze([...hooks.values()]),
    get,
    pickMedia(page, context) { return get(page)?.pickMedia?.({ page, ...context }) || null; },
    snapshot(page, context) { return get(page)?.snapshot?.({ page, ...context }); },
    prepare(page, context) { return get(page)?.prepare?.({ page, ...context }); },
    flag(page, name, fallback = false) { return get(page)?.[name] ?? fallback; },
  });
})();
