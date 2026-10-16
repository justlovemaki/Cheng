/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverControlCenterSettingsPanel(dependencies) {
  const Fi = dependencies.Fi;
  const Ft = dependencies.Ft;
  const Ht = dependencies.Ht;
  const It = dependencies.It;
  const Ta = dependencies.Ta;
  const controlCenter = dependencies.controlCenter;
  const extensionClient = dependencies.extensionClient;
  const jsxRuntime = dependencies.jsxRuntime;
  const ki = dependencies.ki;
  const la = dependencies.la;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const useSliderNavigation = dependencies.useSliderNavigation;
  const zi = dependencies.zi;

  const ControlCenterSettingsPanel = (props) => {
    var t, n, r;
    const { setting: i } = useAppSelector((e) => e),
      { navigate: a } = useSliderNavigation(),
      { dispatch: o } = useDispatchBridge(),
      { locale: s } = useLocale();
    return (0, jsxRuntime.jsxs)("div", {
      className: "rd-slider-inside",
      id: "trancy-slider",
      children: [
        (0, jsxRuntime.jsx)("div", {
          className: "rd-slider-nav",
          children: (0, jsxRuntime.jsxs)("div", {
            className: "nav-left",
            onClick: () => a(-1),
            children: [
              (0, jsxRuntime.jsx)("div", {
                className: "btn-slider-back",
                children: (0, jsxRuntime.jsx)("div", {
                  className: "t-icon icon-18",
                  children: (0, jsxRuntime.jsx)(Ta, {}),
                }),
              }),
              (0, jsxRuntime.jsx)("span", {
                children: s("rd_slider_float_btn"),
              }),
            ],
          }),
        }),
        (0, jsxRuntime.jsxs)("div", {
          className: "rd-slider-content",
          children: [
            (0, jsxRuntime.jsx)("div", {
              className: "tips",
              children: s("rd_float_btn_tips"),
            }),
            (0, jsxRuntime.jsxs)("div", {
              className: "item-slider-group",
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "item-slider",
                  children: (0, jsxRuntime.jsxs)("div", {
                    className: "item-slider-content",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "item-left",
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "t-icon icon-20",
                            children: (0, jsxRuntime.jsx)(la, {}),
                          }),
                          (0, jsxRuntime.jsx)("span", {
                            children: s("rd_slider_float_btn"),
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "item-right",
                        onClick: () => {
                          o(It(!i.conrolCenter.enable)),
                            extensionClient.track({
                              name: i.conrolCenter.enable
                                ? "control_center_disable"
                                : "control_center_enable",
                            }),
                            controlCenter.reRenderControlCenter();
                        },
                        children: (0, jsxRuntime.jsx)("input", {
                          type: "checkbox",
                          className: "rd-switch",
                          checked: i.conrolCenter.enable,
                        }),
                      }),
                    ],
                  }),
                }),
                (0, jsxRuntime.jsx)("div", {
                  className: "item-slider",
                  children: (0, jsxRuntime.jsxs)("div", {
                    className: "item-slider-content",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "item-left",
                        children: [
                          (0, jsxRuntime.jsx)("div", {
                            className: "t-icon icon-22",
                            children: (0, jsxRuntime.jsx)(zi, {}),
                          }),
                          (0, jsxRuntime.jsx)("span", {
                            children: s("rd_float_btn_opacity"),
                          }),
                        ],
                      }),
                      (0, jsxRuntime.jsxs)("div", {
                        className: "item-right",
                        children: [
                          (0, jsxRuntime.jsxs)("label", {
                            className: "slider-range-value",
                            children: [
                              null != (t = i.conrolCenter.opacity) ? t : 25,
                              "%",
                            ],
                          }),
                          (0, jsxRuntime.jsxs)("div", {
                            className: "slider-range",
                            children: [
                              (0, jsxRuntime.jsx)("div", {
                                className: "slider-range-track",
                                style: {
                                  width:
                                    (((null != (n = i.conrolCenter.opacity)
                                      ? n
                                      : 25) -
                                      20) /
                                      80) *
                                      100 +
                                    "%",
                                },
                              }),
                              (0, jsxRuntime.jsx)("input", {
                                className: "slider-range-thumb",
                                type: "range",
                                step: 5,
                                min: 20,
                                max: 100,
                                onChange: (e) => {
                                  o(Ht(parseInt(e.target.value))),
                                    extensionClient.track({
                                      name: "control_center_opacity",
                                      event_value: parseInt(e.target.value),
                                    });
                                },
                                value:
                                  null != (r = i.conrolCenter.opacity)
                                    ? r
                                    : 25,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                }),
              ],
            }),
            (0, jsxRuntime.jsx)("div", {
              className: "slider-label lg-label",
              children: s("rd_float_btn_black_list_tips"),
            }),
            0 === i.conrolCenter.blackList.length &&
              (0, jsxRuntime.jsxs)("div", {
                className: "no-float-data",
                children: [
                  (0, jsxRuntime.jsx)("div", {
                    className: "t-icon icon-20",
                    children: (0, jsxRuntime.jsx)(ki, {}),
                  }),
                  (0, jsxRuntime.jsx)("span", {
                    children: s("no_float_data"),
                  }),
                ],
              }),
            (0, jsxRuntime.jsx)("div", {
              className: "item-slider-group",
              children: i.conrolCenter.blackList.map((e) =>
                (0, jsxRuntime.jsx)("div", {
                  className: "item-slider",
                  children: (0, jsxRuntime.jsxs)("div", {
                    className: "item-slider-content",
                    children: [
                      (0, jsxRuntime.jsxs)("div", {
                        className: "item-left",
                        children: [
                          (0, jsxRuntime.jsx)("span", {
                            children: e,
                          }),
                          " ",
                        ],
                      }),
                      (0, jsxRuntime.jsx)("div", {
                        className: "item-right black-list-action",
                        children: (0, jsxRuntime.jsx)("div", {
                          className: "t-icon icon-16",
                          onClick: () => {
                            o(
                              Ft(
                                i.conrolCenter.blackList.filter((t) => t !== e),
                              ),
                            );
                          },
                          children: (0, jsxRuntime.jsx)(Fi, {}),
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

  return ControlCenterSettingsPanel;
}
