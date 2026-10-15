/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverDualSubtitleSettings(dependencies) {
  const Br = dependencies.Br;
  const Ta = dependencies.Ta;
  const aa = dependencies.aa;
  const jsxRuntime = dependencies.jsxRuntime;
  const useApiClient = dependencies.useApiClient;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const useSliderNavigation = dependencies.useSliderNavigation;

  // Only presentation belongs here; supported sites come from the shared catalog.
  const platformIcons = {
    youtube: "",
    netflix: "p_netflix",
    hbo: "p_hbo",
    disney: "p_disney",
    primevideo: "p_prime",
    coursera: "p_coursera",
    udemy: "p_udemy",
    edx: "p_edx",
    deeplearning: "p_deeplearning",
    ted: "p_ted",
    bilibili: "p_bilibili",
    vimeo: "p_vimeo",
    pornhub: "p_pornhub",
    douyin: "p_douyin",
    xiaohongshu: "p_xiaohongshu",
    channels: "p_channels",
    xiaoe: "p_xiaoe",
    weibo: "p_weibo",
    tiktok: "p_tiktok",
    x: "p_x",
    instagram: "p_instagram",
    facebook: "p_facebook",
    reddit: "p_reddit",
    twitch: "p_twitch",
    dailymotion: "p_dailymotion",
    niconico: "p_niconico",
    xiaoyuzhou: "p_xiaoyuzhou",
    soundcloud: "p_soundcloud",
    bandcamp: "p_bandcamp",
    ximalaya: "p_ximalaya",
    netease: "p_netease",
    applepodcasts: "p_applepodcasts",
  };
  const supportNotes = {
    "zh-CN":
      "还支持普通网页中的标准 HTML5 视频播放器。双语字幕需可读取的字幕轨道，或配置 BYOK 音频识别生成字幕；部分媒体处理需安装本地助手。音频站点用于转写与资源下载，不保证原页面字幕同步。登录、地区限制、DRM 和网站接口变化可能影响可用性。",
    "zh-Hant":
      "亦支援一般網頁中的標準 HTML5 影片播放器。雙語字幕需可讀取的字幕軌道，或設定 BYOK 語音辨識產生字幕；部分媒體處理需安裝本機助手。音訊網站用於轉寫與資源下載，不保證原頁面字幕同步。登入、地區限制、DRM 和網站介面變更可能影響可用性。",
    en: "Standard HTML5 video players on other websites are also supported. Bilingual subtitles require readable subtitle tracks or BYOK audio transcription; some media processing requires the local helper. Audio sites support transcription and resource downloads, without guaranteed in-page subtitle sync. Login, region restrictions, DRM and site changes may affect availability.",
  };

  const DualSubtitleSettings = (props) => {
    const { setting: n } = useAppSelector((e) => ({ setting: e.setting })),
      { navigate: r } = useSliderNavigation(),
      { dispatch: i } = useDispatchBridge(),
      a = (useApiClient(!0), !1 !== n.dualSubtitleEnabled),
      { locale: o } = useLocale();
    return (0, jsxRuntime.jsxs)("div", {
      className: "rd-slider-inside",
      id: "trancy-slider",
      children: [
        (0, jsxRuntime.jsxs)("div", {
          className: "rd-slider-nav",
          children: [
            (0, jsxRuntime.jsxs)("div", {
              className: "nav-left",
              onClick: () => r(-1),
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "btn-slider-back",
                  children: (0, jsxRuntime.jsx)("div", {
                    className: "t-icon icon-18",
                    children: (0, jsxRuntime.jsx)(Ta, {}),
                  }),
                }),
                (0, jsxRuntime.jsx)("span", {
                  children: o("dual_subtitle_title"),
                }),
              ],
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "nav-right",
              children: (0, jsxRuntime.jsxs)("a", {
                href: "https://www.trancy.org/user-guide",
                target: "_blank",
                className: "btn-slider-link",
                children: [
                  (0, jsxRuntime.jsx)("div", {
                    className: "t-icon icon-16",
                    children: (0, jsxRuntime.jsx)(aa, {}),
                  }),
                  (0, jsxRuntime.jsx)("span", {
                    children: o("rd_manual"),
                  }),
                ],
              }),
            }),
          ],
        }),
        (0, jsxRuntime.jsxs)("div", {
          className: "rd-slider-content",
          children: [
            (0, jsxRuntime.jsx)("div", {
              className: "tips",
              children: o("dual_subtitle_tips"),
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "item-slider-group",
              children: (0, jsxRuntime.jsxs)("div", {
                className: "item-slider",
                children: [
                  (0, jsxRuntime.jsxs)("div", {
                    className: "item-slider-content",
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "item-left",
                        children: (0, jsxRuntime.jsx)("span", {
                          children: o("dual_subtitle_enable"),
                        }),
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "item-right",
                        onClick: () => {
                          const e = !a;
                          i(Br(e)),
                            window.dispatchEvent(
                              new CustomEvent("edvideo:caption.reload", {
                                detail: { body: { status: e ? "on" : "off" } },
                              }),
                            );
                        },
                        children: (0, jsxRuntime.jsx)("input", {
                          type: "checkbox",
                          className: "rd-switch",
                          checked: a,
                          readOnly: !0,
                        }),
                      }),
                    ],
                  }),
                  (0, jsxRuntime.jsx)("div", {
                    className: "item-slider-des",
                    children: o("dual_subtitle_enable_des"),
                  }),
                ],
              }),
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "slider-label lg-label",
              children: o("dual_subtitle_support_platform"),
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "support-platform",
              children: globalThis.lexihaloPlatformCapabilities.catalog.map(
                (platform) => {
                  const hasIcon = Object.prototype.hasOwnProperty.call(
                    platformIcons,
                    platform.id,
                  );
                  return (0, jsxRuntime.jsxs)(
                    "a",
                    {
                      className: "support-platform-item",
                      "data-platform-id": platform.id,
                      href: platform.homepage,
                      title: platform.homepage,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: hasIcon
                            ? `platform-icon ${platformIcons[platform.id]}`.trim()
                            : "platform-icon platform-icon-fallback",
                          "aria-hidden": true,
                          children: hasIcon
                            ? null
                            : platform.name
                                .slice(
                                  0,
                                  /^[A-Za-z]/.test(platform.name) ? 2 : 1,
                                )
                                .toUpperCase(),
                        }),
                        (0, jsxRuntime.jsx)("span", {
                          children: platform.name,
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className:
                            "support-platform-link-icon t-icon icon-14",
                          "aria-hidden": true,
                          children: (0, jsxRuntime.jsx)("svg", {
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: 2,
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            children: (0, jsxRuntime.jsx)("path", {
                              d: "M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
                            }),
                          }),
                        }),
                      ],
                    },
                    platform.id,
                  );
                },
              ),
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "tips support-platform-note",
              children: supportNotes[n.language?.interface] || supportNotes.en,
            }),
          ],
        }),
      ],
    });
  };

  return DualSubtitleSettings;
}
