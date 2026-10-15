/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverDualCaptionApp(dependencies) {
  const AA = dependencies.AA;
  const At = dependencies.At;
  const CA = dependencies.CA;
  const DA = dependencies.DA;
  const EA = dependencies.EA;
  const E_ = dependencies.E_;
  const FA = dependencies.FA;
  const IA = dependencies.IA;
  const LA = dependencies.LA;
  const NA = dependencies.NA;
  const OA = dependencies.OA;
  const PA = dependencies.PA;
  const Qw = dependencies.Qw;
  const React = dependencies.React;
  const SA = dependencies.SA;
  const Se = dependencies.Se;
  const bA = dependencies.bA;
  const captionProvider = dependencies.captionProvider;
  const doTaskAction = dependencies.doTaskAction;
  const extensionClient = dependencies.extensionClient;
  const he = dependencies.he;
  const jA = dependencies.jA;
  const jsxRuntime = dependencies.jsxRuntime;
  const ke = dependencies.ke;
  const logDebug = dependencies.logDebug;
  const logError = dependencies.logError;
  const ot = dependencies.ot;
  const platformContext = dependencies.platformContext;
  const re = dependencies.re;
  const rx = dependencies.rx;
  const shallowEqual = dependencies.shallowEqual;
  const useAppDispatch = dependencies.useAppDispatch;
  const useAppSelector = dependencies.useAppSelector;
  const useLocale = dependencies.useLocale;
  const vA = dependencies.vA;
  const wA = dependencies.wA;
  const xA = dependencies.xA;
  const xb = dependencies.xb;
  const yA = dependencies.yA;
  const zt = dependencies.zt;

  const DualCaptionApp = (props) => {
    var n, r, i, a;
    const o = useAppDispatch(),
      {
        dualCaptionSetting: s,
        engine: l,
        setting: c,
        tasks: u,
      } = useAppSelector(
        (e) => ({
          dualCaptionSetting: e.dualCaption,
          engine: e.translatorService.subtitle,
          setting: e.setting,
          tasks: e.tasks,
        }),
        shallowEqual,
      ),
      [d, p] = (0, React.useState)(null),
      [_, h] = (0, React.useState)(!1),
      [transcriptionTip, setTranscriptionTip] = (0, React.useState)(null),
      { locale: m } = useLocale(),
      [g, f] = (0, React.useState)(props.container.clientWidth / 60),
      b = (0, React.useRef)(null),
      w = (0, React.useRef)(null),
      transcriptionTipTimer = (0, React.useRef)(0),
      sourceLanguage = s.target || c.language.subtitle,
      translationLanguage = s.native || c.language.translation,
      languagePair = `${sourceLanguage || "und"}:${translationLanguage || "und"}`,
      previousLanguagePair = (0, React.useRef)(languagePair);
    (0, React.useEffect)(
      () => (
        vA(),
        captionProvider.event.on("changed", vA),
        captionProvider.event.on("video.change", vA),
        () => {
          captionProvider.event.off("changed", vA),
            captionProvider.event.off("video.change", vA),
            yA();
        }
      ),
      [],
    );
    (0, React.useEffect)(() => {
      const onTranscriptionStatus = (status) => {
        window.clearTimeout(transcriptionTipTimer.current);
        transcriptionTipTimer.current = 0;
        if (!status || status.state === "idle" || status.state === "done") {
          setTranscriptionTip(null);
          return;
        }
        const tip = {
          state: status.state === "error" ? "error" : "loading",
          message: String(status.message || ""),
        };
        setTranscriptionTip(tip);
        if (tip.state === "error") {
          transcriptionTipTimer.current = window.setTimeout(() => {
            transcriptionTipTimer.current = 0;
            setTranscriptionTip(null);
          }, 10000);
        }
      };
      captionProvider.event.on(
        "transcription.status",
        onTranscriptionStatus,
      );
      return () => {
        window.clearTimeout(transcriptionTipTimer.current);
        transcriptionTipTimer.current = 0;
        captionProvider.event.off(
          "transcription.status",
          onTranscriptionStatus,
        );
      };
    }, []);
    (0, React.useEffect)(() => {
      const platformClass = `xtc-${captionProvider.platform}`;
      document.documentElement.classList.add(platformClass);
      captionProvider.suppressNativeCaptions?.();
      return () => {
        document.documentElement.classList.remove(platformClass);
        captionProvider.restore();
      };
    }, []);
    const x = (0, React.useRef)(null),
      k = (0, React.useRef)(null);
    (0, React.useEffect)(() => {
      logDebug("[captionProvider.engine.changed]", {
        engine: l,
      }),
        l && (captionProvider.engine = l);
    }, [l]),
      (0, React.useEffect)(() => {
        captionProvider.forceAITranslation = !!s.forceAITranslation;
      }, [s.forceAITranslation]),
      (0, React.useEffect)(() => {
        captionProvider.hoverDict =
          !!c.hoverDict && ["dual", "target"].includes(s.mode);
      }, [c.hoverDict, s.mode]),
      (0, React.useEffect)(() => {
        captionProvider.learningLang = c.language.subtitle;
      }, [c.language.subtitle]);
    const [T, S] = (0, React.useState)(captionProvider.isLookupAllowed);
    (0, React.useEffect)(() => {
      const e = (e) => S(!!(null == e ? void 0 : e.allowed));
      return (
        captionProvider.event.on("lookup.allowed", e),
        () => {
          captionProvider.event.off("lookup.allowed", e);
        }
      );
    }, []);
    const C = !0,
      A =
        !1 !== s.wordFollow &&
        bA.includes(captionProvider.platform) &&
        ["dual", "target"].includes(s.mode);
    (0, React.useEffect)(() => {
      captionProvider.wordFollow = A;
    }, [A]);
    const j = (0, React.useMemo)(() => {
        var e;
        return A && d && !(null == (e = d.tokens) ? void 0 : e.length)
          ? (d.text || "").split(/(\s+)/).filter((e) => e.length > 0)
          : null;
      }, [A, d]),
      P = (0, React.useMemo)(() => {
        var e;
        return A && d && d.end > d.start
          ? (null == (e = d.tokens) ? void 0 : e.length)
            ? ((e) => {
                const t = [];
                let n = 0;
                for (const r of e.tokens || [])
                  wA(r) ? (t.push(n), n++) : t.push(Math.max(0, n - 1));
                return xA(t, n, e);
              })(d)
            : (null == j ? void 0 : j.length)
              ? ((e, t) => {
                  const n = [];
                  let r = 0;
                  for (const e of t)
                    e.trim() ? (n.push(r), r++) : n.push(Math.max(0, r - 1));
                  return xA(n, r, e);
                })(d, j)
              : null
          : null;
      }, [A, d, j]),
      E = captionProvider.isSameLangLine(d),
      [N, L] = (0, React.useState)(-1);
    (0, React.useEffect)(() => {
      if ((L(-1), !(null == P ? void 0 : P.length))) return;
      const e = () => {
        const e = ((e, t) => {
          let n = -1;
          for (let r = 0; r < e.length && t >= e[r]; r++) n = r;
          return n;
        })(P, captionProvider.current);
        L((t) => (t === e ? t : e));
      };
      e();
      const t = window.setInterval(e, 100);
      return () => window.clearInterval(t);
    }, [P]);
    const I = (e) =>
        A
          ? xb()({
              "wf-active": e <= N,
              "wf-current": e === N,
            })
          : "",
      O = (0, React.useRef)(!1),
      q = (0, React.useRef)(!1),
      R = SA(captionProvider.platform) && !captionProvider.video?.hasAttribute?.("data-lexihalo-readonly-clock"),
      z = R && !0 === s.hotkeys,
      [M, B] = (0, React.useState)(!1),
      D = z && M,
      F = (0, React.useRef)(D),
      H = (0, React.useRef)(z);
    (F.current = D), (H.current = z);
    const [V, W] = (0, React.useState)(null),
      $ = (0, React.useRef)(0),
      U = (0, React.useRef)(0),
      K = (0, React.useRef)(null),
      Z = (0, React.useCallback)((e, t) => {
        window.clearTimeout($.current),
          W({
            mode: e,
            act: t,
            fromRest: null !== K.current,
            seq: ++U.current,
          }),
          ($.current = window.setTimeout(() => W(null), 1600));
      }, []),
      [G, Y] = (0, React.useState)(!1),
      J = z ? (G ? "loop" : D ? "pause" : null) : null;
    K.current = J;
    const X = null != (n = null == V ? void 0 : V.mode) ? n : J,
      Q = (0, React.useRef)();
    Q.current ||
      (Q.current = new IA(
        () => {
          var e;
          const t = captionProvider.player;
          if (t)
            return {
              paused: t.paused,
              current: captionProvider.current,
              rate: (null == (e = t.video) ? void 0 : e.playbackRate) || 1,
              pause: () => t.pause(),
              seek: (e) => t.seek(e),
            };
        },
        {
          onLoopEnded: () => Y(!1),
        },
      )),
      (0, React.useEffect)(() => {
        var e;
        null == (e = Q.current) || e.setAutoPause(D);
      }, [D]),
      (0, React.useEffect)(() => {
        var e;
        z ||
          (null == (e = Q.current) || e.stopLoop("user"),
          B(!1),
          window.clearTimeout($.current),
          W(null));
      }, [z]),
      (0, React.useEffect)(
        () => () => {
          var e;
          null == (e = Q.current) || e.dispose(),
            window.clearTimeout($.current);
        },
        [],
      );
    const ee = (0, React.useCallback)((e) => {
        o(e),
          extensionClient.dispatch(e),
          captionProvider.event.emit("dispatch:caption", e);
      }, []),
      te = (0, React.useCallback)((e) => {
        var t;
        const n = captionProvider.player;
        n &&
          (n.seek(e.start),
          null == (t = Q.current) || t.seekTo(e),
          (O.current = !1));
      }, []),
      ne = (0, React.useCallback)(
        (e) => {
          var t;
          if (!R) return;
          const n = Q.current,
            r = captionProvider.lines,
            i = captionProvider.current;
          let a = null;
          switch (e) {
            case "prev":
              a = ((e, t) => {
                const n = jA(e),
                  r = PA(n, t);
                return EA(n, r ? r.start : t);
              })(r, i);
              break;
            case "next":
              a = ((e, t) => {
                var n;
                const r = jA(e),
                  i = PA(r, t),
                  a = i ? i.start : t;
                return null != (n = r.find((e) => e.start > a)) ? n : null;
              })(r, i);
              break;
            case "replay":
              a = NA(r, i);
              break;
            case "autoPause": {
              const t = !!(null == n ? void 0 : n.isLooping) || !F.current;
              return (
                null == n || n.stopLoop("user"),
                B(t),
                Z("pause", t ? "on" : "off"),
                void extensionClient.track({
                  name: "caption_line_control",
                  action: e,
                  value: t ? "on" : "off",
                })
              );
            }
            case "loop": {
              if (!n) return;
              if (n.isLooping)
                return (
                  n.stopLoop("user"),
                  Z("loop", "off"),
                  void extensionClient.track({
                    name: "caption_line_control",
                    action: e,
                    value: "off",
                  })
                );
              const a = NA(r, i);
              if (!a) return;
              return (
                (i >= a.start && i <= a.end) ||
                  null == (t = captionProvider.player) ||
                  t.seek(a.start),
                F.current && B(!1),
                n.startLoop(a),
                Y(!0),
                Z("loop", "on"),
                void extensionClient.track({
                  name: "caption_line_control",
                  action: e,
                  value: "on",
                })
              );
            }
          }
          a &&
            (te(a),
            extensionClient.track({
              name: "caption_line_control",
              action: e,
            }));
        },
        [R, te, Z],
      ),
      ie = (0, React.useRef)(ne);
    (ie.current = ne),
      (0, React.useEffect)(() => {
        if (!R) return;
        const e = (e) => {
          if (!H.current) return;
          const t = ((e, t) => {
            var n;
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
            if (e.isComposing || e.repeat) return null;
            const r = CA[e.code];
            if (!r) return null;
            if (LA(e.target)) return null;
            let i = t;
            for (
              ;
              i && (null == (n = i.shadowRoot) ? void 0 : n.activeElement);

            )
              i = i.shadowRoot.activeElement;
            return LA(i) ? null : r;
          })(e, document.activeElement);
          t &&
            (e.preventDefault(), e.stopImmediatePropagation(), ie.current(t));
        };
        return (
          window.addEventListener("keydown", e, !0),
          () => window.removeEventListener("keydown", e, !0)
        );
      }, [R]);
    const [ae, oe] = (0, React.useState)(!1),
      se = (0, React.useRef)(z);
    (0, React.useEffect)(() => {
      const e = z && !se.current;
      (se.current = z),
        z
          ? e &&
            !(null == u ? void 0 : u.includes("caption-keys-guide-never")) &&
            oe(!0)
          : oe(!1);
    }, [z, u]);
    const le = (e) => {
        oe(!1),
          e && ee(doTaskAction("caption-keys-guide-never")),
          extensionClient.track({
            name: "caption_line_control",
            action: "keys_guide",
            value: e ? "never" : "close",
          });
      },
      ce = {
        prev: "caption_control_prev",
        replay: "caption_control_replay",
        next: "caption_control_next",
        autoPause: "caption_control_auto_pause_short",
        loop: "caption_control_loop_short",
      },
      ue = (0, React.useMemo)(
        () => ({
          primaryCSS: {
            fontSize: s.primary.size / 100 + "em",
            color: s.primary.color,
            fontWeight: s.primary.fontWeight || "normal",
          },
          secondaryCSS: {
            fontSize: s.secondary.size / 100 + "em",
            color: s.secondary.color,
            fontWeight: s.secondary.fontWeight || "normal",
          },
          rootCSS: {
            background: `rgba(0,0,0,${s.opacity / 100})`,
          },
        }),
        [s],
      ),
      de = (0, React.useCallback)(
        () =>
          FA(null, null, function* () {
            logDebug("[resize]");
            const e = document.querySelector("trancy-caption-window");
            if (e) {
              const { video: t, element: n } =
                  yield captionProvider.queryContainerElement(),
                audioSurface = n.classList.contains("lexihalo-audio-caption-host"),
                r = (audioSurface ? n : t || n).getBoundingClientRect();
              r &&
                ((e.style.width = `${r.width}px`),
                (e.style.height = `${r.height}px`));
              const i = audioSurface ? Math.max(14, Math.min(20, r.width / 40)) : r.width / 60;
              f(i);
            }
          }),
        [],
      );
    (0, React.useEffect)(() => {
      const e = new ResizeObserver((e) => {
        de();
      });
      return (
        ((e) => {
          FA(null, null, function* () {
            const { video: t, element: n } =
              yield captionProvider.queryContainerElement();
            const target = n.classList.contains("lexihalo-audio-caption-host") ? n : t || n;
            target &&
              (e.observe(target, {
                box: "content-box",
              }),
              e.observe(target, {
                box: "border-box",
              }));
          });
        })(e),
        window.addEventListener("resize", de),
        () => {
          e.disconnect(), window.removeEventListener("resize", de);
        }
      );
    }, []);
    const [pe, _e] = (0, React.useState)({}),
      [me, ge] = (0, React.useState)(!1),
      fe = (0, React.useCallback)((e) => {
        if (!b.current || !w.current) return;
        ge(!0);
        const t = e.clientY,
          n = window.getComputedStyle(w.current).top,
          r = parseInt(n.replace("px", "")),
          i = window.getComputedStyle(w.current).bottom,
          a = parseInt(i.replace("px", "")),
          { height: o } = b.current.getBoundingClientRect(),
          s = (e) => {
            if (!b.current) return;
            const n = e.clientY - t,
              i = r + n,
              s = a - n;
            _e(
              i < 0
                ? {
                    top: "0%",
                    bottom: "unset !important",
                  }
                : s <= 0
                  ? {
                      bottom: "0%",
                      top: "unset !important",
                    }
                  : i > s
                    ? {
                        bottom: (s / o) * 100 + "%",
                        top: "unset !important",
                      }
                    : {
                        top: (i / o) * 100 + "%",
                        bottom: "unset !important",
                      },
            );
          },
          l = () => {
            window.removeEventListener("mousemove", s),
              window.removeEventListener("mouseup", l),
              ge(!1);
          };
        window.addEventListener("mousemove", s),
          window.addEventListener("mouseup", l);
      }, []),
      ve = (0, React.useCallback)(() => {
        if (!C || me || q.current) return;
        q.current = !0;
        const e = captionProvider.player;
        e && !e.paused && (e.pause(), (O.current = !0));
      }, [C, me]),
      ye = (0, React.useCallback)(() => {
        const e = captionProvider.player;
        O.current && e && e.paused && e.play(),
          (O.current = !1),
          (q.current = !1);
      }, []);
    (0, React.useEffect)(() => {
      d || (q.current = !1);
    }, [d]);
    const be = (0, React.useCallback)(
        (e) => {
          if (d && !(d.idx < 0))
            return re(captionProvider.lines, d.idx, e, {
              vid: platformContext.vid,
              title: platformContext.title,
              url: window.location.href,
              platform: platformContext.platform,
              captionKind: platformContext.captionKind,
            });
        },
        [d],
      ),
      we = (0, React.useCallback)(
        (e) => {
          const t = captionProvider.player;
          t && !t.paused && t.pause(), (O.current = !1);
          const n = be(e),
            r = n
              ? `?ctx=${((e) => encodeURIComponent(JSON.stringify(e)))(n)}`
              : "";
          extensionClient.toggleSlider(
            `/word/${encodeURIComponent(e.text)}${r}`,
          );
        },
        [be],
      ),
      [xe, Te] = (0, React.useState)(!1);
    (0, React.useEffect)(() => {
      const e = (e) => {
        if (e instanceof CustomEvent) {
          const { detail: t } = e;
          t.body && o(t.body);
        }
      };
      window.addEventListener("edvideo:dispatch", e);
      const t = (e) => {
        o(e);
      };
      captionProvider.event.on("dispatch", t);
      const n = (e) => {
        var t, n;
        logDebug("[whisperx]", e),
          e.enabled &&
            (Te(!0),
            setTimeout(() => {
              Te(!1);
            }, 2e3)),
          (captionProvider.endableWhisper = e.enabled),
          null == (t = Q.current) || t.stopLoop("user"),
          null == (n = Q.current) || n.clear(),
          Oe(!1);
      };
      return (
        captionProvider.event.on("whisperx", n),
        () => {
          captionProvider.event.off("changed", Ce),
            extensionClient.off("dispatch"),
            window.removeEventListener("edvideo:dispatch", e),
            captionProvider.event.off("dispatch", t),
            captionProvider.event.off("whisperx", n);
        }
      );
    }, []);
    const Ce = (0, React.useCallback)((e) => {
        var t, n, r;
        if ("none" === captionProvider.strategy) return;
        const i = e.current;
        if (x.current === i && !e.forceUpdate)
          return void (null == (t = Q.current) || t.update(k.current, i));
        const a = captionProvider.findSubtitle(i);
        null == (n = Q.current) || n.update(a, i),
          !a &&
          q.current &&
          (null == (r = captionProvider.player) ? void 0 : r.paused) &&
          k.current
            ? (x.current = i)
            : (a &&
                !document.documentElement.classList.contains(
                  `xtc-${captionProvider.platform}`,
                ) &&
                document.documentElement.classList.add(
                  `xtc-${captionProvider.platform}`,
                ),
              (x.current = i),
              (k.current &&
                k.current.text === (null == a ? void 0 : a.text) &&
                !e.forceUpdate) ||
                ((k.current = a), p(a || null)));
      }, []),
      [Ae, je] = (0, React.useState)(),
      Pe = [3e3, 7e3],
      Ee = (0, React.useRef)(0),
      Ne = (0, React.useRef)(0),
      Le = (0, React.useRef)(0),
      Ie = (e) => {
        if ("youtube" !== captionProvider.platform) return !1;
        const t = Ee.current;
        return (
          !(t >= Pe.length) &&
          ((Ee.current = t + 1),
          logDebug("[dual-caption.reload.retry]", {
            attempt: t + 1,
            delay: Pe[t],
          }),
          (Ne.current = window.setTimeout(() => Oe(e, !0), Pe[t])),
          !0)
        );
      },
      Oe = (e = !0, t = !1) =>
        FA(null, null, function* () {
          if (!sourceLanguage) return;
          if (
            (t || (Ee.current = 0),
            window.clearTimeout(Ne.current),
            window.clearTimeout(Le.current),
            de(),
            captionProvider.event.off("changed", Ce),
            logDebug("[dual-caption.onload.start]", {
              id: platformContext.id,
              needLoading: e,
              isRetry: t,
            }),
            yield captionProvider.initPlayer(),
            logDebug("[dual-caption.onload.playerReady]", {
              id: platformContext.id,
            }),
            "youtube" === captionProvider.platform)
          ) {
            const t = yield platformContext.getYoutubeTracks();
            if (!((t && 0 !== t.length) || captionProvider.endableWhisper)) {
              if (Ie(e)) return;
              h(!0);
              const t = platformContext.id;
              return void (Le.current = window.setTimeout(
                () =>
                  FA(null, null, function* () {
                    if (((Le.current = 0), platformContext.id !== t)) return;
                    h(!1);
                    const n = yield platformContext
                      .getYoutubeTracks()
                      .catch(() => null);
                    n &&
                      n.length > 0 &&
                      (logDebug("[dual-caption.noCaption.lateTracks]", {
                        count: n.length,
                      }),
                      (Ee.current = 0),
                      Oe(e, !0));
                  }),
                5e3,
              ));
            }
          }
          // Discover native subtitle tracks quietly. Explicit transcription
          // progress and errors are rendered from transcription.status below.
          "und" === sourceLanguage && (e = !1),
            (captionProvider.engine = l),
            (captionProvider.to = translationLanguage);
          const n = captionProvider.getPreferLanguage();
          captionProvider.from =
            (n !== captionProvider.to ? n : void 0) || sourceLanguage;
          try {
            const loadedCaption = yield captionProvider.load();
            captionProvider.suppressNativeCaptions?.();
            if (!loadedCaption && "youtube" === captionProvider.platform)
              throw new Error("youtube caption load failed (null track)");
            e &&
              captionProvider.hasExternalCorpus &&
              (yield ((e = 1e4) =>
                new Promise((t) => {
                  if (captionProvider.lines.length > 0) return t();
                  let n = !1;
                  const r = () => {
                      captionProvider.lines.length > 0 && a();
                    },
                    i = (e) => {
                      (null == e ? void 0 : e.waiting) && a();
                    },
                    a = () => {
                      n ||
                        ((n = !0),
                        captionProvider.event.off("changed", r),
                        captionProvider.event.off("source.waiting", i),
                        clearTimeout(o),
                        t());
                    };
                  captionProvider.event.on("changed", r),
                    captionProvider.event.on("source.waiting", i);
                  const o = setTimeout(a, e);
                }))()),
              captionProvider.event.on("changed", Ce),
              (Ee.current = 0),
              logDebug("dual-caption onload", {
                language: n,
                from: captionProvider.from,
                to: captionProvider.to,
              });
          } catch (t) {
            captionProvider.suppressNativeCaptions?.();
            if (Ie(e)) return;
            return (
              je("error"),
              void logError("caption.load.error", {
                e: t,
              })
            );
          }
        });
    (0, React.useEffect)(() => {
      const languageChanged = previousLanguagePair.current !== languagePair;
      previousLanguagePair.current = languagePair;
      if (languageChanged)
        captionProvider.resetForLanguageChange?.("language-change");
      const e = !["deeplearning"].includes(captionProvider.platform);
      Oe(e);
      const t = (e) => {
        if (e instanceof CustomEvent) {
          const { detail: t } = e;
          t.body && (logDebug("onEvent", t.body), o(t.body));
        }
      };
      return (
        window.addEventListener("edvideo:dispatch", t),
        captionProvider.event.on("caption:reload", Oe),
        () => {
          window.clearTimeout(Ne.current),
            window.clearTimeout(Le.current),
            window.removeEventListener("edvideo:dispatch", t),
            captionProvider.event.off("changed", Ce),
            captionProvider.event.off("caption:reload", Oe);
        }
      );
    }, [sourceLanguage, translationLanguage]);
    const { showAd: qe } = OA(captionProvider.platform),
      aiLineInFlight = Boolean(
        d && captionProvider.translatingIdx.includes(d.idx),
      ),
      aiWaitingText = String(c.language.interface || "").startsWith("zh")
        ? "等待 AI 翻译…"
        : "Waiting for AI translation…";
    return (0, jsxRuntime.jsx)(Qw, {
      children: (0, jsxRuntime.jsxs)("div", {
        ref: b,
        className: xb()("trancy-caption-container"),
        onDoubleClick: (e) => {
          e.stopPropagation(),
            e.preventDefault(),
            e.nativeEvent.stopImmediatePropagation();
        },
        children: [
          ae &&
            z &&
            !qe &&
            (0, jsxRuntime.jsxs)("div", {
              className: "trancy-caption-keys-guide",
              onMouseDown: (e) => {
                e.stopPropagation(), e.preventDefault();
              },
              onClick: (e) => {
                e.stopPropagation(), e.nativeEvent.stopImmediatePropagation();
              },
              children: [
                (0, jsxRuntime.jsxs)("div", {
                  className: "trancy-caption-keys-guide-head",
                  children: [
                    (0, jsxRuntime.jsx)("span", {
                      className: "trancy-caption-keys-guide-title",
                      children: m("caption_control"),
                    }),
                    (0, jsxRuntime.jsx)("button", {
                      type: "button",
                      className: "trancy-caption-keys-guide-never",
                      onClick: () => le(!0),
                      children: m("newbie_guide_hide"),
                    }),
                    (0, jsxRuntime.jsx)("button", {
                      type: "button",
                      className: "trancy-caption-keys-guide-close",
                      "aria-label": "Close",
                      onClick: () => le(!1),
                      children: (0, jsxRuntime.jsx)(At, {}),
                    }),
                  ],
                }),
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-caption-keys-guide-keys",
                  children: ["prev", "replay", "next", "autoPause", "loop"].map(
                    (t) =>
                      (0, jsxRuntime.jsxs)(
                        "span",
                        {
                          className: "trancy-caption-keys-guide-item",
                          children: [
                            (0, jsxRuntime.jsx)("span", {
                              className: "trancy-caption-keycap",
                              children: AA[t],
                            }),
                            m(ce[t]),
                          ],
                        },
                        t,
                      ),
                  ),
                }),
              ],
            }),
          X &&
            !qe &&
            (0, jsxRuntime.jsxs)(
              "div",
              {
                className: xb()(
                  "trancy-caption-mode",
                  `mode-${X}`,
                  V && [
                    "announce",
                    `act-${V.act}`,
                    {
                      "from-rest": V.fromRest,
                    },
                  ],
                ),
                title: `${m("loop" === X ? "caption_control_loop" : "caption_control_auto_pause")} (${AA["loop" === X ? "loop" : "autoPause"]})`,
                children: [
                  (0, jsxRuntime.jsxs)("div", {
                    className: "trancy-caption-mode-body",
                    children: [
                      (0, jsxRuntime.jsx)("span", {
                        className: "trancy-caption-mode-text",
                        children: m(
                          `caption_control_${"loop" === X ? "loop" : "auto_pause"}_${null != (r = null == V ? void 0 : V.act) ? r : "on"}`,
                        ),
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "trancy-svg-icon",
                        children:
                          "loop" === X
                            ? (0, jsxRuntime.jsx)(ot, {})
                            : (0, jsxRuntime.jsx)(ke, {}),
                      }),
                    ],
                  }),
                  (0, jsxRuntime.jsx)("div", {
                    className: "trancy-caption-mode-key",
                    children: (0, jsxRuntime.jsxs)("span", {
                      className: "trancy-caption-mode-key-top",
                      children: [
                        AA["loop" === X ? "loop" : "autoPause"],
                        (0, jsxRuntime.jsx)("span", {
                          className: "trancy-caption-mode-led",
                        }),
                      ],
                    }),
                  }),
                ],
              },
              V ? V.seq : "rest",
            ),
          transcriptionTip &&
            (0, jsxRuntime.jsxs)("div", {
              className: "trancy-caption-loading no-caption",
              children: [
                transcriptionTip.state === "loading" &&
                  (0, jsxRuntime.jsx)("div", {
                    className: "trancy-caption-loading-icon",
                    children: (0, jsxRuntime.jsx)(Se, {}),
                  }),
                (0, jsxRuntime.jsx)("div", {
                  className:
                    transcriptionTip.state === "error"
                      ? "trancy-caption-error-text"
                      : "trancy-caption-loading-text",
                  children: transcriptionTip.message,
                }),
              ],
            }),
          _ &&
            !transcriptionTip &&
            (0, jsxRuntime.jsx)("div", {
              className: "trancy-caption-loading no-caption",
              children: (0, jsxRuntime.jsx)("div", {
                className: "trancy-caption-loading-text",
                children: m("caption_no_subtitles"),
              }),
            }),
          Ae &&
            !transcriptionTip &&
            "youtube" === captionProvider.platform &&
            (0, jsxRuntime.jsxs)("div", {
              className: "trancy-caption-loading no-caption",
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-caption-error-text",
                  children: m("caption_subtitles_load_failed_text"),
                }),
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-btn-retry",
                  onClick: () => {
                    je(null), Oe();
                  },
                  children: m("caption_subtitles_load_failed_btn_retry"),
                }),
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-btn-retry trancy-btn-error-close",
                  onClick: () => je(null),
                  children: (0, jsxRuntime.jsx)(At, {}),
                }),
              ],
            }),
          d &&
            !qe &&
            (0, jsxRuntime.jsxs)("div", {
              className: xb()("trancy-caption", {
                dragging: me,
              }),
              ref: w,
              style: DA({}, pe),
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-caption-drag",
                  onMouseDown: fe,
                  onClick: (e) => {
                    e.stopPropagation(),
                      e.preventDefault(),
                      e.nativeEvent.stopImmediatePropagation();
                  },
                  children: (0, jsxRuntime.jsx)("div", {
                    className: xb()("trancy-svg-icon icon-18"),
                    children: (0, jsxRuntime.jsx)(zt, {}),
                  }),
                }),
                xe &&
                  (0, jsxRuntime.jsxs)("div", {
                    className: "trancy-caption-ai-done",
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "trancy-caption-ai-done-icon",
                        children: (0, jsxRuntime.jsx)(he, {}),
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "trancy-caption-ai-done-text",
                        children: m("caption_ai_loaded"),
                      }),
                    ],
                  }),
                (0, jsxRuntime.jsxs)("div", {
                  className: xb()("trancy-caption-content", {
                    "trancy-caption-ai-done-text": xe,
                    "trancy-caption-bg-blur": s.blur,
                    "trancy-caption-flip": null == s ? void 0 : s.flip,
                    [`trancy-text-${(null == s ? void 0 : s.charEdge) || "none"}`]:
                      "none" !== (null == s ? void 0 : s.charEdge),
                  }),
                  style: DA(
                    {
                      fontSize: `${g}px`,
                    },
                    ue.rootCSS,
                  ),
                  onMouseMove: ve,
                  onMouseLeave: ye,
                  children: [
                    ["dual", "target"].includes(s.mode) &&
                      (0, jsxRuntime.jsx)("div", {
                        className: xb()(
                          "trancy-caption-primary",
                          s.primary.fontFamily,
                          `lt-${s.target}`,
                          {
                            "word-follow":
                              A && !!(null == P ? void 0 : P.length),
                          },
                        ),
                        style: DA({}, ue.primaryCSS),
                        children:
                          C && (null == (i = d.tokens) ? void 0 : i.length)
                            ? d.tokens.map((n, r) =>
                                (0, jsxRuntime.jsx)(
                                  rx,
                                  {
                                    token: n,
                                    platform: captionProvider.platform,
                                    runtime: props.runtime,
                                    player: captionProvider.player,
                                    pauseMode: !1,
                                    dragging: me,
                                    onClick: () => we(n),
                                    context: () => be(n),
                                    extraClass: I(r),
                                  },
                                  `${d.idx}:${r}`,
                                ),
                              )
                            : A && (null == (a = d.tokens) ? void 0 : a.length)
                              ? d.tokens.map((t, n) =>
                                  (0, jsxRuntime.jsx)(
                                    "span",
                                    {
                                      className: xb()("token", t.pos, I(n)),
                                      children: (t.meta || t.text).replace(
                                        /\n+/g,
                                        " ",
                                      ),
                                    },
                                    `${d.idx}:${n}`,
                                  ),
                                )
                              : A && (null == j ? void 0 : j.length)
                                ? j.map((t, n) =>
                                    (0, jsxRuntime.jsx)(
                                      "span",
                                      {
                                        className: xb()("token", I(n)),
                                        children: t,
                                      },
                                      `${d.idx}:${n}`,
                                    ),
                                  )
                                : null == d
                                  ? void 0
                                  : d.text,
                      }),
                    ("native" === s.mode || ("dual" === s.mode && !E)) &&
                      (0, jsxRuntime.jsx)("div", {
                        className: xb()(
                          "trancy-caption-secondary",
                          s.secondary.fontFamily,
                          `lt-${s.native}`,
                          {
                            error:
                              !E &&
                              (null == d ? void 0 : d.message) &&
                              !aiLineInFlight,
                            "ai-loading":
                              !E &&
                              E_(l) &&
                              aiLineInFlight &&
                              !(
                                (null == d ? void 0 : d.AITranslation) ||
                                (null == d ? void 0 : d.translation)
                              ),
                          },
                        ),
                        style: DA({}, ue.secondaryCSS),
                        children: E
                          ? null == d
                            ? void 0
                            : d.text
                          : (null == d ? void 0 : d.AITranslation) ||
                            (null == d ? void 0 : d.translation) ||
                            (d && d.idx < 0
                              ? ""
                              : l
                                ? aiLineInFlight
                                  ? `${null == l ? void 0 : l.name} ${m("ai_translating")}`
                                  : aiWaitingText
                                : "----"),
                      }),
                  ],
                }),
              ],
            }),
        ],
      }),
    });
  };

  return DualCaptionApp;
}
