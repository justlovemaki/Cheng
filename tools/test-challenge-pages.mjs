import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const guard = read("src/shared/challenge-page-guard.js");
const manifest = JSON.parse(read("manifest.json"));
const exclusions = [
  "*://challenges.cloudflare.com/*",
  "*://*.challenges.cloudflare.com/*",
  "*://*/cdn-cgi/challenge-platform/*",
];
for (const entry of manifest.content_scripts) {
  for (const pattern of exclusions) assert.ok(entry.exclude_matches.includes(pattern));
}
assert.deepEqual(JSON.parse(read("dist/manifest.json")), manifest);

function fixture(url, { loading = false, challenge = false, turnstile = false } = {}) {
  const listeners = [];
  let boots = 0;
  let queries = 0;
  const context = vm.createContext({
    location: new URL(url),
    document: {
      readyState: loading ? "loading" : "interactive",
      querySelector(selector) {
        queries += 1;
        assert.ok(!selector.includes(".cf-turnstile"), "Do not disable the widget's host page");
        return challenge || (turnstile && selector.includes(".cf-turnstile")) ? {} : null;
      },
      addEventListener(event, fn, options) {
        assert.equal(event, "DOMContentLoaded");
        assert.equal(options.once, true);
        listeners.push(fn);
      },
    },
    boot() { boots += 1; },
  });
  return {
    context,
    start() { vm.runInContext(guard + "\nlexihaloRunOutsideChallenge(boot);", context); },
    parsed(isChallenge) {
      challenge = isChallenge;
      context.document.readyState = "interactive";
      listeners.splice(0).forEach((fn) => fn());
    },
    get boots() { return boots; },
    get queries() { return queries; },
    get pending() { return listeners.length; },
  };
}

const blockedUrls = [
  "https://challenges.cloudflare.com/turnstile/v0/test",
  "https://child.challenges.cloudflare.com/frame",
  "https://CHALLENGES.CLOUDFLARE.COM./frame",
  "https://example.org/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1",
];
for (const url of blockedUrls) {
  const page = fixture(url, { loading: true });
  page.start();
  assert.equal(page.boots, 0);
  assert.equal(page.pending, 0);
  assert.equal(page.queries, 0);
}
for (const url of [
  "https://example.org/article",
  "https://example.org/cdn-cgi/trace",
  "https://challenges.cloudflare.com.attacker.example/article",
  "file:///tmp/article.html",
]) {
  const page = fixture(url, { turnstile: true });
  page.start();
  assert.equal(page.boots, 1, url);
}
const lateChallenge = fixture("https://example.org/protected", { loading: true });
lateChallenge.start();
assert.equal(lateChallenge.boots, 0);
lateChallenge.parsed(true);
assert.equal(lateChallenge.boots, 0, "Late-parsed interstitial must not boot");
const ordinary = fixture("https://example.org/article", { loading: true });
ordinary.start();
assert.equal(ordinary.boots, 0);
ordinary.parsed(false);
assert.equal(ordinary.boots, 1);

// Execute every actual generated content bundle with NO browser/extension APIs
// available. A bypassed gate would throw or mutate this minimal context.
const scripts = [...new Set(manifest.content_scripts.flatMap((entry) => entry.js))];
for (const file of scripts) {
  for (const prefix of ["", "dist/"]) {
    const source = read(prefix + file);
    assert.ok(source.includes("lexihaloRunOutsideChallenge(() => {"), file);
    for (const url of blockedUrls) {
      const page = fixture(url);
      vm.runInContext(source, page.context, { timeout: 2000 });
      assert.deepEqual(Object.keys(page.context).sort(), ["boot", "document", "location"]);
    }
    const page = fixture("https://example.org/protected", { loading: true });
    vm.runInContext(source, page.context, { timeout: 2000 });
    page.parsed(true);
    assert.deepEqual(Object.keys(page.context).sort(), ["boot", "document", "location"]);
  }
}
console.log(`Challenge-page isolation passed (${scripts.length} content scripts, root + dist).`);
