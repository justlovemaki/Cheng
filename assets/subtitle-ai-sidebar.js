(() => {
// Embedded into each content-script bundle by the build, in a private scope.
// Do not touch the DOM, page APIs, storage or messaging until this gate passes.
function lexihaloRunOutsideChallenge(boot) {
  const hostname = location.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "challenges.cloudflare.com" ||
    hostname.endsWith(".challenges.cloudflare.com") ||
    /^\/cdn-cgi\/challenge-platform(?:\/|$)/i.test(location.pathname)
  ) return;

  const start = () => {
    // Cloudflare interstitials keep the original site's URL. Check after parsing,
    // before any reader UI, network hooks or Trusted Types changes are installed.
    // A normal page with an embedded .cf-turnstile widget must NOT be excluded.
    if (document.querySelector(
      "#challenge-form, #challenge-running, #cf-challenge-running, #cf-challenge-stage",
    )) return;
    boot();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

lexihaloRunOutsideChallenge(() => {
(() => {
  "use strict";

  const request = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      let port;
      let settled = false;
      const requestId = crypto.randomUUID();
      const timeout = window.setTimeout(
        () => finish(null, new Error("Cache request timed out")),
        15000,
      );
      const finish = (response, error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          port?.disconnect();
        } catch {}
        if (error) reject(error);
        else if (response?.ok) resolve(response.data);
        else reject(new Error(response?.error || "Cache request failed"));
      };
      try {
        port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
        port.onMessage.addListener((message) => {
          if (message?.requestId === requestId) finish(message.response);
        });
        port.onDisconnect.addListener(() => {
          if (!settled)
            finish(
              null,
              new Error(chrome.runtime.lastError?.message || "Cache service disconnected"),
            );
        });
        port.postMessage({ requestId, type, ...payload });
      } catch (error) {
        finish(null, error);
      }
    });

  const clearCache = async (button, scope) => {
    const requestScope = scope === "subtitle" ? "subtitle-refresh" : scope;
    const originalText = button.textContent;
    button.style.pointerEvents = "none";
    button.textContent = "清理中…";
    try {
      await request("lexihalo:subtitle-ai:clear-cache", {
        scope: requestScope,
      });
      if (
        requestScope === "subtitle" ||
        requestScope === "subtitle-refresh" ||
        requestScope === "ai-subtitle"
      ) {
        try {
          window.postMessage(
            {
              eventName: "edvideo:caption.purgeAndReload",
              scope: requestScope,
            },
            "*",
          );
        } catch {}
      }
      button.textContent = "已清理";
      window.setTimeout(() => {
        button.textContent = originalText;
        button.style.pointerEvents = "";
      }, 1600);
    } catch (error) {
      button.textContent = "失败";
      button.title = error?.message || String(error);
      window.setTimeout(() => {
        button.textContent = originalText;
        button.style.pointerEvents = "";
      }, 2400);
    }
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.eventName !== "lexihalo:cache-clear-request") return;
    const scope = event.data.scope;
    if (
      ![
        "all",
        "ai-subtitle",
        "subtitle",
        "subtitle-refresh",
        "immersive",
        "selection",
        "quick",
      ].includes(scope)
    )
      return;
    const button =
      document.querySelector(`[data-lexihalo-cache-scope="${scope}"] span`) ||
      document.querySelector(`[data-lexihalo-cache-scope="${scope}"]`);
    if (button) clearCache(button, scope);
  });
})();

});
})();
