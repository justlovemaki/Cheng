/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverSettingsHome(dependencies) {
  const Ca = dependencies.Ca;
  const React = dependencies.React;
  const SideNavigation = dependencies.SideNavigation;
  const _a = dependencies._a;
  const ca = dependencies.ca;
  const detectBrowser = dependencies.detectBrowser;
  const eu = dependencies.eu;
  const extensionClient = dependencies.extensionClient;
  const ga = dependencies.ga;
  const iu = dependencies.iu;
  const jsxRuntime = dependencies.jsxRuntime;
  const la = dependencies.la;
  const lu = dependencies.lu;
  const ma = dependencies.ma;
  const oa = dependencies.oa;
  const qr = dependencies.qr;
  const sa = dependencies.sa;
  const so = dependencies.so;
  const ua = dependencies.ua;
  const useApiClient = dependencies.useApiClient;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const useSliderNavigation = dependencies.useSliderNavigation;
  const useWordSync = dependencies.useWordSync;
  const wv = dependencies.wv;
  const xa = dependencies.xa;
  const xi = dependencies.xi;
  const ya = dependencies.ya;

  const SettingsHome = (props) => {
    var t, n, r, i;
    const {
        setting: a,
        edreader: o,
        user: s,
        changed: l,
        version: c,
        words: u,
        tasks: d,
        dualCaption: _,
      } = useAppSelector((e) => e),
      { navigate: p, router: h } = useSliderNavigation(),
      m = useApiClient(!0),
      { syncAllWords: g } = useWordSync(),
      { dispatch: f } = useDispatchBridge(),
      { locale: v } = useLocale(),
      b = eu(!0),
      y = lu(!0),
      x = b.find((e) => e.id === y),
      w = async () => {
        const { message: e, data: t } = await m.getTranslatorEngines();
        "ok" === e &&
          f(
            qr({
              engines: t.engines,
              quota: t.quota,
            }),
          );
      };
    return (
      (0, React.useEffect)(() => {
        w(),
          window.location.href.includes("https://www.trancy.org/user-guide") &&
            (window.location.hash = "#finished");
      }, []),
      (0, jsxRuntime.jsxs)("div", {
        className: "rd-slider",
        children: [
          (0, jsxRuntime.jsxs)("div", {
            className: "rd-slider-container",
            children: [
              (0, jsxRuntime.jsxs)("div", {
                className: "rd-slider-header rd-setting-slider-header",
                children: [
                  (0, jsxRuntime.jsx)("div", {
                    className: "title",
                    children: v("setting_title"),
                  }),
                  null,
                ],
              }),
              (0, jsxRuntime.jsxs)("div", {
                className: "rd-slider-content",
                children: [
                  null,
                  null,
                  (0, jsxRuntime.jsx)("div", {
                    className: "slider-item-group pd-0",
                    children: (0, jsxRuntime.jsxs)("div", {
                      className: "slider-item",
                      onClick: () => p("/setting/translator-engine"),
                      children: [
                        (0, jsxRuntime.jsxs)("div", {
                          className: "label",
                          children: [
                            (0, jsxRuntime.jsx)("div", {
                              className: "t-icon icon-20",
                              children: (0, jsxRuntime.jsx)(ua, {}),
                            }),
                            (0, jsxRuntime.jsx)("div", {
                              className: "name",
                              children: v("rd_trasnlate_engine"),
                            }),
                          ],
                        }),
                        (0, jsxRuntime.jsx)("div", {
                          className: "right-action",
                          children: (0, jsxRuntime.jsx)("div", {
                            className: "t-icon icon-20",
                            children: (0, jsxRuntime.jsx)(Ca, {}),
                          }),
                        }),
                      ],
                    }),
                  }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "slider-item-group",
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "group-label",
                        children: v("main_function_setting"),
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => p("/setting/dual-subtitle"),
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 red-icon",
                                children: (0, jsxRuntime.jsx)(xi, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("dual_subtitle_title"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children:
                                  !1 !== a.dualSubtitleEnabled
                                    ? v("rd_float_btn_status_1")
                                    : v("rd_float_btn_status_2"),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => p("/setting/immersive-translate"),
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 purple-icon",
                                children: (0, jsxRuntime.jsx)(ga, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_immersive_translate"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children: v(
                                  `rd_immersive_translate_mode_${o.fulltext.mode}`,
                                ),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => p("/setting/selection-mode"),
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 blue-icon",
                                children: (0, jsxRuntime.jsx)(ma, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_translate_word"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children: o.selectTranslate
                                  ? v(`rd_translate_word_${o.selectionMode}`)
                                  : v("rd_closed_already"),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p("/setting/float-button"),
                            extensionClient.track({
                              name: "setting_float_button",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 orange-icon",
                                children: (0, jsxRuntime.jsx)(la, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_slider_float_btn"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "tips",
                            children: v("rd_float_btn_tooltip"),
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children: a.conrolCenter.enable
                                  ? v("rd_float_btn_status_1")
                                  : v("rd_float_btn_status_2"),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      null,
                    ],
                  }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "slider-item-group",
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "group-label",
                        children: v("slider_general_setting"),
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p("/setting/language/target"),
                            extensionClient.track({
                              name: "setting_language_target",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(xa, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_learning_language"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children:
                                  null ==
                                  (n = so.find(
                                    (e) => e.code === a.language.subtitle,
                                  ))
                                    ? void 0
                                    : n.nativeName,
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => p("/setting/language/translation"),
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(ya, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_translate_language"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children:
                                  null ==
                                  (r = so.find(
                                    (e) => e.code === a.language.translation,
                                  ))
                                    ? void 0
                                    : r.nativeName,
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p("/setting/voice"),
                            extensionClient.track({
                              name: "setting_voice",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(ca, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_choose_voice"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children: x
                                  ? iu(x)
                                  : v("rd_words_voice_default"),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p("/setting/language/ui"),
                            extensionClient.track({
                              name: "setting_language_ui",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(sa, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_ui_language"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children:
                                  null ==
                                  (i = so.find(
                                    (e) => e.code === a.language.interface,
                                  ))
                                    ? void 0
                                    : i.nativeName,
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p("/setting/theme-config"),
                            extensionClient.track({
                              name: "setting_theme_config",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(_a, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_theme_setting"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "right-action",
                            children: [
                              (0, jsxRuntime.jsx)("span", {
                                children: o.theme,
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(Ca, {}),
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        onClick: () => {
                          p(
                            "Safari" === detectBrowser()
                              ? "/setting/shortcuts-safari"
                              : "/setting/shortcuts",
                          ),
                            extensionClient.track({
                              name: "setting_shortcuts",
                            });
                        },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(oa, {}),
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "name",
                                children: v("rd_slider_shortcut_config"),
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "right-action",
                            children: (0, jsxRuntime.jsx)("div", {
                              className: "t-icon icon-20",
                              children: (0, jsxRuntime.jsx)(Ca, {}),
                            }),
                          }),
                        ],
                      }),
                    ],
                  }),
                  (0, jsxRuntime.jsxs)("div", {
                    className: "slider-item-group",
                    id: "lexihalo-global-cache-group",
                    children: [
                      (0, jsxRuntime.jsx)("div", {
                        className: "group-label",
                        children: "缓存管理",
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        style: { cursor: "default" },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20",
                                children: (0, jsxRuntime.jsx)(ua, {}),
                              }),
                              (0, jsxRuntime.jsxs)("div", {
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "name",
                                    children: "一键清理所有缓存",
                                  }),
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "tips",
                                    children:
                                      "清除翻译缓存，不会删除澄资料库中的字幕副本、片段、笔记或截图",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "right-action",
                            children: (0, jsxRuntime.jsx)("div", {
                              className: "right-link",
                              "data-lexihalo-cache-scope": "all",
                              onClick: (e) => {
                                e.stopPropagation();
                                window.lexihaloClearScopedCache
                                  ? window.lexihaloClearScopedCache("all")
                                  : window.postMessage(
                                      {
                                        eventName:
                                          "lexihalo:cache-clear-request",
                                        scope: "all",
                                      },
                                      "*",
                                    );
                              },
                              children: (0, jsxRuntime.jsx)("span", {
                                children: "清理全部",
                              }),
                            }),
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        style: { cursor: "default" },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 red-icon",
                                children: (0, jsxRuntime.jsx)(xi, {}),
                              }),
                              (0, jsxRuntime.jsxs)("div", {
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "name",
                                    children: "重新载入当前字幕",
                                  }),
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "tips",
                                    children:
                                      "重置页面字幕并优先复用本机 AI 缓存，不重新下载字幕轨道",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "right-action",
                            children: (0, jsxRuntime.jsx)("div", {
                              className: "right-link",
                              "data-lexihalo-cache-scope": "subtitle",
                              onClick: (e) => {
                                e.stopPropagation();
                                window.lexihaloClearScopedCache
                                  ? window.lexihaloClearScopedCache("subtitle")
                                  : window.postMessage(
                                      {
                                        eventName:
                                          "lexihalo:cache-clear-request",
                                        scope: "subtitle",
                                      },
                                      "*",
                                    );
                              },
                              children: (0, jsxRuntime.jsx)("span", {
                                children: "清理",
                              }),
                            }),
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "slider-item",
                        style: { cursor: "default" },
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: "label",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "t-icon icon-20 red-icon",
                                children: (0, jsxRuntime.jsx)(xi, {}),
                              }),
                              (0, jsxRuntime.jsxs)("div", {
                                children: [
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "name",
                                    children: "彻底清除 AI 字幕缓存",
                                  }),
                                  (0, jsxRuntime.jsx)("div", {
                                    className: "tips",
                                    children:
                                      "删除持久 AI 字幕分段修复与翻译结果，下次播放时重新请求模型",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("div", {
                            className: "right-action",
                            children: (0, jsxRuntime.jsx)("div", {
                              className: "right-link",
                              "data-lexihalo-cache-scope": "ai-subtitle",
                              onClick: (e) => {
                                e.stopPropagation();
                                window.lexihaloClearScopedCache
                                  ? window.lexihaloClearScopedCache(
                                      "ai-subtitle",
                                    )
                                  : window.postMessage(
                                      {
                                        eventName:
                                          "lexihalo:cache-clear-request",
                                        scope: "ai-subtitle",
                                      },
                                      "*",
                                    );
                              },
                              children: (0, jsxRuntime.jsx)("span", {
                                children: "清理",
                              }),
                            }),
                          }),
                        ],
                      }),
                    ],
                  }),
                  null,
                ],
              }),
            ],
          }),
          (0, jsxRuntime.jsx)(SideNavigation, wv({}, props)),
        ],
      })
    );
  };

  return SettingsHome;
}
