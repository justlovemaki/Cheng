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
/* Bridge for the original edge dock's learning-console link. No extra floating UI. */
(() => {
  "use strict";
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.eventName !== "cheng:open-workspace" ||
      !navigator.userActivation?.isActive
    )
      return;
    chrome.runtime.sendMessage({ type: "cheng:learning:open" }).catch(() => {});
  });
  let progressPending = false;
  const recordProgress = async () => {
    if (progressPending || !document.querySelector("video,audio")) return;
    progressPending = true;
    try {
      await chrome.runtime.sendMessage({
        type: "cheng:learning:record-progress",
      });
    } catch {
    } finally {
      progressPending = false;
    }
  };
  setInterval(() => {
    if (
      [...document.querySelectorAll("video,audio")].some((media) => !media.paused && !media.ended)
    )
      void recordProgress();
  }, 15000);
  for (const name of ["pause", "seeked"])
    document.addEventListener(
      name,
      (event) => {
        if (event.isTrusted && /^(VIDEO|AUDIO)$/.test(event.target?.tagName || ""))
          void recordProgress();
      },
      true,
    );
})();

});
})();
