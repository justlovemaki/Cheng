/** Original unsupported-page popup, with one additive workbench link. */
export function recoverPopupApp(dependencies) {
  const React = dependencies.React;
  const englishTranslations = dependencies.englishTranslations;
  const jsxRuntime = dependencies.jsxRuntime;
  const translations = dependencies.translations;
  const RESTRICTED_URL_PATTERNS = [
    /^chrome(-extension|-untrusted|-search|-devtools)?:\/\//i,
    /^edge:\/\//i,
    /^about:/i,
    /^moz-extension:\/\//i,
    /^safari-web-extension:\/\//i,
    /^view-source:/i,
    /^devtools:\/\//i,
    /^https?:\/\/chromewebstore\.google\.com/i,
    /^https?:\/\/chrome\.google\.com\/webstore/i,
    /^https?:\/\/addons\.mozilla\.org/i,
    /^https?:\/\/microsoftedge\.microsoft\.com\/addons/i,
    /^https?:\/\/www\.google\.com\/_\/chrome\/newtab/i,
  ];
  const detectUiLanguage = () => {
    let language = "en";
    try {
      language = chrome.i18n?.getUILanguage?.() || navigator.language || "en";
    } catch {}
    if (translations[language]) return language;
    const normalized = language.toLowerCase();
    if (normalized.startsWith("zh"))
      return /hant|tw|hk|mo/.test(normalized) ? "zh-Hant" : "zh-CN";
    const base = language.split("-")[0];
    return translations[base] ? base : "en";
  };
  const PopupApp = () => {
    const [pageKind, setPageKind] = React.useState(undefined);
    const [language, setLanguage] = React.useState(detectUiLanguage);
    React.useEffect(() => {
      let active = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!active) return;
        const address = tabs?.[0]?.url;
        if (
          !address ||
          RESTRICTED_URL_PATTERNS.some((pattern) => pattern.test(address))
        )
          return setPageKind("browser");
        try {
          const host = new URL(address).hostname;
          setPageKind(
            ["learn.trancy.org", "localhost", "127.0.0.1"].includes(host)
              ? "dashboard"
              : null,
          );
        } catch {
          setPageKind("browser");
        }
      });
      let port;
      const timer = setTimeout(() => {
        try {
          port?.disconnect();
        } catch {}
      }, 3000);
      try {
        port = chrome.runtime.connect({ name: "trancy-popup-context" });
        port.onMessage.addListener((context) => {
          if (active && translations[context?.uiLang])
            setLanguage(context.uiLang);
          clearTimeout(timer);
          port.disconnect();
        });
        port.onDisconnect.addListener(() => {
          chrome.runtime.lastError;
          clearTimeout(timer);
        });
      } catch {
        clearTimeout(timer);
      }
      return () => {
        active = false;
        clearTimeout(timer);
        try {
          port?.disconnect();
        } catch {}
      };
    }, []);
    const label = (key) =>
      translations[language]?.[key] || englishTranslations[key] || key;
    const dashboard = pageKind === "dashboard";
    return jsxRuntime.jsxs("div", {
      className: `trancy-popup ${pageKind !== undefined ? "ready" : ""}`,
      children: [
        jsxRuntime.jsxs("div", {
          className: "trancy-popup-head",
          children: [
            jsxRuntime.jsx("img", {
              className: "trancy-popup-logo cheng-brand-icon",
              src: "assets/logo.svg",
              alt: "澄 Cheng",
            }),
            jsxRuntime.jsx("span", {
              className: "trancy-popup-brand",
              children: "澄 Cheng",
            }),
          ],
        }),
        jsxRuntime.jsx("div", {
          className: "trancy-popup-title",
          children: label(
            dashboard ? "popup_dashboard_title" : "popup_unsupported_title",
          ),
        }),
        jsxRuntime.jsx("div", {
          className: "trancy-popup-desc",
          children: label(
            dashboard ? "popup_dashboard_des" : "popup_unsupported_des",
          ),
        }),
        jsxRuntime.jsxs("div", {
          className: "trancy-popup-actions",
          children: [
            jsxRuntime.jsx("button", {
              className: "trancy-popup-btn primary",
              onClick: () => window.close(),
              children: label("popup_got_it"),
            }),
            jsxRuntime.jsx("button", {
              className: "trancy-popup-btn",
              "data-cheng-workspace": true,
              onClick: () => {
                chrome.tabs.create({
                  url: chrome.runtime.getURL("workspace.html"),
                });
                window.close();
              },
              children: language.startsWith("zh")
                ? "打开学习资料库"
                : "Open learning library",
            }),
          ],
        }),
      ],
    });
  };
  return PopupApp;
}
