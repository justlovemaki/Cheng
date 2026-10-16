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

  const forwardHotkey = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const detail = {
      type: event.type,
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      isComposing: event.isComposing,
      repeat: event.repeat,
    };
    window.postMessage(
      {
        to: "background",
        from: "content",
        detail,
        eventName: "hotkey",
      },
      "*",
    );
  };

  let videoDownloadAuthorizedUntil = 0;
  let lastTrustedVideoUiGestureAt = 0;
  const browserUploadGrants = new Map();
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target : null;
      const button = document.querySelector("#xt-toggle-button.trancy-html5-button");
      const rect = button?.getBoundingClientRect();
      const insideGenericButton = Boolean(
        rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );
      if (target?.closest("#xt-toggle-button") || insideGenericButton) {
        lastTrustedVideoUiGestureAt = Date.now();
      }
      const isXPlayer = /(^|\.)(x\.com|twitter\.com)$/i.test(location.hostname);
      if (!isXPlayer && insideGenericButton && !target?.closest("#xt-toggle-button")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        button
          ?.querySelector(".trancy-button-logo")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    },
    true,
  );

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data) return;
    const { eventName, ...message } = event.data;
    switch (eventName) {
      case "lexihalo:subtitle-ai-request": {
        const { requestId, type, payload } = message;
        if (!requestId || typeof type !== "string" || !type.startsWith("lexihalo:subtitle-ai:"))
          break;
        let port;
        let settled = false;
        const reply = (response) => {
          if (settled) return;
          settled = true;
          if (
            response?.ok &&
            type === "lexihalo:subtitle-ai:browser-audio" &&
            payload?.operation === "begin"
          ) {
            browserUploadGrants.set(response.data?.uploadId, Date.now() + 30 * 60 * 1000);
          }
          if (
            response?.ok &&
            type === "lexihalo:subtitle-ai:browser-audio" &&
            browserUploadGrants.has(payload?.uploadId)
          ) {
            browserUploadGrants.set(payload.uploadId, Date.now() + 30 * 60 * 1000);
          }
          if (type === "lexihalo:subtitle-ai:browser-audio" && payload?.operation === "abort") {
            browserUploadGrants.delete(payload.uploadId);
          }
          try {
            port?.disconnect();
          } catch {}
          window.postMessage(
            {
              eventName: "lexihalo:subtitle-ai-response",
              requestId,
              response,
            },
            "*",
          );
        };
        try {
          const isFormatRequest = type === "lexihalo:subtitle-ai:video-formats";
          const isDownloadRequest = type === "lexihalo:subtitle-ai:video-download";
          const isTranscriptionRequest = type === "lexihalo:subtitle-ai:transcribe";
          const isChannelsOpen =
            type === "lexihalo:subtitle-ai:channels" && payload?.mode === "open";
          const isBrowserUploadBegin =
            type === "lexihalo:subtitle-ai:browser-audio" && payload?.operation === "begin";
          const hasBrowserUploadGrant =
            browserUploadGrants.get(payload?.browserUploadId) > Date.now();
          const hasTrustedVideoUiGesture =
            navigator.userActivation?.isActive || Date.now() - lastTrustedVideoUiGestureAt < 15000;
          if (isFormatRequest) {
            if (!hasTrustedVideoUiGesture) {
              reply({ ok: false, error: "请从播放器菜单打开视频下载" });
              break;
            }
            videoDownloadAuthorizedUntil = Date.now() + 2 * 60 * 1000;
          }
          if ((isBrowserUploadBegin || isChannelsOpen) && !hasTrustedVideoUiGesture) {
            reply({ ok: false, error: "请从播放器菜单开始浏览器音频读取" });
            break;
          }
          const userInitiated =
            isFormatRequest ||
            isBrowserUploadBegin ||
            isChannelsOpen ||
            (isTranscriptionRequest && (hasTrustedVideoUiGesture || hasBrowserUploadGrant)) ||
            (isDownloadRequest &&
              (hasTrustedVideoUiGesture ||
                hasBrowserUploadGrant ||
                Date.now() < videoDownloadAuthorizedUntil));
          if (isDownloadRequest && !userInitiated) {
            reply({ ok: false, error: "视频下载操作已过期，请重新打开下载菜单" });
            break;
          }
          if (isTranscriptionRequest && !userInitiated) {
            reply({ ok: false, error: "请点击播放器中的“AI 字幕（音频转写）”后再试" });
            break;
          }
          port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
          port.onMessage.addListener((result) => {
            if (result?.requestId !== requestId) return;
            if (result.progress) {
              window.postMessage(
                {
                  eventName: "lexihalo:subtitle-ai-progress",
                  requestId,
                  progress: result.progress,
                },
                "*",
              );
            } else reply(result.response);
          });
          port.onDisconnect.addListener(() => {
            if (!settled)
              reply({
                ok: false,
                error: chrome.runtime.lastError?.message || "AI subtitle connection closed",
              });
          });
          port.postMessage({
            ...(payload || {}),
            requestId,
            type,
            userInitiated,
            documentUrl: location.href,
          });
        } catch (error) {
          reply({ ok: false, error: error?.message || String(error) });
        }
        break;
      }
      case "message:background":
        try {
          if (!chrome.runtime?.id) break;
          const pending = chrome.runtime.sendMessage(chrome.runtime.id, message);
          pending?.catch?.(() => {});
        } catch {}
        break;
      case "hotkeys-uninstall":
        window.removeEventListener("keydown", forwardHotkey, true);
        document.removeEventListener("keydown", forwardHotkey, true);
        break;
      case "hotkeys-install":
        window.addEventListener("keydown", forwardHotkey, true);
        document.addEventListener("keydown", forwardHotkey, true);
        break;
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    const { to, from, response } = message;
    if (
      (Array.isArray(to) && to.includes("content")) ||
      to === "content" ||
      (from === "content" && response)
    ) {
      window.postMessage({ ...message, eventName: "message:content" }, "*");
    }
    return true;
  });

  document.documentElement?.setAttribute("data-lexihalo-video-bridge-runtime", "readable");
})();

});
})();
