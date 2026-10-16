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
