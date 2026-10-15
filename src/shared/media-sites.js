/* LexiHalo-owned browser routing policy derived from config/media-platforms.json. */
(() => {
  "use strict";
  const CATALOG = []; // Replaced with mode=browser entries by the build.
  const hostIn = (host, list) =>
    list.some((entry) => host === entry || host.endsWith(`.${entry}`));
  const safePage = (address, allowPublicPort = false) => {
    try {
      const url = new URL(address);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (!allowPublicPort && url.port) ||
        url.href.length > 12000
      )
        return null;
      return url;
    } catch {
      return null;
    }
  };
  const siteOf = (address) => {
    const url = safePage(address);
    return url
      ? CATALOG.find((site) => hostIn(url.hostname.toLowerCase(), site.hosts))
      : undefined;
  };
  const xiaoePage = (url) => {
    const shop = url.hostname.match(
      /^(app[0-9a-z]{6,24})\.(?:(?:h5|mp)\.(?:xiaoeknow|xiaoe-tech)\.com|(?:(?:h5|mp)\.)?xet\.(?:citv\.cn|pomoho\.com))$/i,
    );
    if (!shop) return null;
    const app = shop[1].toLowerCase();
    let live = url.pathname.match(
      /^\/(?:v\d+|p)\/course\/alive\/(l_[0-9a-z_]{8,64})\/?$/i,
    )?.[1];
    if (!live) {
      try {
        const encoded =
          url.searchParams.get("params") ||
          url.pathname.match(/^\/content_page\/(.+)$/)?.[1];
        if (encoded && encoded.length <= 10000) {
          const raw = decodeURIComponent(encoded)
            .replace(/ /g, "+")
            .replace(/-/g, "+")
            .replace(/_/g, "/");
          const state = JSON.parse(
            new TextDecoder().decode(
              Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
            ),
          );
          if (state.app_id && String(state.app_id).toLowerCase() !== app)
            return null;
          if (/^l_[0-9a-z_]{8,64}$/i.test(state.resource_id || ""))
            live = state.resource_id;
        }
      } catch {}
    }
    if (
      !live ||
      (url.searchParams.get("app_id") &&
        url.searchParams.get("app_id").toLowerCase() !== app)
    )
      return null;
    const origin = url.origin.replace(".mp.", ".h5.");
    return {
      url: `${origin}/v4/course/alive/${live}?app_id=${app}`,
      identity: `xiaoe:${app}:${live}`,
    };
  };
  const page = (address, depth = 0) => {
    if (depth > 3) return null;
    const url = safePage(address),
      site = siteOf(address);
    if (!url || !site) return null;
    let identity;
    const path = url.pathname;
    const route = path + url.search + url.hash;
    if (site.id === "xiaoe") {
      const result = xiaoePage(url);
      return result ? { ...site, ...result } : null;
    }
    if (site.id === "douyin") {
      const id =
        path.match(/^\/(?:video|note)\/(\d+)/)?.[1] ||
        url.searchParams.get("modal_id") ||
        url.searchParams.get("vid");
      if (!/^\d+$/.test(id || "")) return null;
      return {
        ...site,
        url: `https://www.douyin.com/video/${id}`,
        identity: `douyin:${id}`,
        itemId: id,
      };
    }
    if (site.id === "xiaohongshu") {
      const id = path.match(
        /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i,
      )?.[1];
      if (!id) return null;
      const next = new URL(
        `https://www.xiaohongshu.com/explore/${id.toLowerCase()}`,
      );
      for (const key of ["xsec_token", "xsec_source"]) {
        const value = url.searchParams.get(key);
        if (value && value.length <= 512) next.searchParams.set(key, value);
      }
      return {
        ...site,
        url: next.href,
        identity: `xiaohongshu:${id.toLowerCase()}`,
        itemId: id.toLowerCase(),
      };
    }
    if (site.id === "channels") {
      let id;
      if (url.hostname === "weixin.qq.com" && !url.search)
        id = path.match(/^\/sph\/([A-Za-z0-9]{3,64})\/?$/)?.[1];
      else if (
        url.hostname === "channels.weixin.qq.com" &&
        path === "/finder-preview/pages/sph"
      )
        id = url.searchParams.get("id");
      if (/^[A-Za-z0-9]{3,64}$/.test(id || ""))
        return {
          ...site,
          url: `https://weixin.qq.com/sph/${id}`,
          identity: `channels:share:${id}`,
          itemId: id,
        };
      if (
        url.hostname === "channels.weixin.qq.com" &&
        path === "/finder-preview/pages/feed" &&
        url.searchParams.get("eid") &&
        url.searchParams.get("token")
      ) {
        url.hash = "";
        return {
          ...site,
          url: url.href,
          identity: `channels:feed:${url.searchParams.get("eid")}`,
        };
      }
      return null;
    }
    if (site.id === "x") {
      const match = path.match(
        /^\/(?:([A-Za-z0-9_]{1,15})|i)\/status\/(\d{5,25})(?:\/|$)/,
      );
      return match
        ? {
            ...site,
            url: `https://x.com/${match[1] || "i"}/status/${match[2]}`,
            identity: `x:${match[2]}`,
            itemId: match[2],
          }
        : null;
    }
    if (site.id === "tiktok") {
      const match = path.match(/^\/(@[^/]+)\/(?:video|photo)\/(\d+)/);
      if (!match) return null;
      return {
        ...site,
        url: `https://www.tiktok.com/${match[1]}/video/${match[2]}`,
        identity: `tiktok:${match[2]}`,
        itemId: match[2],
      };
    }
    if (site.id === "twitch") {
      const video =
        path.match(/^\/videos\/(\d+)/)?.[1] ||
        (url.hostname === "player.twitch.tv"
          ? url.searchParams.get("video")?.replace(/^v/, "")
          : null);
      if (/^\d+$/.test(video || ""))
        return {
          ...site,
          url: `https://www.twitch.tv/videos/${video}`,
          identity: `twitch:video:${video}`,
        };
      const clip =
        path.match(/^\/[^/]+\/clip\/([A-Za-z0-9_-]+)/)?.[1] ||
        (url.hostname === "clips.twitch.tv"
          ? path.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1] ||
            url.searchParams.get("clip")
          : null);
      if (clip)
        return {
          ...site,
          url: `https://clips.twitch.tv/${clip}`,
          identity: `twitch:clip:${clip}`,
        };
      return null;
    }
    if (site.id === "dailymotion") {
      const id =
        path.match(/^\/(?:embed\/)?video\/([A-Za-z0-9]+)/)?.[1] ||
        (url.hostname === "dai.ly"
          ? path.match(/^\/([A-Za-z0-9]+)\/?$/)?.[1]
          : null) ||
        (url.hostname === "geo.dailymotion.com"
          ? url.searchParams.get("video")
          : null);
      return /^[A-Za-z0-9]+$/.test(id || "")
        ? {
            ...site,
            url: `https://www.dailymotion.com/video/${id}`,
            identity: `dailymotion:${id}`,
          }
        : null;
    }
    if (site.id === "facebook" && path === "/plugins/video.php") {
      const linked = url.searchParams.get("href");
      return siteOf(linked)?.id === "facebook" ? page(linked, depth + 1) : null;
    }
    if (
      site.id === "soundcloud" &&
      url.hostname === "w.soundcloud.com" &&
      path === "/player/"
    ) {
      const linked = url.searchParams.get("url");
      return siteOf(linked)?.id === "soundcloud"
        ? page(linked, depth + 1)
        : null;
    }
    if (
      site.id === "soundcloud" &&
      /^\/(discover|search|you|stream|charts|stations)(\/|$)/.test(path)
    )
      return null;
    if (
      site.id === "facebook" &&
      url.hostname !== "fb.watch" &&
      !/\/videos\/|\/reel\/|^\/watch\/?\?/.test(route)
    )
      return null;
    if (
      site.id === "reddit" &&
      url.hostname !== "v.redd.it" &&
      !/\/comments\//.test(path)
    )
      return null;
    if (
      site.id === "twitch" &&
      url.hostname !== "clips.twitch.tv" &&
      !/^\/videos\/\d+|^\/[^/]+\/clip\//.test(path)
    )
      return null;
    if (
      site.id === "dailymotion" &&
      url.hostname !== "dai.ly" &&
      !/^\/(embed\/)?video\//.test(path)
    )
      return null;
    if (
      site.id === "niconico" &&
      url.hostname !== "nico.ms" &&
      !/^\/watch\//.test(path)
    )
      return null;
    if (!site.routes.some((pattern) => new RegExp(pattern).test(route)))
      return null;
    if (site.id === "netease") {
      const id =
        url.searchParams.get("id") || url.hash.match(/[?&]id=(\d+)/)?.[1];
      if (!/^\d+$/.test(id || "")) return null;
      return {
        ...site,
        url: `https://music.163.com/#/song?id=${id}`,
        identity: `netease:${id}`,
        itemId: id,
      };
    }
    url.hash = "";
    if (site.id === "soundcloud") {
      const token = url.searchParams.get("secret_token");
      url.search = "";
      if (token && token.length <= 512)
        url.searchParams.set("secret_token", token);
      return {
        ...site,
        url: url.href,
        identity: `soundcloud:${url.origin}${url.pathname}`,
      };
    }
    if (!["applepodcasts", "facebook"].includes(site.id)) url.search = "";
    if (
      site.id === "facebook" &&
      /^\/watch/.test(path) &&
      !url.searchParams.get("v")
    )
      return null;
    if (
      site.id === "applepodcasts" &&
      !/^\d+$/.test(url.searchParams.get("i") || "")
    )
      return null;
    identity = `${site.id}:${url.href}`;
    return { ...site, url: url.href, identity };
  };
  const publicHost = (host) => {
    const value = String(host || "")
      .toLowerCase()
      .replace(/\.$/, "");
    if (/^\d+(?:\.\d+){3}$/.test(value)) {
      const octets = value.split(".").map(Number);
      if (
        octets.some(
          (number, index) =>
            number > 255 || String(number) !== value.split(".")[index],
        )
      )
        return false;
      const [a, b, c] = octets;
      return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 &&
          (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)
      );
    }
    return (
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(
        value,
      ) &&
      value !== "localhost" &&
      !/\.(localhost|local|internal|test|invalid)$/.test(value)
    );
  };
  const browserPage = (address) => {
    const registered = siteOf(address);
    const matched = registered && page(address);
    if (matched) return matched;
    const url = safePage(address, true);
    if (!url || !publicHost(url.hostname) || url.port === "0") return null;
    url.hash = "";
    if (registered) {
      // Feed/home/search pages are not valid yt-dlp items, but the current DOM
      // player and its frame-bound captured response can still be imported.
      url.search = "";
      return {
        ...registered,
        url: url.href,
        identity: `${registered.id}:context:${url.origin}${url.pathname}`,
        contextual: true,
        browser: true,
      };
    }
    return {
      id: "generic",
      name: "当前网站",
      url: url.href,
      identity: `generic:${url.href}`,
      browser: false,
      mediaHosts: [],
    };
  };
  const nativePage = (address) => {
    const url = safePage(address, true);
    if (!url) return null;
    if (siteOf(address)) return page(address);
    const host = url.hostname.toLowerCase();
    if (hostIn(host, ["youtube.com", "youtube-nocookie.com", "youtu.be"])) {
      const id = hostIn(host, ["youtu.be"])
        ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
        : url.searchParams.get("v") ||
          url.pathname.match(
            /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/,
          )?.[1];
      return /^[A-Za-z0-9_-]{11}$/.test(id || "")
        ? {
            url: `https://www.youtube.com/watch?v=${id}`,
            identity: `youtube:${id}`,
          }
        : null;
    }
    if (hostIn(host, ["bilibili.com"])) {
      const id =
        url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/)?.[1] ||
        url.searchParams.get("bvid");
      const rawPart = Number(url.searchParams.get("p") || 1);
      const part = Number.isInteger(rawPart) && rawPart > 0 ? rawPart : 1;
      return /^BV[0-9A-Za-z]{10}$/.test(id || "")
        ? {
            url: `https://www.bilibili.com/video/${id}${part > 1 ? `?p=${part}` : ""}`,
            identity: `bilibili:${id}:${part}`,
          }
        : null;
    }
    if (hostIn(host, ["vimeo.com"])) {
      const ids = Array.from(
        url.pathname.matchAll(/\/(\d{5,12})(?=\/|$)/g),
        (match) => match[1],
      );
      const id =
        url.pathname.match(/^\/(\d{5,12})(?:\/|$)/)?.[1] ||
        url.pathname.match(/\/(?:video|videos)\/(\d{5,12})(?:\/|$)/)?.[1] ||
        ids.at(-1);
      return id
        ? { url: `https://vimeo.com/${id}`, identity: `vimeo:${id}` }
        : null;
    }
    if (hostIn(host, ["ted.com"])) {
      const slug = url.pathname.match(/^\/talks\/([A-Za-z0-9_-]+)\/?$/)?.[1];
      return slug
        ? { url: `${url.origin}/talks/${slug}`, identity: `ted:${slug}` }
        : null;
    }
    if (hostIn(host, ["pornhub.com"])) {
      const id =
        url.searchParams.get("viewkey") ||
        url.pathname.match(/^\/embed\/([A-Za-z0-9]+)\/?$/)?.[1];
      return /^[A-Za-z0-9]+$/.test(id || "")
        ? {
            url: `${url.origin}/view_video.php?viewkey=${id}`,
            identity: `pornhub:${id}`,
          }
        : null;
    }
    return browserPage(address);
  };
  const isMediaUrl = (pageAddress, raw) => {
    const owner = browserPage(pageAddress);
    const media = safePage(raw, owner?.id === "generic");
    if (!owner || !media) return false;
    if (owner.id === "generic")
      return publicHost(media.hostname) && media.port !== "0";
    if (!hostIn(media.hostname.toLowerCase(), owner.mediaHosts)) return false;
    if (
      owner.id === "douyin" &&
      !owner.contextual &&
      media.searchParams.has("__vid") &&
      media.searchParams.get("__vid") !== owner.itemId
    )
      return false;
    if (
      owner.id === "xiaohongshu" &&
      (!/^sns-video-[a-z0-9-]+\.xhscdn\.com$/.test(media.hostname) ||
        !/\.(mp4|m4a)$/.test(media.pathname))
    )
      return false;
    if (
      owner.id === "channels" &&
      (media.hostname !== "finder.video.qq.com" ||
        !/^\/(?:\d+\/){2}stodownload$/.test(media.pathname))
    )
      return false;
    return true;
  };
  globalThis.lexihaloSites = {
    catalog: CATALOG,
    siteOf,
    page,
    browserPage,
    nativePage,
    publicHost,
    isMediaUrl,
    hostIn,
  };
})();
