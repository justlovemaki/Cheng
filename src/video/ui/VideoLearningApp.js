/**
 * Semantic recovery of a scope-hoisted bundle function.
 */
export function recoverVideoLearningApp(dependencies) {
  const Kf = dependencies.Kf;
  const React = dependencies.React;
  const be = dependencies.be;
  const extensionClient = dependencies.extensionClient;
  const jsxRuntime = dependencies.jsxRuntime;
  const mb = dependencies.mb;
  const playSound = dependencies.playSound;
  const setPlayerCurrentAction = dependencies.setPlayerCurrentAction;
  const setPlayerPausedAction = dependencies.setPlayerPausedAction;
  const shallowEqual = dependencies.shallowEqual;
  const useAppSelector = dependencies.useAppSelector;
  const useAppDispatch = dependencies.useAppDispatch;
  const useDispatchBridge = dependencies.useDispatchBridge;
  const useLocale = dependencies.useLocale;
  const vC = dependencies.vC;
  const videoRouter = dependencies.videoRouter;
  const xb = dependencies.xb;

  const VideoLearningApp = (props) => {
    const [n, r] = (0, React.useState)(!1);
    const nativeDispatch = useAppDispatch();
    (0, React.useEffect)(() => {
      const syncTheme = () =>
        nativeDispatch({
          type: "setting/setTheme",
          payload:
            document.documentElement.getAttribute("data-cheng-theme") || "auto",
        });
      const observer = new MutationObserver(syncTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-cheng-theme"],
      });
      syncTheme();
      return () => observer.disconnect();
    }, []);
    vC();
    const { setting: i, user: a } = useAppSelector(
        (e) => ({
          setting: e.setting,
          user: e.user,
        }),
        shallowEqual,
      ),
      { dispatch: o } = useDispatchBridge(),
      s = () => {
        const { current: e, paused: n } = props.player;
        o(setPlayerCurrentAction(e)), o(setPlayerPausedAction(n));
      },
      { locale: l } = useLocale();
    return (
      (0, React.useEffect)(() => {
        const e = (e) => {
            if (e.ctrlKey || e.metaKey)
              switch (null == e ? void 0 : e.key) {
                case "r":
                  window.location.reload();
                  break;
                case "c":
                  const e = document.getSelection(),
                    t = (null == e ? void 0 : e.toString()) || "";
                  Kf()(t);
                  break;
                case "f":
                  window.find();
                  break;
                case "w":
                  window.close();
                  break;
                case "t":
                  window.open("");
                  break;
                case "F8":
                  debugger;
              }
          },
          n = () => {
            extensionClient.toggle("off");
          };
        s(),
          props.player.on("changed", s),
          props.player.on("skip-ad", () => {
            r(!0);
          }),
          props.player.on("repeated.sound", () => {
            playSound(props.runtime, "beep.wav");
          }),
          extensionClient.installHotkey(),
          extensionClient.onKeyDown(e),
          document.documentElement.classList.add("trancy-"),
          window.addEventListener("popstate", n);
        const i = (e) => {
          if (e instanceof CustomEvent) {
            const { detail: t } = e;
            t.body && o(t.body);
          }
        };
        return (
          window.addEventListener("edvideo:dispatch", i),
          window.addEventListener("edvideo:installHotKey", () => {
            extensionClient.installHotkey();
          }),
          window.addEventListener("edvideo:uninstallHotKey", () => {
            extensionClient.uninstallHotkey();
          }),
          extensionClient.emit("edvideo:embed", ["background"], {
            status: "on",
            href: window.location.href,
          }),
          () => {
            props.player.off("changed", s),
              props.player.restore(),
              props.player.exit(),
              extensionClient.uninstallHotkey(),
              extensionClient.offKeyDown(e),
              window.removeEventListener("popstate", n),
              window.removeEventListener("edvideo:dispatch", i),
              document.documentElement.classList.remove("trancy-"),
              extensionClient.emit("edvideo:embed", ["background"], {
                status: "off",
                href: window.location.href,
              });
          }
        );
      }, []),
      (0, jsxRuntime.jsxs)("div", {
        onClick: (e) => {
          const t = e.target,
            n = document.querySelector("#trancy-slider");
          n && n.contains(t) && e.stopPropagation();
        },
        className: xb()(
          "trancy-container",
          "xt-unhighlight",
          i.font,
          i.theme,
          i.fontSize,
          i.fontWeight,
          i.language.subtitle,
          `lt-${i.language.interface}`,
          {
            "trancy-vip": !!a,
          },
        ),
        id: "trancy-root",
        children: [
          n &&
            (0, jsxRuntime.jsxs)("div", {
              className: "skip-ad-toast",
              children: [
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-svg-icon icon-28",
                  children: (0, jsxRuntime.jsx)(be, {}),
                }),
                (0, jsxRuntime.jsx)("p", {
                  children: l("ad_block_tips"),
                }),
                (0, jsxRuntime.jsx)("div", {
                  className: "trancy-btn md solid",
                  onClick: () => {
                    extensionClient.toggle();
                  },
                  children: (0, jsxRuntime.jsx)("span", {
                    children: l("ad_block_btn"),
                  }),
                }),
              ],
            }),
          (0, jsxRuntime.jsx)(mb, {
            router: videoRouter,
          }),
        ],
      })
    );
  };

  return VideoLearningApp;
}
