/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverThemeSettings(dependencies) {
  const Gi = dependencies.Gi;
  const Ki = dependencies.Ki;
  const Nn = dependencies.Nn;
  const Ta = dependencies.Ta;
  const classNames = dependencies.classNames;
  const fw = dependencies.fw;
  const jsxRuntime = dependencies.jsxRuntime;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const useSliderNavigation = dependencies.useSliderNavigation;

  const ThemeSettings = () => {
    const { edreader: e, user: t } = useAppSelector((e) => ({
        edreader: e.edreader,
        user: e.user,
      })),
      { navigate: n } = useSliderNavigation(),
      { locale: r } = useLocale(),
      { dispatch: i } = useDispatchBridge();
    return (0, jsxRuntime.jsxs)("div", {
      className: "rd-slider-inside",
      id: "trancy-slider",
      children: [
        (0, jsxRuntime.jsx)("div", {
          className: "rd-slider-nav",
          children: (0, jsxRuntime.jsxs)("div", {
            className: "nav-left",
            onClick: () => n(-1),
            children: [
              (0, jsxRuntime.jsx)("div", {
                className: "btn-slider-back",
                children: (0, jsxRuntime.jsx)("div", {
                  className: "t-icon icon-18",
                  children: (0, jsxRuntime.jsx)(Ta, {}),
                }),
              }),
              (0, jsxRuntime.jsx)("span", {
                children: r("rd_theme_setting"),
              }),
            ],
          }),
        }),
        (0, jsxRuntime.jsxs)("div", {
          className: "rd-slider-content",
          children: [
            (0, jsxRuntime.jsx)("div", {
              className: "tips",
              children:
                "主题同步应用于网页与视频悬浮栏、学习侧栏和资料库；自动模式跟随系统。",
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "item-slider-group",
              children: fw.map((r) =>
                (0, jsxRuntime.jsx)("div", {
                  className: classNames()("item-slider pointer", r, {
                    selected: r === e.theme,
                  }),
                  role: "button",
                  tabIndex: 0,
                  "aria-pressed": r === e.theme,
                  "data-cheng-theme-option": r,
                  onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      i(Nn(r));
                    }
                  },
                  onClick: () =>
                    ((e) => {
                      i(Nn(e));
                    })(r),
                  children: (0, jsxRuntime.jsxs)("div", {
                    className: "item-slider-content",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "item-left",
                        children: [
                          (0, jsxRuntime.jsxs)("div", {
                            className: classNames()("color-scheme", r),
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "anker",
                              }),
                              (0, jsxRuntime.jsx)("div", {
                                className: "letter",
                                children: "Aa",
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsx)("span", {
                            children: r === "auto" ? "auto · 跟随系统" : r,
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "item-right",
                        children: (0, jsxRuntime.jsx)("div", {
                          className: "right-check",
                          children: (0, jsxRuntime.jsx)("div", {
                            className: classNames()("t-icon icon-18", {
                              solid: r === e.theme,
                            }),
                            children:
                              r === e.theme
                                ? (0, jsxRuntime.jsx)(Ki, {})
                                : (0, jsxRuntime.jsx)(Gi, {}),
                          }),
                        }),
                      }),
                    ],
                  }),
                }),
              ),
            }),
          ],
        }),
      ],
    });
  };

  return ThemeSettings;
}
