/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverControlCenterWidget(dependencies) {
  const Ai = dependencies.Ai;
  const Dt = dependencies.Dt;
  const Ft = dependencies.Ft;
  const It = dependencies.It;
  const Jd = dependencies.Jd;
  const Ni = dependencies.Ni;
  const Pi = dependencies.Pi;
  const Qi = dependencies.Qi;
  const React = dependencies.React;
  const Sa = dependencies.Sa;
  const Ti = dependencies.Ti;
  const Xi = dependencies.Xi;
  const classNames = dependencies.classNames;
  const controlCenter = dependencies.controlCenter;
  const dk = dependencies.dk;
  const extensionClient = dependencies.extensionClient;
  const ga = dependencies.ga;
  const jsxRuntime = dependencies.jsxRuntime;
  const q_ = dependencies.q_;
  const uk = dependencies.uk;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const yi = dependencies.yi;

  const ControlCenterWidget = (props) => {
    var t, n, r;
    const {
        edreader: i,
        setting: a,
        translatorService: o,
      } = useAppSelector((e) => e),
      { locale: s } = useLocale(),
      { dispatch: l, nativeDispatch: c } = useDispatchBridge(),
      [u, d] = (0, React.useState)({
        enabled: !1,
        mode: "dual",
      }),
      [_, p] = (0, React.useState)(!1),
      [h, m] = (0, React.useState)(!1),
      [g, f] = (0, React.useState)(!1),
      [focused, setFocused] = (0, React.useState)(!1),
      [studyError, setStudyError] = (0, React.useState)(""),
      v = null != (t = a.conrolCenter.opacity) ? t : 25;
    (0, React.useEffect)(() => {
      if (g) {
        const e = () => f(!1);
        return (
          document.body.addEventListener("click", e),
          () => {
            document.body.removeEventListener("click", e);
          }
        );
      }
    }, [g]);
    const b = (0, React.useRef)(0),
      y = (e) => {
        const t = document.querySelector("xt-card");
        if ("Escape" === e.key && (!t || 0 === t.children.length)) {
          const e = Date.now();
          e - b.current < 300
            ? (extensionClient.emit("forward", ["background"], {
                name: "fulltext-translation",
                body: {
                  type: "disable",
                },
              }),
              (b.current = 0))
            : (b.current = e);
        }
      };
    return (
      (0, React.useEffect)(() => {
        document.addEventListener("keydown", y);
        const e = (e) =>
            dk(null, null, function* () {
              const { enabled: t, mode: n } = e.body;
              d({
                enabled: t,
                mode: n,
              });
            }),
          t = (e) =>
            dk(null, null, function* () {
              const { body: t } = e;
              [
                "setTranslatorService",
                "setEdreaderTheme",
                "setting/setTheme",
              ].includes(t.type) && c(t);
            });
        const onTheme = (changes, area) => {
          if (area === "local" && changes.cheng_theme)
            c({
              type: "setEdreaderTheme",
              payload: changes.cheng_theme.newValue,
            });
        };
        chrome.storage.onChanged.addListener(onTheme);
        return (
          extensionClient.on("dispatch", t),
          extensionClient.on("fulltext-status-change", e),
          () => {
            extensionClient.off("fulltext-status-change", e),
              extensionClient.off("dispatch", t),
              chrome.storage.onChanged.removeListener(onTheme),
              document.removeEventListener("keydown", y);
          }
        );
      }, []),
      (0, jsxRuntime.jsxs)(q_.div, {
        children: [
          (0, jsxRuntime.jsx)("link", {
            onLoad: () => p(!0),
            rel: "stylesheet",
            href: `${props.runtime.scheme}/assets/edreader.css`,
          }),
          _ &&
            (0, jsxRuntime.jsx)(uk(), {
              bounds: {
                top: -(0.6 * window.innerHeight - 202),
                bottom: 0.4 * window.innerHeight,
              },
              axis: "y",
              onStop: (e, t) => {
                l(Dt(t.y));
              },
              defaultPosition: {
                x: 0,
                y: a.conrolCenter.transformY,
              },
              children: (0, jsxRuntime.jsxs)("div", {
                className: classNames()("rd-theme rd-float-btn", i.theme),
                style: {
                  opacity: h || focused || g ? 1 : v / 100,
                  transition: "opacity 0.2s ease, padding 0.2s ease",
                },
                onMouseEnter: () => m(!0),
                onMouseLeave: () => m(!1),
                onFocus: () => setFocused(!0),
                onBlur: (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setFocused(!1);
                },
                children: [
                  (0, jsxRuntime.jsxs)("div", {
                    className: "rd-float-btn-hover",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "rd-quick-apps",
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "btn-rd-app",
                            onClick: () => {
                              extensionClient.emit(
                                "toggleSlider",
                                ["content"],
                                {
                                  path: "/",
                                },
                              ),
                                extensionClient.track({
                                  name: "control_center_setting",
                                });
                            },
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Qi, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "rd-tool-tips",
                                children: s("control_center_setting"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "btn-rd-app",
                            onClick: () => {
                              extensionClient.emit("quick-translator", [
                                "content",
                              ]),
                                extensionClient.track({
                                  name: "control_center_quick_translate",
                                });
                            },
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Xi, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "rd-tool-tips",
                                children: s("control_center_quick_translate"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("button", {
                            className: "btn-rd-app show cheng-study-button",
                            type: "button",
                            style: { border: 0, padding: 0 },
                            "data-cheng-workspace": true,
                            "aria-label": "学习控制台",
                            title: studyError || "学习控制台",
                            onClick: async (event) => {
                              event.stopPropagation();
                              try {
                                const result = await chrome.runtime.sendMessage(
                                  { type: "cheng:study:open" },
                                );
                                if (!result?.ok)
                                  throw new Error(
                                    result?.error || "无法打开侧边学习面板",
                                  );
                                setStudyError("");
                              } catch (error) {
                                setStudyError(error.message);
                              }
                            },
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsxs)("svg", {
                                  viewBox: "0 0 24 24",
                                  fill: "none",
                                  "aria-hidden": true,
                                  children: [
                                    (0, jsxRuntime.jsx)("circle", {
                                      cx: 12,
                                      cy: 7,
                                      r: 4,
                                      stroke: "currentColor",
                                      strokeWidth: 1.7,
                                    }),
                                    (0, jsxRuntime.jsx)("path", {
                                      d: "M3.5 8.5c3.3-1.2 6.1-.6 8.5 1.5 2.4-2.1 5.2-2.7 8.5-1.5v10c-3.2-1-6-.4-8.5 1.5-2.5-1.9-5.3-2.5-8.5-1.5v-10Z",
                                      fill: "currentColor",
                                      stroke: "currentColor",
                                      strokeWidth: 1.2,
                                      strokeLinejoin: "round",
                                    }),
                                    (0, jsxRuntime.jsx)("path", {
                                      d: "M12 10v9.5",
                                      stroke: "#fffefb",
                                      strokeWidth: 1.4,
                                      strokeLinecap: "round",
                                    }),
                                  ],
                                }),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "rd-tool-tips",
                                children: studyError || "学习控制台",
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "rd-logo",
                        children: (0, jsxRuntime.jsx)(yi, {}),
                      }),
                    ],
                  }),
                  u.enabled &&
                    (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "btn-rd-app show",
                          onClick: () => {
                            extensionClient.emit("toggleSlider", ["content"], {
                              path: "/setting/immersive-translate",
                            });
                          },
                          children: [
                            (0, jsxRuntime.jsxs)("div", {
                              className: "t-icon icon-17",
                              children: [(0, jsxRuntime.jsx)(Ti, {}), " "],
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "rd-tool-tips",
                              children: s("fulltext_toolbar_setting"),
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "btn-rd-app show",
                          onClick: () => {
                            extensionClient.emit("toggleSlider", ["content"], {
                              path: "/setting/translator-engine?activeTab=fulltext",
                            }),
                              extensionClient.track({
                                name: "fulltext_toolbar_engine_change",
                              });
                          },
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "t-icon icon-17",
                              children: (0, jsxRuntime.jsx)(Jd, {
                                name:
                                  (null == (n = o.fulltext)
                                    ? void 0
                                    : n.icon) ||
                                  (null == (r = o.fulltext)
                                    ? void 0
                                    : r.provider),
                              }),
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "rd-tool-tips",
                              children: s("engine_change_tips"),
                            }),
                          ],
                        }),
                      ],
                    }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "btn-rd-app fix-rd-app",
                    onClick: () => {
                      extensionClient.emit("forward", ["background"], {
                        name: "fulltext-translation",
                        body: {},
                      }),
                        extensionClient.track({
                          name: "control_center_fulltext_translate",
                        });
                    },
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "t-icon icon-19",
                        children: u.enabled
                          ? (0, jsxRuntime.jsx)(Sa, {})
                          : (0, jsxRuntime.jsx)(ga, {}),
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "rd-tool-tips",
                        children: u.enabled
                          ? s("control_center_fulltext_translate_disable")
                          : s("control_center_fulltext_translate_enable"),
                      }),
                    ],
                  }),
                  !u.enabled &&
                    (0, jsxRuntime.jsx)("div", {
                      className: "btn-float-close",
                      onClick: () => f(!0),
                      children: (0, jsxRuntime.jsx)(Sa, {}),
                    }),
                  g &&
                    (0, jsxRuntime.jsxs)("div", {
                      className: "btn-float-popover",
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "btn-float-popover-item",
                          onClick: () => {
                            l(
                              Ft([
                                ...a.conrolCenter.blackList,
                                window.location.host,
                              ]),
                            ),
                              controlCenter.reRenderControlCenter(),
                              extensionClient.track({
                                name: "control_center_disable_current_site",
                                event_value: window.location.host,
                              }),
                              f(!1);
                          },
                          children: [
                            (0, jsxRuntime.jsx)(Ai, {}),
                            (0, jsxRuntime.jsxs)("span", {
                              children: [
                                s("float_btn_current_site_disable"),
                                " ",
                              ],
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "btn-float-popover-item",
                          onClick: () => {
                            controlCenter.unmount("xt-control-center"),
                              extensionClient.track({
                                name: "control_center_disable_current_site_temp",
                              });
                          },
                          children: [
                            (0, jsxRuntime.jsx)(Pi, {}),
                            (0, jsxRuntime.jsx)("span", {
                              children: s("float_btn_disable_temp"),
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsxs)("div", {
                          className: "btn-float-popover-item",
                          onClick: () => {
                            l(It(!1)),
                              controlCenter.reRenderControlCenter(),
                              extensionClient.track({
                                name: "control_center_disable_current_site_forever",
                              }),
                              f(!1);
                          },
                          children: [
                            (0, jsxRuntime.jsx)(Ni, {}),
                            (0, jsxRuntime.jsx)("span", {
                              children: s("float_btn_disable_forever"),
                            }),
                          ],
                        }),
                      ],
                    }),
                ],
              }),
            }),
        ],
      })
    );
  };

  return ControlCenterWidget;
}
