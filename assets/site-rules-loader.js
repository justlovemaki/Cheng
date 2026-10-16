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

  const STORAGE_KEY = "lexihalo_site_rules";
  const FEATURES = {
    immersive: {
      attribute: "data-lexihalo-immersive-always",
      event: "lexihalo:immersive-enable",
    },
  };

  let rules = {};
  let lastUrl = location.href;
  let applyGeneration = 0;

  const escapeRegExp = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

  const matchesRule = (value, url) => {
    let rule = String(value || "").trim();
    if (!rule || rule.startsWith("#")) return false;

    try {
      const current = new URL(url);

      if (rule.includes("://")) {
        // A scheme + host without a path means the entire site, just like a host rule.
        if (!rule.includes("*") && /^[a-z][a-z\d+.-]*:\/\/[^/?#]+$/i.test(rule)) {
          rule += "/*";
        }
        const pattern = "^" + escapeRegExp(rule).replaceAll("*", ".*") + "$";
        return new RegExp(pattern, "i").test(current.href);
      }

      rule = rule.replace(/^\/\//, "");
      const slash = rule.indexOf("/");
      const hostPattern = (slash >= 0 ? rule.slice(0, slash) : rule)
        .replace(/\.$/, "")
        .toLowerCase();
      const pathPattern = slash >= 0 ? rule.slice(slash) : "/*";
      const hostname = current.hostname.replace(/\.$/, "").toLowerCase();
      const hostMatches =
        hostPattern === "*" ||
        (hostPattern.startsWith("*.")
          ? hostname === hostPattern.slice(2) || hostname.endsWith(hostPattern.slice(1))
          : hostname === hostPattern);

      if (!hostMatches) return false;
      const pathRegex = "^" + escapeRegExp(pathPattern).replaceAll("*", ".*") + "$";
      return new RegExp(pathRegex, "i").test(current.pathname + current.search);
    } catch {
      return false;
    }
  };

  const featureMatches = (feature, url) =>
    Array.isArray(rules?.[feature]) && rules[feature].some((rule) => matchesRule(rule, url));

  const dispatchEnable = (feature, url, generation) => {
    if (generation !== applyGeneration || location.href !== url || !featureMatches(feature, url))
      return;
    window.dispatchEvent(new CustomEvent(FEATURES[feature].event));
  };

  const applyRules = ({ retry = false } = {}) => {
    if (!document.documentElement) {
      window.setTimeout(() => applyRules({ retry }), 0);
      return;
    }

    const url = location.href;
    const generation = ++applyGeneration;

    for (const [feature, config] of Object.entries(FEATURES)) {
      const matched = featureMatches(feature, url);
      if (matched) document.documentElement.setAttribute(config.attribute, "1");
      else document.documentElement.removeAttribute(config.attribute);
      if (matched) dispatchEnable(feature, url, generation);
    }

    // A delayed second signal lets the page runtime finish handling SPA navigation.
    if (retry) {
      window.setTimeout(() => {
        for (const feature of Object.keys(FEATURES)) {
          dispatchEnable(feature, url, generation);
        }
      }, 1000);
    }
  };

  const checkForNavigation = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    applyRules({ retry: true });
  };

  chrome.storage.local
    .get(STORAGE_KEY)
    .then((result) => {
      rules = result[STORAGE_KEY] || {};
      lastUrl = location.href;
      applyRules({ retry: true });
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    rules = changes[STORAGE_KEY].newValue || {};
    lastUrl = location.href;
    applyRules({ retry: true });
  });

  // popstate/hashchange cover normal navigation; polling also covers SPA calls
  // to history.pushState/replaceState made in the page's isolated main world.
  window.addEventListener("popstate", checkForNavigation);
  window.addEventListener("hashchange", checkForNavigation);
  window.addEventListener("pageshow", () => {
    lastUrl = location.href;
    applyRules({ retry: true });
  });
  window.setInterval(checkForNavigation, 500);
})();

});
})();
