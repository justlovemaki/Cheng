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
      [...document.querySelectorAll("video,audio")].some(
        (media) => !media.paused && !media.ended,
      )
    )
      void recordProgress();
  }, 15000);
  for (const name of ["pause", "seeked"])
    document.addEventListener(
      name,
      (event) => {
        if (
          event.isTrusted &&
          /^(VIDEO|AUDIO)$/.test(event.target?.tagName || "")
        )
          void recordProgress();
      },
      true,
    );
})();
