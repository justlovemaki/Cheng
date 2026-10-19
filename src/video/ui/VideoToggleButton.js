/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverVideoToggleButton(dependencies) {
  const $w = dependencies.$w;
  const AA = dependencies.AA;
  const Ct = dependencies.Ct;
  const Et = dependencies.Et;
  const Kt = dependencies.Kt;
  const Le = dependencies.Le;
  const Lt = dependencies.Lt;
  const Pe = dependencies.Pe;
  const React = dependencies.React;
  const ReactDOMClient = dependencies.ReactDOMClient;
  const ReduxProvider = dependencies.ReduxProvider;
  const SA = dependencies.SA;
  const SS = dependencies.SS;
  const St = dependencies.St;
  const UA = dependencies.UA;
  const appStore = dependencies.appStore;
  const c_ = dependencies.c_;
  const captionProvider = dependencies.captionProvider;
  const createAppStore = dependencies.createAppStore;
  const createCustomElementRoot = dependencies.createCustomElementRoot;
  const detectBrowser = dependencies.detectBrowser;
  const dt = dependencies.dt;
  const en = dependencies.en;
  const extensionClient = dependencies.extensionClient;
  const fe = dependencies.fe;
  const ge = dependencies.ge;
  const gt = dependencies.gt;
  const hd = dependencies.hd;
  const ij = dependencies.ij;
  const initTranslatorServiceAction = dependencies.initTranslatorServiceAction;
  const je = dependencies.je;
  const jn = dependencies.jn;
  const jsxRuntime = dependencies.jsxRuntime;
  const ke = dependencies.ke;
  const kt = dependencies.kt;
  const logDebug = dependencies.logDebug;
  const me = dependencies.me;
  const nj = dependencies.nj;
  const nt = dependencies.nt;
  const ot = dependencies.ot;
  const pe = dependencies.pe;
  const platformContext = dependencies.platformContext;
  const pt = dependencies.pt;
  const rj = dependencies.rj;
  const rt = dependencies.rt;
  const setDualCaptionEnabledAction = dependencies.setDualCaptionEnabledAction;
  const setDualCaptionHotkeysAction = dependencies.setDualCaptionHotkeysAction;
  const setDualCaptionModeAction = dependencies.setDualCaptionModeAction;
  const setDualCaptionNativeAction = dependencies.setDualCaptionNativeAction;
  const setDualCaptionTargetAction = dependencies.setDualCaptionTargetAction;
  const setTranslatorServiceAction = dependencies.setTranslatorServiceAction;
  const setVideoAction = dependencies.setVideoAction;
  const shallowEqual = dependencies.shallowEqual;
  const useAppDispatch = dependencies.useAppDispatch;
  const useAppSelector = dependencies.useAppSelector;
  const useLocale = dependencies.useLocale;
  const vt = dependencies.vt;
  const xb = dependencies.xb;
  const yt = dependencies.yt;
  const zb = dependencies.zb;

  const VideoToggleButton = (props) => {
    var n, r, i;
    const a = useAppDispatch(),
      o = (e, t) => {
        a(e),
          extensionClient.dispatch(e, t),
          captionProvider.event.emit("dispatch", e);
      },
      {
        dualCaption: s,
        setting: l,
        user: c,
        translatorService: u,
        tasks: storedTasks,
        shortcuts: p,
        video: _,
      } = useAppSelector((e) => e, shallowEqual),
      d = Array.isArray(storedTasks) ? storedTasks : [],
      h = s.target
        ? jn.find((e) => e.code === s.target)
        : jn.find((e) => e.code === l.language.subtitle),
      m = s.native
        ? jn.find((e) => e.code === s.native)
        : jn.find((e) => e.code === l.language.translation),
      g = hd(),
      { locale: f } = useLocale(),
      v =
        ["youtube", "netflix"].includes(captionProvider.platform) &&
        zb.includes((null == h ? void 0 : h.code) || ""),
      y = v
        ? "youtube" === captionProvider.platform
          ? "v2_and_legacy"
          : "legacy_only"
        : "none",
      b = (0, React.useRef)(),
      [w, x] = (0, React.useState)(null),
      k =
        SA(captionProvider.platform) &&
        !captionProvider.video?.hasAttribute?.("data-lexihalo-readonly-clock");
    (0, React.useEffect)(() => {
      const e = (e) => a(e);
      return (
        captionProvider.event.on("dispatch:caption", e),
        () => {
          captionProvider.event.off("dispatch:caption", e);
        }
      );
    }, []);
    const [T, S] = (0, React.useState)(!1),
      C = (0, React.useRef)(null),
      [A, j] = (0, React.useState)(void 0),
      P = (0, React.useRef)(null),
      [E, N] = (0, React.useState)(null),
      [L, I] = (0, React.useState)(!1),
      [O, q] = (0, React.useState)(captionProvider.isSourceWaiting);
    (0, React.useEffect)(() => {
      const e = (e) => q(!!(null == e ? void 0 : e.waiting));
      return (
        captionProvider.event.on("source.waiting", e),
        () => {
          captionProvider.event.off("source.waiting", e);
        }
      );
    }, []);
    const [R, z] = (0, React.useState)(captionProvider.isSameLanguage);
    (0, React.useEffect)(() => {
      const e = (e) => z(!!(null == e ? void 0 : e.same));
      return (
        captionProvider.event.on("same.language", e),
        () => {
          captionProvider.event.off("same.language", e);
        }
      );
    }, []);
    const [M, B] = (0, React.useState)(captionProvider.isLookupAllowed);
    (0, React.useEffect)(() => {
      const e = (e) => B(!!(null == e ? void 0 : e.allowed));
      return (
        captionProvider.event.on("lookup.allowed", e),
        () => {
          captionProvider.event.off("lookup.allowed", e);
        }
      );
    }, []);
    const [D, F] = (0, React.useState)(platformContext.priorityHumanSubtitle);
    (0, React.useEffect)(() => {
      const e = C.current;
      if (!w || !e) return void j(void 0);
      if ((j(e.offsetHeight), "undefined" == typeof ResizeObserver)) return;
      const t = new ResizeObserver(() => {
        C.current && j(C.current.offsetHeight);
      });
      return t.observe(e), () => t.disconnect();
    }, [w]),
      (0, React.useEffect)(() => {
        const e = (e) => {
          P.current && !P.current.contains(e.target) && (S(!1), x(null));
        };
        return (
          T
            ? document.addEventListener("click", e)
            : document.removeEventListener("click", e),
          () => {
            document.removeEventListener("click", e);
          }
        );
      }, [T]);
    const H = () => {
        var e, t;
        null == (e = b.current) || e.unmount(),
          null == (t = document.querySelector("trancy-caption-setting")) ||
            t.remove();
      },
      V = () => {
        var e, t;
        null == (e = b.current) || e.unmount(),
          null == (t = document.querySelector("trancy-caption-summary")) ||
            t.remove();
      },
      W = (e) => {
        const t = Math.floor(e % 1e3),
          n = Math.floor((e / 1e3) % 60),
          r = Math.floor((e / 6e4) % 60);
        return `${Math.floor(e / 36e5)
          .toString()
          .padStart(
            2,
            "0",
          )}:${r.toString().padStart(2, "0")}:${n.toString().padStart(2, "0")},${t.toString().padStart(3, "0")}`;
      },
      [$, U] = (0, React.useState)("none"),
      [K, Z] = (0, React.useState)(!1),
      [G, Y] = (0, React.useState)(!1),
      J = (0, React.useRef)(),
      transcriptionTask = (0, React.useRef)(null),
      [videoFormats, setVideoFormats] = (0, React.useState)([]),
      [videoDownloadState, setVideoDownloadState] = (0, React.useState)({
        status: "idle",
        message: "",
        percent: 0,
      }),
      videoDownloadTask = (0, React.useRef)(null),
      [mediaFallback, setMediaFallback] = (0, React.useState)(null),
      offerMediaFallback = (
        action,
        error,
        forceNative = false,
        format = null,
      ) => {
        const unavailable = error?.helperUnavailable === true;
        const pageUrl = globalThis.lexihaloMediaPageUrl?.({
          platform: captionProvider.platform,
          context: platformContext,
        });
        if (
          !unavailable &&
          (forceNative ||
            !pageUrl ||
            !globalThis.lexihaloMediaWorkflow.canOfferFallback(error))
        )
          return;
        const item = globalThis.lexihaloSiteAdapters?.currentItem?.();
        if (
          !unavailable &&
          !globalThis.lexihaloCanNativePageParse?.() &&
          !item?.trackUrl
        )
          return;
        const trackUrl =
          !unavailable && item?.requiresTrackPage ? item.trackUrl : null;
        if (!unavailable && item?.requiresTrackPage && !trackUrl) return;
        setMediaFallback({
          action,
          reason:
            (error?.message || String(error)) +
            (trackUrl
              ? " 请先打开当前曲目页再使用本地解析，不会整张解析专辑。"
              : ""),
          trackUrl,
          helperUnavailable: unavailable,
          videoId: captionProvider.id,
          forceNative: unavailable ? forceNative : true,
          format: unavailable ? format : null,
        });
        x("media-fallback");
      },
      X = () =>
        ij(null, null, function* () {
          if (
            "null" === platformContext.id ||
            "undefined" === platformContext.id
          )
            return;
          const { message: e, data: t } = yield g.getCaptionStatus(
            platformContext.id,
          );
          return (
            "ok" === e && "ok" === t.status
              ? (captionProvider.event.emit("whisperx", {
                  enabled: !0,
                }),
                Z(!0),
                U("ok"))
              : Z(!1),
            "none" === (null == t ? void 0 : t.status)
          );
        }),
      [Q, ee] = (0, React.useState)(f("caption_ai_status_1")),
      te = (e) =>
        ij(null, null, function* () {
          if ((clearTimeout(J.current), e <= 0)) return;
          const { message: t, data: n } = yield g.getCaptionStatus(
            platformContext.id,
          );
          if ("ok" !== t) return N(t), void Y(!1);
          if ("ok" === t && n.status)
            switch ((U(n.status), n.status)) {
              case "ok":
                ee(f("caption_ai_status_3")),
                  captionProvider.event.emit("whisperx", {
                    enabled: !0,
                  }),
                  Y(!1),
                  x(null),
                  Z(!0),
                  S(!1);
                break;
              case "error":
                N(f("ai_toast_error")), Y(!1);
                break;
              case "downloaded":
                ee(f("caption_ai_status_2"));
              case "pending":
                ee(f("caption_ai_status_1")), Y(!0);
              default:
                J.current = window.setTimeout(
                  () =>
                    ij(null, null, function* () {
                      return te(--e);
                    }),
                  3e3,
                );
            }
        }),
      ne = (forceNative = false) =>
        ij(null, null, function* () {
          if (G) {
            if (transcriptionTask.current?.native) {
              void globalThis.lexihaloCancelTranscription?.(
                transcriptionTask.current.id,
              );
              ee("正在取消…");
            }
            return;
          }
          Y(!0), N(null), Z(!1);
          setMediaFallback(null);
          x(null);
          const startingVideoId = captionProvider.id;
          const fetchingMessage = String(l.language.interface || "").startsWith(
            "zh",
          )
            ? "正在获取视频音频…"
            : "Fetching video audio…";
          ee(fetchingMessage);
          captionProvider.event.emit("transcription.status", {
            state: "loading",
            message: fetchingMessage,
          });
          try {
            if (
              "youtube" === captionProvider.platform &&
              typeof platformContext.getYoutubeTracks === "function"
            ) {
              yield platformContext.getYoutubeTracks().catch(() => null);
            }
            const mediaPage =
              globalThis.lexihaloSites?.page(location.href) ||
              globalThis.lexihaloSites?.browserPage(location.href);
            const mediaCapabilities =
              globalThis.lexihaloPlatformCapabilities.resolve({
                platform: captionProvider.platform,
                page: mediaPage,
                host: location.hostname,
              });
            if (!forceNative && mediaCapabilities.browserCapture) {
              yield globalThis.lexihaloSiteAdapters?.prepare();
            }
            const resolved = globalThis.lexihaloResolveAudioSource({
              platform: captionProvider.platform,
              context: platformContext,
              video: captionProvider.video || document.querySelector("video"),
            });
            if (
              !forceNative &&
              resolved.wrapper &&
              !resolved.browserSources?.length
            ) {
              throw new Error(
                "当前播放器尚未提供可读取的媒体资源。请从原详情页打开播放器并播放几秒，再重新打开菜单；若是独立包装页，请返回原详情页",
              );
            }
            const stream = resolved.source;
            const mediaPageUrl = globalThis.lexihaloMediaPageUrl({
              platform: captionProvider.platform,
              context: platformContext,
            });
            let useNativeHelper = false;
            let useBrowserAudio = false;
            const cancelTranscription = () => {
              ee("已取消");
              captionProvider.event.emit("transcription.status", {
                state: "idle",
                message: "已取消",
              });
            };
            if (forceNative) {
              if (!mediaPageUrl || !globalThis.lexihaloCanNativePageParse?.())
                throw new Error(
                  "当前页面不支持本地页面解析；请直接下载当前播放器资源",
                );
              const confirmed =
                yield globalThis.lexihaloMediaWorkflow.confirmPageParsing(
                  "transcribe",
                  mediaFallback?.reason,
                );
              if (!confirmed) {
                cancelTranscription();
                return;
              }
              useNativeHelper = true;
            } else {
              if (!stream && !resolved.browserSources?.length) {
                throw new Error(
                  resolved.oversized
                    ? "当前音频文件超过浏览器直接识别的 24 MB 限制。"
                    : "当前播放器未提供可读取的媒体资源，请先播放几秒后重试。",
                );
              }
              useBrowserAudio = Boolean(
                resolved.browserSources?.length &&
                  (!stream ||
                    globalThis.lexihaloPreferNativeHelper?.({
                      platform: captionProvider.platform,
                      context: platformContext,
                    })),
              );
              if (useBrowserAudio) {
                yield globalThis.lexihaloMediaWorkflow.requireHelper({
                  browser: true,
                  purpose: "transcribe",
                });
                if (
                  !window.confirm(
                    "是否读取当前播放器的音频，交给本地助手（ffmpeg）切块，再上传到你配置的 BYOK 服务商生成字幕？不会重新解析网页或导出浏览器 Cookie。",
                  )
                ) {
                  cancelTranscription();
                  return;
                }
                useNativeHelper = true;
              }
            }
            const transcribingMessage = String(
              l.language.interface || "",
            ).startsWith("zh")
              ? "正在上传音频并生成字幕…"
              : "Uploading audio and generating captions…";
            ee(transcribingMessage);
            captionProvider.event.emit("transcription.status", {
              state: "loading",
              message: transcribingMessage,
            });
            const transcribe = globalThis.lexihaloTranscribeAudio;
            if (typeof transcribe !== "function") {
              throw new Error("音频识别服务尚未就绪，请刷新页面后重试");
            }
            const runTranscription = () => {
              const requestId = crypto.randomUUID();
              transcriptionTask.current = {
                id: requestId,
                native: useNativeHelper,
              };
              if (captionProvider.id !== startingVideoId)
                throw new Error("视频已切换，取消旧视频识别");
              return transcribe(
                {
                  requestId,
                  useNativeHelper,
                  useBrowserAudio,
                  browserSource: useBrowserAudio
                    ? resolved.browserSources?.find(
                        (source) =>
                          source.transport === "capture" || source.captureId,
                      ) || resolved.browserSources?.[0]
                    : undefined,
                  audioUrl: useNativeHelper ? mediaPageUrl : stream.url,
                  mediaPageUrl: useNativeHelper ? mediaPageUrl : undefined,
                  mimeType: stream?.mimeType || "audio/mpeg",
                  audioBytes: Number(stream?.size) || 0,
                  videoId: platformContext.vid || platformContext.id,
                  duration: Number(platformContext.duration) || 0,
                  language:
                    platformContext.audioLanguage ||
                    l.language.subtitle ||
                    "auto",
                  engineId: u.subtitle?._id || "",
                },
                (progress) => {
                  ee(progress);
                  captionProvider.event.emit("transcription.status", {
                    state: "loading",
                    message: progress,
                  });
                },
              );
            };
            const result = yield runTranscription();
            if (captionProvider.id !== startingVideoId) {
              throw new Error("视频已切换，取消安装旧视频字幕");
            }
            captionProvider.installTranscription(
              result.segments,
              result.language,
            );
            // Generating captions is an explicit request to show them, even if
            // the user had not enabled the temporary caption overlay before.
            captionProvider.enabled = true;
            I(true);
            captionProvider.event.emit("caption.enable");
            const completedMessage = String(
              l.language.interface || "",
            ).startsWith("zh")
              ? "AI 字幕生成完成"
              : "AI captions generated";
            ee(completedMessage);
            U("ok"), Z(!0), S(!1);
            captionProvider.event.emit("transcription.status", {
              state: "done",
              message: completedMessage,
            });
            captionProvider.event.emit("whisperx", {
              enabled: !0,
              local: !0,
            });
          } catch (error) {
            const message = error?.message || String(error);
            ee(
              String(l.language.interface || "").startsWith("zh")
                ? "识别失败"
                : "Transcription failed",
            );
            N(message), Z(!1);
            offerMediaFallback("transcribe", error, forceNative);
            captionProvider.event.emit("transcription.status", {
              state: "error",
              message,
            });
            if (/BYOK|OpenAI/.test(message)) {
              extensionClient.open("byok.html?provider=OpenAI", !1);
            }
          } finally {
            transcriptionTask.current = null;
            Y(!1);
          }
        }),
      openVideoDownload = (forceNative = false) =>
        ij(null, null, function* () {
          if (videoDownloadTask.current) return;
          const startingVideoId = captionProvider.id;
          setMediaFallback(null);
          x("video-download");
          setVideoFormats([]);
          setVideoDownloadState({
            status: "loading",
            message: "正在识别视频清晰度…",
            percent: 0,
          });
          try {
            const mediaPageUrl = globalThis.lexihaloMediaPageUrl({
              platform: captionProvider.platform,
              context: platformContext,
            });
            if (!mediaPageUrl) throw new Error("当前页面不支持媒体下载");
            const listFormats = globalThis.lexihaloListVideoFormats;
            const prepare = globalThis.lexihaloSiteAdapters?.prepare;
            const mediaPage =
              globalThis.lexihaloSites?.page(location.href) ||
              globalThis.lexihaloSites?.browserPage(location.href);
            const mediaCapabilities =
              globalThis.lexihaloPlatformCapabilities.resolve({
                platform: captionProvider.platform,
                page: mediaPage,
                host: location.hostname,
              });
            const local =
              !forceNative &&
              mediaCapabilities.browserCapture &&
              typeof prepare === "function"
                ? yield prepare()
                : null;
            if (!forceNative && local?.wrapper && !local.sources.length) {
              throw new Error(
                "当前播放器尚未取得真实媒体源，请从原详情页打开并播放几秒后重试",
              );
            }
            const localFormats = [];
            const grouped = new Map();
            for (const source of local?.sources || []) {
              const key = `${source.kind}:${source.resolution || 0}`;
              if (!grouped.has(key)) grouped.set(key, source);
            }
            for (const source of grouped.values()) {
              localFormats.push({
                formatId: `browser${localFormats.length}`,
                resolution: source.resolution || 0,
                height: source.resolution || 0,
                isAudio: source.kind === "audio",
                hasAudio: true,
                ext:
                  source.ext === "m3u8"
                    ? source.kind === "audio"
                      ? "mka"
                      : "mkv"
                    : source.ext,
                label:
                  source.label ||
                  (source.kind === "audio"
                    ? "音频资源"
                    : source.resolution
                      ? `${source.resolution}p`
                      : "当前播放器资源（自动选择清晰度）"),
                codecLabel: "浏览器读取",
                filesize: source.size || 0,
                browserSource: source,
                title: local.title,
              });
            }
            let formats = localFormats;
            if (forceNative) {
              if (!globalThis.lexihaloCanNativePageParse?.())
                throw new Error(
                  "当前页面不支持本地页面解析；请直接下载当前播放器资源",
                );
              const confirmed =
                yield globalThis.lexihaloMediaWorkflow.confirmPageParsing(
                  "download",
                  mediaFallback?.reason,
                );
              if (!confirmed) {
                setVideoDownloadState({
                  status: "idle",
                  message: "已取消本地页面解析",
                  percent: 0,
                });
                return;
              }
              if (captionProvider.id !== startingVideoId)
                throw new Error("视频已切换，请重新打开下载菜单");
              if (typeof listFormats !== "function")
                throw new Error("媒体下载服务尚未就绪，请刷新页面后重试");
              formats = (yield listFormats(mediaPageUrl)).formats || [];
            } else if (!formats.length) {
              throw new Error(
                "当前播放器未提供可读取的媒体资源，请先播放几秒后重试。",
              );
            }
            if (captionProvider.id !== startingVideoId)
              throw new Error("视频已切换，请重新打开下载菜单");
            if (!formats.length)
              throw new Error(
                "本地助手未找到可下载资源，当前页面可能不受支持。",
              );
            setVideoFormats(
              formats.map((format) => ({
                ...format,
                videoId: startingVideoId,
              })),
            );
            setVideoDownloadState({
              status: "ready",
              message: `已识别 ${formats.length} 项可下载资源`,
              percent: 0,
            });
          } catch (error) {
            setVideoDownloadState({
              status: "error",
              message: error?.message || String(error),
              percent: 0,
            });
            offerMediaFallback("download", error, forceNative);
          }
        }),
      downloadVideoFormat = (format) =>
        ij(null, null, function* () {
          if (["downloading", "loading"].includes(videoDownloadState.status))
            return;
          x("video-download");
          setVideoDownloadState({
            status: "loading",
            message: "正在检查本地助手…",
            percent: 0,
          });
          const sizeText = format.filesize
            ? `，约 ${(format.filesize / 1024 / 1024).toFixed(1)} MB`
            : "";
          const startingVideoId = captionProvider.id;
          const mediaPageUrl = globalThis.lexihaloMediaPageUrl({
            platform: captionProvider.platform,
            context: platformContext,
          });
          const requestId = crypto.randomUUID();
          try {
            if (format.videoId && format.videoId !== startingVideoId)
              throw new Error("视频已切换，请重新打开下载菜单");
            yield globalThis.lexihaloMediaWorkflow.requireHelper({
              browser: Boolean(format.browserSource),
              purpose: "download",
            });
            if (captionProvider.id !== startingVideoId)
              throw new Error("视频已切换，请重新打开下载菜单");
            if (
              !window.confirm(
                `下载 ${format.label}${sizeText}？文件将保存到系统 Downloads/LexiHalo 目录。`,
              )
            ) {
              setVideoDownloadState({
                status: "ready",
                message: "已取消下载",
                percent: 0,
              });
              return;
            }
            setMediaFallback(null);
            videoDownloadTask.current = requestId;
            setVideoDownloadState({
              status: "downloading",
              message: `正在准备 ${format.label}…`,
              percent: 0,
            });
            const downloadVideo = globalThis.lexihaloDownloadVideo;
            if (typeof downloadVideo !== "function")
              throw new Error("视频下载服务尚未就绪，请刷新页面后重试");
            const result = yield downloadVideo(
              {
                requestId,
                mediaPageUrl,
                formatId: format.formatId,
                resolution: format.resolution || format.height || 0,
                browserSource: format.browserSource,
                title: format.title || platformContext.title || "media",
              },
              (progress) =>
                setVideoDownloadState((previous) =>
                  previous.message === "正在取消…"
                    ? previous
                    : {
                        status: "downloading",
                        message:
                          typeof progress === "object"
                            ? progress.message
                            : String(progress || previous.message),
                        percent:
                          typeof progress === "object"
                            ? Math.max(
                                previous.percent || 0,
                                Number(progress.percent) || 0,
                              )
                            : previous.percent || 0,
                      },
                ),
            );
            setVideoDownloadState({
              status: "done",
              message: `已保存：${result.filename || result.directory}`,
              percent: 100,
            });
          } catch (error) {
            const message = error?.message || String(error);
            setVideoDownloadState({
              status: /已取消|aborted|cancelled/i.test(message)
                ? "ready"
                : "error",
              message: /已取消|aborted|cancelled/i.test(message)
                ? "已取消下载"
                : message,
              percent: 0,
            });
            offerMediaFallback(
              "download",
              error,
              !format.browserSource,
              format,
            );
          } finally {
            videoDownloadTask.current = null;
          }
        }),
      cancelVideoDownload = () => {
        const requestId = videoDownloadTask.current;
        if (!requestId) return;
        setVideoDownloadState((previous) => ({
          ...previous,
          status: "downloading",
          message: "正在取消…",
        }));
        void globalThis.lexihaloCancelVideoDownload?.(requestId);
      },
      [re, ie] = (0, React.useState)([]),
      [ae, oe] = (0, React.useState)([]),
      se = [
        {
          label: f("caption_dual_caption"),
          value: "dual",
        },
        {
          label: f("caption_primary"),
          value: "target",
        },
        {
          label: f("caption_translation"),
          value: "native",
        },
      ];
    const [batchProgress, setBatchProgress] = (0, React.useState)(() =>
      captionProvider.getTranslationStatus
        ? captionProvider.getTranslationStatus()
        : { total: 0, done: 0, pct: 0, isAllDone: false, running: false },
    );
    (0, React.useEffect)(() => {
      const updateStatus = (status) => {
        if (status && typeof status === "object" && "done" in status) {
          setBatchProgress(status);
        } else if (captionProvider.getTranslationStatus) {
          setBatchProgress(captionProvider.getTranslationStatus());
        }
      };
      captionProvider.event?.on?.("changed", updateStatus);
      captionProvider.event?.on?.("translation:progress", updateStatus);
      captionProvider.event?.on?.("video.change", updateStatus);
      return () => {
        captionProvider.event?.off?.("changed", updateStatus);
        captionProvider.event?.off?.("translation:progress", updateStatus);
        captionProvider.event?.off?.("video.change", updateStatus);
      };
    }, []);
    (0, React.useEffect)(() => {
      const e = () => {
        if (transcriptionTask.current?.native) {
          void globalThis.lexihaloCancelTranscription?.(
            transcriptionTask.current.id,
          );
        }
        if (videoDownloadTask.current) {
          void globalThis.lexihaloCancelVideoDownload?.(
            videoDownloadTask.current,
          );
          videoDownloadTask.current = null;
        }
        "youtube" === captionProvider.platform &&
          s.enabled &&
          (U("none"),
          Y(!1),
          Z(!1),
          clearTimeout(J.current),
          (captionProvider.endableWhisper = !1),
          captionProvider.event.emit("transcription.status", {
            state: "idle",
          })),
          s.enabled || (I(!1), Z(!1));
      };
      return (
        captionProvider.event.on("video.change", e),
        () => {
          captionProvider.event.off("video.change", e),
            window.removeEventListener("popstate", e);
        }
      );
    }, [c, s.enabled]),
      (0, React.useEffect)(() => {
        T
          ? (ij(null, null, function* () {
              var e, t, n, r;
              const { message: i, data: a } =
                yield extensionClient.getCommands();
              if ("ok" !== i) return;
              const o =
                navigator.userAgent.indexOf("Win") >= 0 ||
                navigator.userAgent.indexOf("Firefox") >= 0;
              {
                const n = a.find((e) => "toggle" === e.name);
                if (n) {
                  const r = o
                    ? null == (e = n.shortcut)
                      ? void 0
                      : e.split("+")
                    : null == (t = n.shortcut)
                      ? void 0
                      : t.split("");
                  ie(r || []);
                }
              }
              {
                const e = a.find((e) => "caption-toggle" === e.name);
                if (e) {
                  const t = o
                    ? null == (n = e.shortcut)
                      ? void 0
                      : n.split("+")
                    : null == (r = e.shortcut)
                      ? void 0
                      : r.split("");
                  oe(t || []);
                }
              }
            }),
            !document.documentElement.classList.contains("xt-pannel-menu") &&
              document.documentElement.classList.add("xt-pannel-menu"))
          : document.documentElement.classList.remove("xt-pannel-menu");
      }, [T]);
    const le = [l.language.subtitle, l.language.translation],
      ce = () => {
        if (le.includes("und"))
          return (
            window.dispatchEvent(
              new CustomEvent("slider:toggle", {
                detail: {
                  path: "/setting/language",
                },
              }),
            ),
            !1
          );
        !T &&
          c &&
          ij(null, null, function* () {
            if (
              c &&
              "youtube" === captionProvider.platform &&
              platformContext.vid
            )
              try {
                const { message: e, data: t } = yield g.getVideo(
                  platformContext.vid,
                );
                "ok" === e && (null == t ? void 0 : t.video)
                  ? a(setVideoAction(null == t ? void 0 : t.video))
                  : a(setVideoAction(void 0));
              } catch (e) {}
          }),
          S(!T);
      },
      de = () => {
        extensionClient.track({
          name: "caption_toggle_" + (L ? "off" : "on"),
        }),
          (captionProvider.enabled = !L),
          captionProvider.event.emit(L ? "caption.disable" : "caption.enable"),
          clearTimeout(J.current),
          Y(!1),
          U("none"),
          c && X(),
          I(!L),
          S(!1);
      };
    (0, React.useEffect)(
      () => (
        extensionClient.on("caption-toggle", de),
        () => {
          extensionClient.off("caption-toggle");
        }
      ),
      [L],
    ),
      (0, React.useEffect)(() => {
        const e = (e) => {
          if (e instanceof CustomEvent) {
            const { detail: t } = e;
            t.body && a(t.body);
          }
        };
        return (
          window.addEventListener("edvideo:dispatch", e),
          () => {
            window.removeEventListener("edvideo:dispatch", e);
          }
        );
      }, []);
    const he = (t) => {
      var n;
      return (0, jsxRuntime.jsxs)("div", {
        className: xb()("trancy-menuitem-secondary", {
          "trancy-menuitem-engine-active":
            (null == (n = u.subtitle) ? void 0 : n._id) === t._id,
        }),
        onClick: (e) => {
          if ((e.stopPropagation(), e.preventDefault(), t.setupProvider))
            return extensionClient.open(
              `byok.html?provider=${encodeURIComponent(t.setupProvider)}`,
              !1,
            );
          if ("GLM" === t.provider && 1 === t.role && !c)
            return extensionClient.toggleSlider("/setting/signup");
          x(null),
            o(
              setTranslatorServiceAction({
                subtitle: t,
              }),
              !0,
            ),
            extensionClient.track({
              name: "caption_translation_engine_change",
              event_value: t.model,
            });
        },
        children: [
          (0, jsxRuntime.jsx)(c_, {
            className: "trancy-menuitem-engine-icon",
            name: t.icon || t.provider,
          }),
          (0, jsxRuntime.jsx)("span", {
            children: t.name,
          }),
          !t.available &&
            "trancy" === t.type &&
            (0, jsxRuntime.jsx)("div", {
              className: "advance-ai-tag",
              children: "AI",
            }),
          (0, jsxRuntime.jsx)("div", {
            className: "icon-engine-check",
            children: (0, jsxRuntime.jsx)(pt, {}),
          }),
        ],
      });
    };
    (0, React.useEffect)(() => {
      const e = (e) =>
        ij(null, null, function* () {
          s.enabled &&
            ("ok" !== $
              ? ne()
              : (Z(!K),
                captionProvider.event.emit("whisperx", {
                  enabled: !K,
                })));
        });
      return (
        extensionClient.off("ai-transcribe"),
        extensionClient.on("ai-transcribe", e),
        () => {
          extensionClient.off("ai-transcribe");
        }
      );
    }, [K, $, s.enabled]);
    const menuMaxHeight = () => {
      if (
        captionProvider.video?.tagName === "AUDIO" ||
        globalThis.lexihaloSites?.siteOf(location.href)?.audio
      ) {
        return Math.max(120, window.innerHeight - 180);
      }
      const height = document
        .querySelector("trancy-caption-window")
        ?.getBoundingClientRect().height;
      return height ? 0.75 * height : undefined;
    };
    const ve = nj(
        {},
        A
          ? {
              height: A,
            }
          : {},
      ),
      [be, xe] = (0, React.useState)(menuMaxHeight);
    (0, React.useEffect)(() => {
      const e = () => {
        xe(menuMaxHeight());
      };
      return (
        window.addEventListener("resize", e),
        () => window.removeEventListener("resize", e)
      );
    }, []);
    const mediaAction = (label, action, attributes = {}, Icon = yt) =>
      (0, jsxRuntime.jsxs)("div", {
        className: "trancy-menuitem lexihalo-media-action",
        role: "button",
        tabIndex: 0,
        ...attributes,
        onClick: (event) => {
          event.stopPropagation();
          action();
        },
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            action();
          }
        },
        children: [
          (0, jsxRuntime.jsx)("div", {
            className: "trancy-menuitem-icon",
            "aria-hidden": true,
            children: (0, jsxRuntime.jsx)(Icon, {}),
          }),
          (0, jsxRuntime.jsx)("div", {
            className: "trancy-menuitem-label",
            children: label,
          }),
          (0, jsxRuntime.jsx)("div", {
            className: "trancy-menuitem-action",
            "aria-hidden": true,
            children: (0, jsxRuntime.jsx)(Ct, {}),
          }),
        ],
      });
    const mediaPanel = (title, children, back = null) =>
      (0, jsxRuntime.jsxs)("div", {
        className:
          "trancy-second-panel-menu-container lexihalo-media-workflow-panel",
        ref: C,
        children: [
          (0, jsxRuntime.jsx)("div", {
            className: "second-panel-menu-header",
            children: (0, jsxRuntime.jsxs)("div", {
              className: "btn-back-panel-header",
              role: "button",
              tabIndex: 0,
              onClick: (event) => {
                event.stopPropagation();
                event.preventDefault();
                x(back);
              },
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  x(back);
                }
              },
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-panel-close-icon",
                  children: (0, jsxRuntime.jsx)(St, {}),
                }),
                (0, jsxRuntime.jsx)("span", { children: title }),
              ],
            }),
          }),
          (0, jsxRuntime.jsx)("div", {
            className: "trancy-second-panel-menu-content",
            children,
          }),
        ],
      });
    const currentMediaItem = globalThis.lexihaloSiteAdapters?.currentItem?.();
    const openCurrentTrackPage = () => {
      const url = globalThis.lexihaloSiteAdapters?.currentItem?.()?.trackUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
    const hasMediaPage = Boolean(
      globalThis.lexihaloMediaPageUrl?.({
        platform: captionProvider.platform,
        context: platformContext,
      }),
    );
    const hasNativeMediaPage =
      hasMediaPage && globalThis.lexihaloCanNativePageParse?.() === true;
    const hasMediaAdvanced =
      hasMediaPage &&
      (hasNativeMediaPage || Boolean(currentMediaItem?.trackUrl));
    const Te = be ? Math.max(0, Math.min(414, Math.floor(be) - 41)) : 414;
    return (0, jsxRuntime.jsxs)("div", {
      className: xb()("trancy-button-container", `lt-${l.language.interface}`),
      "data-lexihalo-menu-open": T ? "true" : "false",
      ref: P,
      children: [
        (0, jsxRuntime.jsx)("div", {
          className: xb()("trancy-button-logo", {
            "trancy-magic-btn": K,
            "trancy-magic-btn-loading": G,
          }),
          onClick: () => {
            ce(),
              extensionClient.track({
                name: "caption_pannel_open",
                platform: captionProvider.platform,
                learning_entry: y,
              });
          },
          children: (0, jsxRuntime.jsx)("img", {
            className: "icon-trancy-brand lexihalo-brand-icon",
            src: `${props.runtime.scheme}/assets/icons/ic48.png`,
            alt: "澄 Cheng",
            draggable: !1,
          }),
        }),
        (0, jsxRuntime.jsx)("div", {
          className: xb()("trancy-panel-menu", {
            "show-second": w,
            "lexihalo-download-menu": w === "video-download",
            visible: T,
          }),
          style: rj(nj({}, ve), {
            maxHeight: be,
            "--tc-second-content-max": `${Te}px`,
          }),
          children: (0, jsxRuntime.jsxs)("div", {
            className: "trancy-panel-menu-container",
            style: ve,
            children: [
              (0, jsxRuntime.jsxs)("div", {
                className: "trancy-primary-panel-menu",
                children: [
                  O &&
                    (0, jsxRuntime.jsx)("div", {
                      className: "trancy-caption-source-banner",
                      children: f("caption_source_waiting"),
                    }),
                  R &&
                    !O &&
                    s.enabled &&
                    "dual" === s.mode &&
                    (0, jsxRuntime.jsx)("div", {
                      className: "trancy-caption-source-banner",
                      children: f(
                        captionProvider.hasExternalCorpus
                          ? "caption_same_language_player"
                          : "caption_same_language_setting",
                      ),
                    }),
                  !M &&
                    l.hoverDict &&
                    !O &&
                    s.enabled &&
                    ["dual", "target"].includes(s.mode) &&
                    !(R && "dual" === s.mode) &&
                    (0, jsxRuntime.jsx)("div", {
                      className: "trancy-caption-source-banner",
                      children: f("caption_lookup_off").replace(
                        "{language}",
                        (null ==
                        (r = jn.find((e) => e.code === l.language.subtitle))
                          ? void 0
                          : r.nativeName) || l.language.subtitle,
                      ),
                    }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "trancy-menuitem-group",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(dt, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [
                              f("caption_trancy"),
                              (0, jsxRuntime.jsxs)("div", {
                                className: "trancy-menuitem-label-info",
                                children: [
                                  (0, jsxRuntime.jsx)(pe, {}),
                                  (0, jsxRuntime.jsx)("div", {
                                    className:
                                      "trancy-menuitem-label-info-tooltip",
                                    children: f("turn_on_forever_tips"),
                                  }),
                                ],
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-action",
                            onClick: (e) => {
                              e.stopPropagation();
                            },
                            children: [
                              !s.enabled &&
                                !d.includes("caption-guide") &&
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-new-arrow",
                                  children: (0, jsxRuntime.jsx)(Lt, {}),
                                }),
                              (0, jsxRuntime.jsx)(SS, {
                                checked: s.enabled,
                                onChange: (e, t) => {
                                  extensionClient.track({
                                    name:
                                      "caption_toggle_" +
                                      (s.enabled ? "off" : "on"),
                                  }),
                                    s.enabled
                                      ? (captionProvider.event.emit(
                                          "caption.disable",
                                        ),
                                        clearTimeout(J.current),
                                        Y(!1),
                                        U("none"),
                                        Z(!1),
                                        I(!1))
                                      : captionProvider.event.emit(
                                          "caption.enable",
                                        ),
                                    o(setDualCaptionEnabledAction(!s.enabled));
                                },
                              }),
                            ],
                          }),
                        ],
                      }),
                      !s.enabled &&
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-menuitem",
                          onClick: de,
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-icon",
                              children: (0, jsxRuntime.jsx)(je, {}),
                            }),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "trancy-menuitem-label",
                              children: [
                                f("turn_on_temp_label"),
                                (0, jsxRuntime.jsxs)("div", {
                                  className: "trancy-menuitem-label-info",
                                  children: [
                                    (0, jsxRuntime.jsx)(pe, {}),
                                    (0, jsxRuntime.jsx)("div", {
                                      className:
                                        "trancy-menuitem-label-info-tooltip",
                                      children: (0, jsxRuntime.jsx)("div", {
                                        className: "trancy-menuitem-shrotcut",
                                        children: f("turn_on_temp_tips"),
                                      }),
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "trancy-menuitem-action",
                              children: [
                                L
                                  ? (0, jsxRuntime.jsx)("div", {
                                      className: "trancy-action-label",
                                      children: f("turn_on_temp_action_label"),
                                    })
                                  : (0, jsxRuntime.jsxs)("div", {
                                      className: "tc-shortcuts",
                                      children: [
                                        "Safari" === detectBrowser() &&
                                        p &&
                                        p.captionToggle
                                          ? Kt(p.captionToggle)
                                          : "",
                                        "Safari" !== detectBrowser() &&
                                        (null == ae ? void 0 : ae.length) > 1
                                          ? ae.join("+")
                                          : "",
                                      ],
                                    }),
                                (0, jsxRuntime.jsx)(Ct, {}),
                              ],
                            }),
                          ],
                        }),
                    ],
                  }),
                  (0, jsxRuntime.jsx)("div", {
                    className: "trancy-menuitem-group",
                    children: (0, jsxRuntime.jsxs)("div", {
                      className: xb()("trancy-menuitem", {
                        disabled: G && !transcriptionTask.current?.native,
                      }),
                      role: "button",
                      tabIndex: 0,
                      "data-lexihalo-audio-transcribe": "true",
                      onClick: () => {
                        void ne();
                      },
                      onKeyDown: (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void ne();
                        }
                      },
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-menuitem-icon",
                          children: (0, jsxRuntime.jsx)(yt, {}),
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-menuitem-label",
                          children: String(
                            l.language.interface || "",
                          ).startsWith("zh")
                            ? "AI 字幕"
                            : "AI Captions",
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-menuitem-action",
                          children: (0, jsxRuntime.jsx)("div", {
                            className: "trancy-action-label",
                            children: G ? Q : K ? f("caption_ai_status_3") : "",
                          }),
                        }),
                      ],
                    }),
                  }),
                  globalThis.lexihaloMediaPageUrl?.({
                    platform: captionProvider.platform,
                    context: platformContext,
                  }) &&
                    (0, jsxRuntime.jsx)("div", {
                      className: "trancy-menuitem-group",
                      children: (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        role: "button",
                        tabIndex: 0,
                        "data-lexihalo-video-download": "true",
                        onClick: () => {
                          void openVideoDownload();
                        },
                        onKeyDown: (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void openVideoDownload();
                          }
                        },
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(Le, {}),
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-label",
                            children: String(
                              l.language.interface || "",
                            ).startsWith("zh")
                              ? "下载媒体"
                              : "Download media",
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-action",
                            children: (0, jsxRuntime.jsx)(Ct, {}),
                          }),
                        ],
                      }),
                    }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "trancy-menuitem-group",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        onClick: () => {
                          x("target-language"),
                            extensionClient.track({
                              name: "caption_target_language_open",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(kt, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [f("caption_primary"), " "],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-action",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-action-label",
                                children: null == h ? void 0 : h.nativeName,
                              }),
                              (0, jsxRuntime.jsx)(Ct, {}),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        onClick: () => x("native-language"),
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(me, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [f("caption_translation"), " "],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-action",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-action-label",
                                children: null == m ? void 0 : m.nativeName,
                              }),
                              (0, jsxRuntime.jsx)(Ct, {}),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  null,
                  (0, jsxRuntime.jsxs)("div", {
                    className: "trancy-menuitem-group",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        onClick: (e) => {
                          e.stopPropagation(),
                            e.preventDefault(),
                            x("translator-engine"),
                            ij(null, null, function* () {
                              const { message: e, data: t } =
                                yield g.getTranslatorEngines();
                              logDebug("updateTranslatorService", {
                                message: e,
                                data: t,
                              }),
                                "ok" === e &&
                                  t.engines.length &&
                                  (o(
                                    initTranslatorServiceAction({
                                      engines: t.engines,
                                      quota: t.quota,
                                    }),
                                  ),
                                  j(0));
                            }),
                            extensionClient.track({
                              name: "caption_translation_engine_open",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(yt, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [f("caption_translation_engine"), " "],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-action",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-action-label",
                                children: u.subtitle.name,
                              }),
                              (0, jsxRuntime.jsx)(Ct, {}),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        onClick: () => x("caption-mode"),
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(fe, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [f("caption_type"), " "],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-action",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-action-label",
                                children:
                                  null ==
                                  (i = se.find((e) => e.value === s.mode))
                                    ? void 0
                                    : i.label,
                              }),
                              (0, jsxRuntime.jsx)(Ct, {}),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        onClick: () => {
                          document.querySelector("trancy-caption-setting")
                            ? H()
                            : (ij(null, null, function* () {
                                let t = document.querySelector(
                                  "trancy-caption-setting",
                                );
                                t ||
                                  (t = yield createCustomElementRoot({
                                    root: document.documentElement,
                                    tag: "trancy-caption-setting",
                                    attributes: {
                                      id: "trancy-caption-setting",
                                      class: `lt-${l.language.interface}`,
                                    },
                                  }));
                                const n = yield extensionClient.getStateChunks({
                                  only: ["dualCaption", "setting"],
                                });
                                (b.current = ReactDOMClient.createRoot(t)),
                                  yield createAppStore(n),
                                  b.current.render(
                                    (0, jsxRuntime.jsx)(ReduxProvider, {
                                      store: appStore,
                                      children: (0, jsxRuntime.jsx)(UA, {
                                        onClose: H,
                                      }),
                                    }),
                                  );
                              }),
                              x(null),
                              S(!1)),
                            extensionClient.track({
                              name: "caption_style_open",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(ge, {}),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "trancy-menuitem-label",
                            children: [f("caption_style"), " "],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-action",
                            children: (0, jsxRuntime.jsx)(Ct, {}),
                          }),
                        ],
                      }),
                      k &&
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-menuitem",
                          onClick: () => {
                            x("caption-control"),
                              extensionClient.track({
                                name: "caption_line_control_open",
                              });
                          },
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-icon",
                              children: (0, jsxRuntime.jsx)(vt, {}),
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-label",
                              children: f("caption_control"),
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-action",
                              children: (0, jsxRuntime.jsx)(Ct, {}),
                            }),
                          ],
                        }),
                      false &&
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-menuitem",
                          onClick: () => {
                            const lines = captionProvider.lines || [];
                            if (!lines.length) {
                              return void $w.info("当前视频暂无可用字幕");
                            }

                            const isAiEngineActive = Boolean(
                              captionProvider.engine?.model &&
                                (String(
                                  captionProvider.engine._id || "",
                                ).startsWith("byok-") ||
                                  [
                                    "OpenAI",
                                    "OpenRouter",
                                    "DeepSeek",
                                    "Google",
                                    "Anthropic",
                                    "Custom",
                                    "AI",
                                  ].includes(
                                    captionProvider.engine.providerId ||
                                      captionProvider.engine.provider,
                                  )),
                            );

                            const isLineAiDone = (l) =>
                              Boolean(
                                l &&
                                  l.AITranslation &&
                                  typeof l.AITranslation === "string" &&
                                  l.AITranslation.trim().length > 0 &&
                                  !l.AITranslation.includes("AI 翻译失败") &&
                                  !l.AITranslation.includes("superseded"),
                              );

                            const isLineDone = isAiEngineActive
                              ? isLineAiDone
                              : (l) =>
                                  Boolean(
                                    l &&
                                      (l.translation || l.AITranslation) &&
                                      !String(
                                        l.translation || l.AITranslation,
                                      ).includes("AI 翻译失败"),
                                  );

                            const triggerDownloadSrt = (content, filename) => {
                              const blob = new Blob(["\ufeff" + content], {
                                type: "application/octet-stream",
                              });
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.style.display = "none";
                              a.href = url;
                              a.setAttribute("download", filename);
                              a.download = filename;
                              document.body.appendChild(a);
                              a.click();
                              setTimeout(() => {
                                try {
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(url);
                                } catch {}
                              }, 60000);
                            };

                            const getCleanSrtFilename = (title, suffix) => {
                              const safe = String(title || "subtitle")
                                .replace(/[\/\\:*?"<>|]/g, "_")
                                .replace(/[\r\n\t]/g, "")
                                .replace(/\s+/g, " ")
                                .trim()
                                .slice(0, 100);
                              return `${safe || "video"}_${suffix}.srt`;
                            };

                            const downloadBilingualFile = (srcLines) => {
                              const list =
                                srcLines || captionProvider.lines || [];
                              const content = list
                                .map((item, idx) => {
                                  const trans = (
                                    item.AITranslation ||
                                    item.translation ||
                                    ""
                                  ).trim();
                                  const repairedSource = (
                                    item.repairedText ||
                                    item.text ||
                                    item.originalText ||
                                    ""
                                  ).trim();
                                  const body =
                                    trans && trans !== repairedSource
                                      ? `${trans}\r\n${repairedSource}`
                                      : repairedSource || trans;
                                  return [
                                    idx + 1,
                                    `${W(item.start)} --\x3e ${W(item.end)}`,
                                    body || "",
                                  ].join("\r\n");
                                })
                                .join("\r\n\r\n");

                              triggerDownloadSrt(
                                content,
                                getCleanSrtFilename(
                                  platformContext.title,
                                  "双语字幕",
                                ),
                              );
                            };

                            const untranslated = lines.filter(
                              (l) => !isLineDone(l),
                            );
                            if (untranslated.length === 0) {
                              downloadBilingualFile(lines);
                              $w.success("完整双语字幕已成功下载！");
                              return;
                            }

                            if (captionProvider._isExportTranslating) {
                              return void $w.info(
                                `字幕正在全速处理中（当前进度：${lines.length - untranslated.length}/${lines.length}），全部处理完毕后将自动下载！`,
                                4e3,
                              );
                            }

                            $w.info(
                              `检测到尚有 ${untranslated.length} 条字幕未经AI处理，正在全速为您处理，处理完将自动下载！`,
                              5e3,
                            );

                            captionProvider._isExportTranslating = true;
                            const to =
                              captionProvider.to ||
                              s.native ||
                              l.language.translation ||
                              "zh-CN";
                            const from =
                              captionProvider.from ||
                              s.target ||
                              l.language.subtitle ||
                              "auto";
                            const engine = captionProvider.engine;

                            ij(null, null, function* () {
                              try {
                                const batchSize = 6;
                                while (
                                  !captionProvider.isDestroyed &&
                                  captionProvider._isExportTranslating
                                ) {
                                  const curLines = captionProvider.lines || [];
                                  const remain = curLines.filter(
                                    (item) => !isLineDone(item),
                                  );
                                  if (!remain.length) break;

                                  const doneCount =
                                    curLines.length - remain.length;
                                  const pct = Math.round(
                                    (doneCount / curLines.length) * 100,
                                  );
                                  setBatchProgress({
                                    total: curLines.length,
                                    done: doneCount,
                                    pct,
                                    running: true,
                                    isAllDone: false,
                                  });

                                  const currentBatch = remain.slice(
                                    0,
                                    batchSize,
                                  );
                                  const texts = currentBatch.map(
                                    (item) => item.originalText || item.text,
                                  );

                                  try {
                                    const results =
                                      yield extensionClient.translateWithEngine(
                                        {
                                          texts,
                                          from,
                                          to,
                                          engine,
                                          cacheScope: "subtitle",
                                          useCache: true,
                                          requestGroup: captionProvider.id,
                                          requestGeneration:
                                            captionProvider.translationGeneration ||
                                            0,
                                        },
                                      );

                                    if (
                                      Array.isArray(results) &&
                                      results.length
                                    ) {
                                      const cache =
                                        captionProvider.captionCache.get(
                                          captionProvider.id,
                                        );
                                      if (cache) {
                                        const updateList = (arr) =>
                                          Array.isArray(arr)
                                            ? arr.map((line) => {
                                                const bIdx =
                                                  currentBatch.findIndex(
                                                    (b) => b.idx === line.idx,
                                                  );
                                                if (
                                                  bIdx >= 0 &&
                                                  results[bIdx]?.message ===
                                                    "ok"
                                                ) {
                                                  const res = results[bIdx];
                                                  return {
                                                    ...line,
                                                    text:
                                                      res.repairedText ||
                                                      line.text,
                                                    AITranslation:
                                                      res.translation,
                                                    translation:
                                                      res.translation,
                                                    originalText:
                                                      line.originalText ||
                                                      line.text,
                                                    message: undefined,
                                                  };
                                                }
                                                return line;
                                              })
                                            : arr;

                                        captionProvider.captionCache.set(
                                          captionProvider.id,
                                          {
                                            ...cache,
                                            lines: updateList(cache.lines),
                                            builtinLines: updateList(
                                              cache.builtinLines,
                                            ),
                                            whisperLines: updateList(
                                              cache.whisperLines,
                                            ),
                                          },
                                        );
                                        captionProvider.event.emit("changed", {
                                          current: captionProvider.current,
                                          forceUpdate: true,
                                        });
                                      }
                                    }
                                  } catch (err) {
                                    console.warn(
                                      "[LexiHalo] Batch export translate error:",
                                      err,
                                    );
                                  }

                                  yield new Promise((r) => setTimeout(r, 350));
                                }

                                const finalLines = captionProvider.lines || [];
                                const finalRemain = finalLines.filter(
                                  (item) => !isLineDone(item),
                                );
                                const allDone = finalRemain.length === 0;

                                setBatchProgress({
                                  total: finalLines.length,
                                  done: finalLines.length - finalRemain.length,
                                  pct: allDone
                                    ? 100
                                    : Math.round(
                                        ((finalLines.length -
                                          finalRemain.length) /
                                          finalLines.length) *
                                          100,
                                      ),
                                  running: false,
                                  isAllDone: allDone,
                                });

                                if (allDone) {
                                  downloadBilingualFile(finalLines);
                                  $w.success(
                                    "全视频字幕已全部AI处理完成，完整双语字幕已成功下载！",
                                    4e3,
                                  );
                                } else {
                                  downloadBilingualFile(finalLines);
                                  $w.error(
                                    "部分字幕翻译遇到网络或配额限制，已将完成部分下载",
                                    4e3,
                                  );
                                }
                              } finally {
                                captionProvider._isExportTranslating = false;
                              }
                            });
                          },
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-icon",
                              children: (0, jsxRuntime.jsx)(Le, {}),
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-label",
                              children: "下载完整双语字幕 (.srt)",
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "trancy-menuitem-action",
                              children: (0, jsxRuntime.jsx)("span", {
                                style: {
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  color: batchProgress.isAllDone
                                    ? "#10b981"
                                    : batchProgress.running
                                      ? "#f59e0b"
                                      : "#9ca3af",
                                },
                                children: batchProgress.isAllDone
                                  ? "已就绪 (点击下载)"
                                  : batchProgress.running
                                    ? `处理中 ${batchProgress.pct}%`
                                    : `${batchProgress.done}/${batchProgress.total} (点击处理)`,
                              }),
                            }),
                          ],
                        }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "trancy-menuitem",
                        "data-lexihalo-more-settings": "true",
                        onClick: () => {
                          x("more-settings");
                        },
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-icon",
                            children: (0, jsxRuntime.jsx)(gt, {}),
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-label",
                            children: f("more_settings"),
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "trancy-menuitem-action",
                            children: (0, jsxRuntime.jsx)(Ct, {}),
                          }),
                        ],
                      }),
                    ],
                  }),
                  null,
                ],
              }),
              (0, jsxRuntime.jsxs)("div", {
                className: "trancy-second-panel-menu",
                children: [
                  "media-fallback" === w &&
                    mediaFallback &&
                    mediaPanel(
                      mediaFallback.action === "transcribe"
                        ? "AI 字幕处理提示"
                        : "媒体下载提示",
                      [
                        (0, jsxRuntime.jsx)("div", {
                          className: "lexihalo-media-note",
                          role: "status",
                          "data-lexihalo-media-fallback-reason": "true",
                          children: mediaFallback.reason,
                        }),
                        mediaAction(
                          mediaFallback.trackUrl
                            ? "打开当前曲目页"
                            : mediaFallback.helperUnavailable
                              ? "安装后重新检查并重试"
                              : "改用本地助手解析",
                          () => {
                            if (mediaFallback.videoId !== captionProvider.id) {
                              setMediaFallback(null);
                              x(null);
                              N("媒体已切换，请重新选择操作");
                              return;
                            }
                            if (mediaFallback.trackUrl) {
                              openCurrentTrackPage();
                              return;
                            }
                            if (mediaFallback.format) {
                              void downloadVideoFormat(mediaFallback.format);
                              return;
                            }
                            if (mediaFallback.action === "transcribe")
                              void ne(mediaFallback.forceNative);
                            else
                              void openVideoDownload(mediaFallback.forceNative);
                          },
                          { "data-lexihalo-media-fallback-action": "true" },
                          mediaFallback.action === "download" ? Le : yt,
                        ),
                        mediaFallback.helperUnavailable &&
                          mediaAction(
                            "打开本地助手设置",
                            () =>
                              extensionClient.open(
                                "byok.html#local-helper",
                                !1,
                              ),
                            { "data-lexihalo-helper-settings": "true" },
                            gt,
                          ),
                      ],
                    ),
                  "media-advanced" === w &&
                    mediaPanel(
                      "媒体处理高级选项",
                      [
                        (0, jsxRuntime.jsx)("div", {
                          className: "lexihalo-media-note",
                          children: currentMediaItem?.requiresTrackPage
                            ? "专辑页只读取当前选中曲目的音频，不会整张解析专辑。如需本地页面解析，请先打开当前曲目的独立页面。"
                            : "默认优先读取当前播放器。仅在需要时手动改用本地页面解析；使用前会检查助手并请求确认，不保证所有网站可用，不绕过登录或 DRM。",
                        }),
                        currentMediaItem?.requiresTrackPage &&
                          currentMediaItem.trackUrl &&
                          mediaAction(
                            "打开当前曲目页",
                            openCurrentTrackPage,
                            { "data-lexihalo-open-track-page": "true" },
                            gt,
                          ),
                        hasNativeMediaPage &&
                          mediaAction(
                            "AI 字幕（本地页面解析）",
                            () => {
                              void ne(true);
                            },
                            { "data-lexihalo-native-transcribe": "true" },
                          ),
                        hasNativeMediaPage &&
                          mediaAction(
                            "下载媒体（本地页面解析）",
                            () => {
                              void openVideoDownload(true);
                            },
                            { "data-lexihalo-native-download": "true" },
                            Le,
                          ),
                      ],
                      "more-settings",
                    ),
                  "video-download" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className:
                        "trancy-second-panel-menu-container lexihalo-video-download-panel",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "second-panel-menu-header",
                          children: [
                            (0, jsxRuntime.jsxs)("div", {
                              className: "btn-back-panel-header",
                              onClick: (event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                x(null);
                              },
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-panel-close-icon",
                                  children: (0, jsxRuntime.jsx)(St, {}),
                                }),
                                (0, jsxRuntime.jsx)("span", {
                                  children: "下载媒体",
                                }),
                              ],
                            }),
                            videoDownloadState.status === "downloading" &&
                              (0, jsxRuntime.jsx)("div", {
                                className:
                                  "btn-back-panel-action lexihalo-download-cancel",
                                role: "button",
                                tabIndex: 0,
                                "aria-label": "取消视频下载",
                                onClick: (event) => {
                                  event.stopPropagation();
                                  cancelVideoDownload();
                                },
                                onKeyDown: (event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    cancelVideoDownload();
                                  }
                                },
                                children: "取消",
                              }),
                          ],
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: [
                            videoDownloadState.message &&
                              (0, jsxRuntime.jsxs)("div", {
                                className: xb()(
                                  "trancy-menuitem trancy-menuitem-static lexihalo-download-status",
                                  {
                                    disabled:
                                      videoDownloadState.status === "loading",
                                    done: videoDownloadState.status === "done",
                                    error:
                                      videoDownloadState.status === "error",
                                  },
                                ),
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "trancy-menuitem-label",
                                    title: videoDownloadState.message,
                                    children: videoDownloadState.message,
                                  }),
                                  videoDownloadState.status === "downloading" &&
                                    (0, jsxRuntime.jsxs)("div", {
                                      className:
                                        "lexihalo-download-progress-row",
                                      children: [
                                        (0, jsxRuntime.jsx)("div", {
                                          className:
                                            "lexihalo-download-progress-track",
                                          role: "progressbar",
                                          "aria-valuemin": 0,
                                          "aria-valuemax": 100,
                                          "aria-valuenow": Math.round(
                                            videoDownloadState.percent || 0,
                                          ),
                                          children: (0, jsxRuntime.jsx)(
                                            "span",
                                            {
                                              style: {
                                                width: `${Math.max(
                                                  0,
                                                  Math.min(
                                                    100,
                                                    videoDownloadState.percent ||
                                                      0,
                                                  ),
                                                )}%`,
                                              },
                                            },
                                          ),
                                        }),
                                        (0, jsxRuntime.jsx)("span", {
                                          className:
                                            "lexihalo-download-progress-value",
                                          children: `${Math.round(
                                            videoDownloadState.percent || 0,
                                          )}%`,
                                        }),
                                      ],
                                    }),
                                ],
                              }),
                            videoFormats.map((format) =>
                              (0, jsxRuntime.jsxs)(
                                "div",
                                {
                                  className: xb()(
                                    "trancy-menuitem lexihalo-download-format",
                                    {
                                      disabled:
                                        videoDownloadState.status ===
                                        "downloading",
                                    },
                                  ),
                                  role: "button",
                                  tabIndex: 0,
                                  onClick: (event) => {
                                    event.stopPropagation();
                                    void downloadVideoFormat(format);
                                  },
                                  onKeyDown: (event) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void downloadVideoFormat(format);
                                    }
                                  },
                                  children: [
                                    (0, jsxRuntime.jsx)("div", {
                                      className: "trancy-menuitem-icon",
                                      children: (0, jsxRuntime.jsx)(Le, {}),
                                    }),
                                    (0, jsxRuntime.jsxs)("div", {
                                      className:
                                        "trancy-menuitem-label lexihalo-download-format-copy",
                                      children: [
                                        (0, jsxRuntime.jsx)("span", {
                                          className:
                                            "lexihalo-download-format-title",
                                          children: format.label,
                                        }),
                                        (0, jsxRuntime.jsx)("span", {
                                          className:
                                            "lexihalo-download-format-meta",
                                          children: [
                                            format.ext?.toUpperCase(),
                                            format.codecLabel,
                                            !format.hasAudio
                                              ? "自动合并音频"
                                              : "含音频",
                                          ]
                                            .filter(Boolean)
                                            .join(" · "),
                                        }),
                                      ],
                                    }),
                                    (0, jsxRuntime.jsx)("div", {
                                      className: "trancy-menuitem-action",
                                      children: (0, jsxRuntime.jsx)("div", {
                                        className: "trancy-action-label",
                                        children: format.filesize
                                          ? `${(
                                              format.filesize /
                                              1024 /
                                              1024
                                            ).toFixed(0)} MB`
                                          : "—",
                                      }),
                                    }),
                                  ],
                                },
                                format.formatId,
                              ),
                            ),
                          ],
                        }),
                      ],
                    }),
                  "more-settings" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: (0, jsxRuntime.jsxs)("div", {
                            className: "btn-back-panel-header",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-panel-close-icon",
                                children: (0, jsxRuntime.jsx)(St, {}),
                              }),
                              (0, jsxRuntime.jsx)("span", {
                                children: f("more_settings"),
                              }),
                            ],
                          }),
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: [
                            hasMediaAdvanced &&
                              mediaAction(
                                "媒体处理高级选项",
                                () => {
                                  setMediaFallback(null);
                                  x("media-advanced");
                                },
                                { "data-lexihalo-media-advanced": "true" },
                                gt,
                              ),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "trancy-menuitem",
                              onClick: () => {
                                const status =
                                  captionProvider.getTranslationStatus
                                    ? captionProvider.getTranslationStatus()
                                    : {
                                        total: 0,
                                        done: 0,
                                        pct: 0,
                                        isAllDone: false,
                                        running: false,
                                      };
                                if (!status.total) {
                                  return void $w.info("当前视频暂无可用字幕");
                                }
                                if (status.isAllDone) {
                                  try {
                                    captionProvider.downloadBilingualSrt(
                                      platformContext.title,
                                    );
                                    $w.success("完整双语字幕下载成功！");
                                  } catch (err) {
                                    $w.error(err?.message || "下载失败");
                                  }
                                  return;
                                }
                                if (status.running) {
                                  return void $w.info(
                                    `字幕正在处理中 (${status.done}/${status.total}，${status.pct}%)，全部处理完成后将自动开启下载！`,
                                    4e3,
                                  );
                                }
                                $w.info(
                                  `正在开始处理全视频字幕 (${status.done}/${status.total})，全部处理完成后将自动下载！`,
                                  4e3,
                                );
                                captionProvider.translateAllRemaining(
                                  (prog) => {
                                    setBatchProgress(prog);
                                    if (prog.isAllDone) {
                                      try {
                                        captionProvider.downloadBilingualSrt(
                                          platformContext.title,
                                        );
                                        $w.success(
                                          "字幕全部处理完成，双语字幕已自动下载！",
                                        );
                                      } catch (err) {
                                        $w.error(err?.message || "下载失败");
                                      }
                                    }
                                  },
                                );
                              },
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-icon",
                                  children: (0, jsxRuntime.jsx)(Le, {}),
                                }),
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-label",
                                  children: "下载完整双语字幕 (.srt)",
                                }),
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-action",
                                  children: (0, jsxRuntime.jsx)("span", {
                                    style: {
                                      fontSize: "12px",
                                      fontWeight: 500,
                                      color: batchProgress.isAllDone
                                        ? "#10b981"
                                        : batchProgress.running
                                          ? "#f59e0b"
                                          : "#9ca3af",
                                    },
                                    children: batchProgress.isAllDone
                                      ? "已就绪"
                                      : batchProgress.running
                                        ? `处理中 ${batchProgress.pct}%`
                                        : `${batchProgress.done}/${batchProgress.total} (点击处理)`,
                                  }),
                                }),
                              ],
                            }),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "trancy-menuitem",
                              onClick: () => {
                                var e;
                                (e = captionProvider.lines),
                                  ij(null, null, function* () {
                                    const t = e
                                        .map((e, t) =>
                                          [
                                            t + 1,
                                            `${W(e.start)} --\x3e ${W(e.end)}`,
                                            e.text || "",
                                          ].join("\r\n"),
                                        )
                                        .join("\r\n\r\n"),
                                      n = new Blob(["\ufeff" + t], {
                                        type: "application/octet-stream",
                                      }),
                                      r = window.URL.createObjectURL(n),
                                      safe = String(
                                        platformContext.title || "video",
                                      )
                                        .replace(/[\/\\:*?"<>|]/g, "_")
                                        .replace(/[\r\n\t]/g, "")
                                        .replace(/\s+/g, " ")
                                        .trim()
                                        .slice(0, 100);
                                    en(r, `${safe || "video"}_原始字幕.srt`);
                                    setTimeout(
                                      () => window.URL.revokeObjectURL(r),
                                      60000,
                                    );
                                  }),
                                  extensionClient.track({
                                    name: "caption_export_subtitle_open",
                                  });
                              },
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-icon",
                                  children: (0, jsxRuntime.jsx)(Le, {}),
                                }),
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-label",
                                  children: "下载原始字幕 (.srt)",
                                }),
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-action",
                                  children: (0, jsxRuntime.jsx)(Ct, {}),
                                }),
                              ],
                            }),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "trancy-menuitem",
                              onClick: () => {
                                extensionClient.toggleSlider(
                                  "Safari" === detectBrowser()
                                    ? "/setting/shortcuts-safari"
                                    : "/setting/shortcuts",
                                ),
                                  S(!1),
                                  extensionClient.track({
                                    name: "caption_shortcut_open",
                                  });
                              },
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-icon icon-19",
                                  children: (0, jsxRuntime.jsx)(vt, {}),
                                }),
                                (0, jsxRuntime.jsxs)("div", {
                                  className: "trancy-menuitem-label",
                                  children: [f("rd_keyboard_config"), " "],
                                }),
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-menuitem-action",
                                  children: (0, jsxRuntime.jsx)(Ct, {}),
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  "caption-control" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: [
                            (0, jsxRuntime.jsxs)("div", {
                              className: "btn-back-panel-header",
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-panel-close-icon",
                                  children: (0, jsxRuntime.jsx)(St, {}),
                                }),
                                (0, jsxRuntime.jsx)("span", {
                                  children: f("caption_control"),
                                }),
                              ],
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "btn-back-panel-action",
                              onClick: (e) => e.stopPropagation(),
                              children: (0, jsxRuntime.jsx)(SS, {
                                checked: !0 === s.hotkeys,
                                onChange: () => {
                                  const e = !0 !== s.hotkeys;
                                  o(setDualCaptionHotkeysAction(e)),
                                    extensionClient.track({
                                      name: "caption_line_control",
                                      action: "hotkeys",
                                      source: "menu",
                                      value: e ? "on" : "off",
                                    });
                                },
                              }),
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: [
                            ["prev", (0, jsxRuntime.jsx)(rt, {})],
                            ["replay", (0, jsxRuntime.jsx)(Pe, {})],
                            ["next", (0, jsxRuntime.jsx)(nt, {})],
                            ["autoPause", (0, jsxRuntime.jsx)(ke, {})],
                            ["loop", (0, jsxRuntime.jsx)(ot, {})],
                          ].map(([t, n]) =>
                            (0, jsxRuntime.jsxs)(
                              "div",
                              {
                                className: xb()(
                                  "trancy-menuitem trancy-menuitem-static",
                                  {
                                    disabled: !0 !== s.hotkeys,
                                  },
                                ),
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "trancy-menuitem-icon",
                                    children: n,
                                  }),
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "trancy-menuitem-label",
                                    children: f(
                                      "autoPause" === t
                                        ? "caption_control_auto_pause"
                                        : `caption_control_${t}`,
                                    ),
                                  }),
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "trancy-menuitem-action",
                                    children: (0, jsxRuntime.jsx)("span", {
                                      className: "trancy-caption-keycap",
                                      children: AA[t],
                                    }),
                                  }),
                                ],
                              },
                              t,
                            ),
                          ),
                        }),
                      ],
                    }),
                  null,
                  "target-language" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: (0, jsxRuntime.jsxs)("div", {
                            className: "btn-back-panel-header",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-panel-close-icon",
                                children: (0, jsxRuntime.jsx)(St, {}),
                              }),
                              (0, jsxRuntime.jsx)("span", {
                                children: f("caption_primary"),
                              }),
                            ],
                          }),
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: jn.map((t) =>
                            (0, jsxRuntime.jsxs)("div", {
                              className: xb()("trancy-menuitem-secondary", {
                                "trancy-menuitem-secondary-active":
                                  t.code === (null == h ? void 0 : h.code),
                              }),
                              onClick: (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  o(setDualCaptionTargetAction(t.code)),
                                  x(null);
                              },
                              children: [
                                (0, jsxRuntime.jsx)(pt, {}),
                                (0, jsxRuntime.jsx)("span", {
                                  children: t.nativeName,
                                }),
                              ],
                            }),
                          ),
                        }),
                      ],
                    }),
                  "native-language" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: (0, jsxRuntime.jsxs)("div", {
                            className: "btn-back-panel-header",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-panel-close-icon",
                                children: (0, jsxRuntime.jsx)(St, {}),
                              }),
                              (0, jsxRuntime.jsx)("span", {
                                children: f("caption_translation"),
                              }),
                            ],
                          }),
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: jn.map((t) =>
                            (0, jsxRuntime.jsxs)("div", {
                              className: xb()("trancy-menuitem-secondary", {
                                "trancy-menuitem-secondary-active":
                                  t.code === (null == m ? void 0 : m.code),
                              }),
                              onClick: (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  o(setDualCaptionNativeAction(t.code)),
                                  x(null);
                              },
                              children: [
                                (0, jsxRuntime.jsx)(pt, {}),
                                (0, jsxRuntime.jsx)("span", {
                                  children: t.nativeName,
                                }),
                              ],
                            }),
                          ),
                        }),
                      ],
                    }),
                  "translator-engine" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "second-panel-menu-header",
                          children: [
                            (0, jsxRuntime.jsxs)("div", {
                              className: "btn-back-panel-header",
                              onClick: (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  x(null);
                              },
                              children: [
                                (0, jsxRuntime.jsx)("div", {
                                  className: "trancy-panel-close-icon",
                                  children: (0, jsxRuntime.jsx)(St, {}),
                                }),
                                (0, jsxRuntime.jsx)("span", {
                                  children: f("caption_translation_engine"),
                                }),
                              ],
                            }),
                            (0, jsxRuntime.jsxs)("div", {
                              className: "btn-back-panel-action",
                              onClick: () => {
                                extensionClient.open("byok.html", !1);
                              },
                              children: [
                                (0, jsxRuntime.jsx)(Et, {}),
                                (0, jsxRuntime.jsx)("span", {
                                  children: f("caption_add_engine"),
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "engine-label",
                              children: f("engine_free"),
                            }),
                            u.engines
                              .filter((e) => e.enabled && 1 === e.role)
                              .map((e) => he(e)),
                            u.engines.filter(
                              (e) => e.enabled && "user" === e.type,
                            ).length > 0 &&
                              (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "engine-label",
                                    children: f("engine_custom"),
                                  }),
                                  u.engines
                                    .filter(
                                      (e) => e.enabled && "user" === e.type,
                                    )
                                    .map((e) => he(e)),
                                ],
                              }),
                          ],
                        }),
                      ],
                    }),
                  "caption-mode" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: (0, jsxRuntime.jsxs)("div", {
                            className: "btn-back-panel-header",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-panel-close-icon",
                                children: (0, jsxRuntime.jsx)(St, {}),
                              }),
                              (0, jsxRuntime.jsx)("span", {
                                children: f("caption_type"),
                              }),
                            ],
                          }),
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: se.map((t) =>
                            (0, jsxRuntime.jsxs)("div", {
                              className: xb()("trancy-menuitem-secondary", {
                                "trancy-menuitem-secondary-active":
                                  t.value === s.mode,
                              }),
                              onClick: (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  x(null),
                                  o(setDualCaptionModeAction(t.value)),
                                  extensionClient.track({
                                    name: `caption_mode_change_${t.value}`,
                                  }),
                                  extensionClient.track({
                                    name: "caption_mode_change",
                                    event_value: t.value,
                                  });
                              },
                              children: [
                                (0, jsxRuntime.jsx)(pt, {}),
                                (0, jsxRuntime.jsx)("span", {
                                  children: t.label,
                                }),
                              ],
                            }),
                          ),
                        }),
                      ],
                    }),
                  "export-subtitle" === w &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "trancy-second-panel-menu-container",
                      ref: C,
                      children: [
                        (0, jsxRuntime.jsx)("div", {
                          className: "second-panel-menu-header",
                          onClick: (e) => {
                            e.stopPropagation(), e.preventDefault(), x(null);
                          },
                          children: (0, jsxRuntime.jsxs)("div", {
                            className: "btn-back-panel-header",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "trancy-panel-close-icon",
                                children: (0, jsxRuntime.jsx)(St, {}),
                              }),
                              (0, jsxRuntime.jsx)("span", {
                                children: f("caption_type"),
                              }),
                            ],
                          }),
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "trancy-second-panel-menu-content",
                          children: ["srt", "vtt", "pdf"].map((t) =>
                            (0, jsxRuntime.jsxs)("div", {
                              className: xb()("trancy-menuitem-secondary", {
                                "trancy-menuitem-secondary-active":
                                  t === s.mode,
                              }),
                              onClick: (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  x(null);
                              },
                              children: [
                                (0, jsxRuntime.jsx)(pt, {}),
                                (0, jsxRuntime.jsx)("span", {
                                  children: t,
                                }),
                              ],
                            }),
                          ),
                        }),
                      ],
                    }),
                ],
              }),
            ],
          }),
        }),
      ],
    });
  };

  return VideoToggleButton;
}
