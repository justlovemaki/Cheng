/**
 * Root renderer for the Reader settings slider.
 */
export function recoverSliderRoot(dependencies) {
  const React = dependencies.React;
  const RouterProvider = dependencies.wC;
  const classNames = dependencies.classNames;
  const jsxRuntime = dependencies.jsxRuntime;
  const motion = dependencies.q_;
  const setMetaAction = dependencies.Gn;
  const useApiClient = dependencies.useApiClient;
  const useAppSelector = dependencies.useAppSelector;
  const useDispatchBridge = dependencies.useDispatchBridge;

  const SliderRoot = (props) => {
    const { edreader, setting } = useAppSelector((state) => state);
    const api = useApiClient(true);
    const { dispatch, nativeDispatch } = useDispatchBridge();
    const loadMeta = async () => {
      const { message, data } = await api.getMeta();
      if (message === "ok") dispatch(setMetaAction(data));
    };
    (0, React.useEffect)(() => {
      loadMeta();
      const onTheme = (changes, area) => {
        if (area === "local" && changes.cheng_theme)
          nativeDispatch({
            type: "setEdreaderTheme",
            payload: changes.cheng_theme.newValue,
          });
      };
      chrome.storage.onChanged.addListener(onTheme);
      return () => chrome.storage.onChanged.removeListener(onTheme);
    }, []);
    const [stylesheetReady, setStylesheetReady] = (0, React.useState)(false);

    return (0, jsxRuntime.jsxs)(motion.div, {
      mode: "open",
      style: { zIndex: 2147483647 },
      children: [
        (0, jsxRuntime.jsx)("link", {
          onLoad: () => setStylesheetReady(true),
          rel: "stylesheet",
          href: `${props.runtime.scheme}/assets/edreader.css`,
        }),
        stylesheetReady &&
          (0, jsxRuntime.jsx)("div", {
            id: "trancy-root",
            className: classNames()(
              edreader.theme,
              "page-animation",
              `lt-${setting.language.interface}`,
            ),
            onClick: (event) => event.stopPropagation(),
            children: (0, jsxRuntime.jsx)(RouterProvider, {
              router: props.router,
            }),
          }),
      ],
    });
  };

  return SliderRoot;
}
