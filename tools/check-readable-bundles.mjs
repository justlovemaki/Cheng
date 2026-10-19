import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => {
  throw new Error(message);
};
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const refs = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((entry) => entry.js || []),
];
for (const html of ["popup.html", "byok.html", "site-rules.html", "offscreen.html", "workspace.html", "study.html"]) {
  const source = fs.readFileSync(path.join(root, html), "utf8");
  for (const match of source.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g))
    refs.push(match[1]);
}
const expected = [
  "assets/background.js",
  "assets/edvideo-onload.js",
  "assets/site-rules-loader.js",
  "assets/tagger-main.js",
  "assets/ld-main.js",
  "assets/edreader-main.js",
  "assets/subtitle-ai-sidebar.js",
  "assets/popup.js",
  "assets/byok.js",
  "assets/site-rules.js",
  "assets/asr-offscreen.js",
  "assets/cheng-learning-entry.js",
  "assets/cheng-video-bridge.js",
  ...["fflate", "schema", "store", "transfer", "workspace", "understanding", "reading", "notes", "notes-library", "study"].map((name) => `assets/learning/${name}.js`),
];
for (const file of expected)
  if (!refs.includes(file)) fail(`Inactive readable entry: ${file}`);
if (refs.some((file) => /semantic-|materialized|(?:^|\/)src\//.test(file)))
  fail("A source or obsolete migration path is still active");
for (const file of refs)
  if (!fs.existsSync(path.join(root, file)))
    fail(`Missing active script: ${file}`);
const siteAdaptersSource = fs.readFileSync(path.join(root, "src/video/site-adapters.js"), "utf8");
for (const marker of ["declaredParentSources", "findPlayerFrame", "lexihaloGetCapturedSources"])
  if (!siteAdaptersSource.includes(marker)) fail(`Generic media discovery is missing ${marker}`);
const platformCatalog = JSON.parse(fs.readFileSync(path.join(root, "config/media-platforms.json"), "utf8"));
const siteCatalog = platformCatalog.filter(entry => entry.mode === "browser");
const specializedCatalog = platformCatalog.filter(entry => entry.mode === "specialized");
if (platformCatalog.length !== 32 || siteCatalog.length !== 19 || specializedCatalog.length !== 13 ||
    new Set(platformCatalog.map(entry => entry.id)).size !== platformCatalog.length)
  fail("The unified media platform catalogue is incomplete");
if (!manifest.permissions.includes("scripting")) fail("User-confirmed Channels verification requires scripting");
for (const permission of ['webRequest', 'declarativeNetRequestWithHostAccess'])
  if (!manifest.permissions.includes(permission)) fail(`Captured media replay requires ${permission}`);
const universalVideoMatches = ["http://*/*", "https://*/*", "file://*/*"];
for (const entry of manifest.content_scripts.slice(0, 2)) {
  if (universalVideoMatches.some((match) => !entry.matches?.includes(match)))
    fail("Generic HTML5 video runtime is not enabled for every ordinary page");
}

const mainBundles = {
  "assets/background.js": [
    "LexiHalo readable single bundle: background",
    "standalone",
    "lexihalo-subtitle-ai",
    "lexihaloExecuteStructuredAi",
    "max_completion_tokens",
    "audio-transcription",
    "timestamp_granularities[]",
    "mediaResource",
    "lexihalo:subtitle-ai:browser-audio",
    "beginUpload",
    "lexihaloSites",
    "lexihaloMediaContract",
    "lexihaloPlatformCapabilities",
    "lexihaloMediaSchema",
    "lexihaloCreateBackgroundMediaTasks",
    "lexihaloResolveChannelsRequest",
    "lexihaloMediaCapture",
    "onResponseStarted",
    "lexihalo:subtitle-ai:video-formats",
    "startDownload",
    "downloadNativeVideo",
    "subtitle-refresh",
    "ChengLearning",
    "cheng:learning:",
    "glossaryForTranslation",
    "translation-preview",
    "save-attachment",
  ],
  "assets/edreader-main.js": [
    "LexiHalo readable single bundle: reader",
    "lexihaloClearScopedCache",
    "fulltext-whitelist",
    "重新载入当前字幕",
    "彻底清除 AI 字幕缓存",
    "translation-language-change",
    "source-language-change",
  ],
  "assets/edvideo-main.js": [
    "LexiHalo readable single bundle: video",
    "captionProvider",
    "edvideo:caption.purgeAndReload",
    "aiInflightRequests",
    "baselineFallbackForPreload",
    "stableStart",
    "translationGeneration",
    "resetForLanguageChange",
    "suppressNativeCaptions",
    "[sourceLanguage, translationLanguage]",
    "distinguish Simplified and Traditional Chinese subtitles",
    "lineSameLanguage",
    "sameLangCheckKey",
    "tolerate detached or malformed timed-text nodes",
    "try the signed YouTube caption URL before waiting for interception",
    "retryDelayMs",
    "lexihaloTranscribeAudio",
    "lexihaloListVideoFormats",
    "lexihaloDownloadVideo",
    "data-lexihalo-video-download",
    "lexihalo-download-progress-track",
    "lexihalo-download-status",
    "transcription.status",
    "data-lexihalo-audio-transcribe",
    "lexihaloReadBrowserAudio",
    "lexihaloSiteAdapters",
    "lexihaloMediaSiteHooks",
    "lexihaloMediaContract",
    "lexihaloPlatformCapabilities",
    "lexihaloMediaSchema",
    "lexihaloMediaTasks",
    "lexihaloReadBrowserMedia",
    "lexihaloSites",
    "下载媒体",
    "lexihaloMediaWorkflow",
    "lexihaloGetHelperStatus",
    "data-lexihalo-media-advanced",
    "data-lexihalo-media-fallback-action",
    "browserUploadId",
    "lexihaloPickHtml5Video",
    "bootLexihaloVideoRuntime",
    "lexihalo-html5-container",
    "trancy-pornhub-control",
    "mgp_controlBar",
    "等待 AI 翻译",
    "originalText",
  ],
  "assets/popup.js": ["LexiHalo readable single bundle: popup", "LexiHalo"],
  "assets/ld-main.js": [
    "LexiHalo readable single bundle: languageDetector",
    "window.detectLanguage",
  ],
  "assets/tagger-main.js": [
    "LexiHalo readable single bundle: posTagger",
    "window.posTagger",
  ],
  "assets/romanize-main.js": [
    "LexiHalo readable single bundle: romanize",
    "window.romanize",
  ],
};
for (const [file, markers] of Object.entries(mainBundles)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (source.split("\n").length < 100) fail(`Bundle is not formatted: ${file}`);
  for (const marker of markers)
    if (!source.includes(marker)) fail(`${file} missing ${marker}`);
  execFileSync(process.execPath, ["--check", path.join(root, file)], {
    stdio: "pipe",
  });
}
for (const file of refs.filter((file) => !mainBundles[file])) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], {
    stdio: "pipe",
  });
}
const renames = JSON.parse(
  fs.readFileSync(
    path.join(root, "artifacts", "reports", "bundle-renames.json"),
    "utf8",
  ),
);
const totalRenames = Object.values(renames).reduce(
  (sum, entry) => sum + entry.count,
  0,
);
if (totalRenames < 300)
  fail(`Too few high-confidence renames: ${totalRenames}`);
const requiredUiComponents = {
  reader: [
    "SettingsHome",
    "DualSubtitleSettings",
    "ImmersiveTranslationSettings",
    "TranslationEngineSettings",
    "BrowserShortcutSettings",
    "ControlCenterSettingsPanel",
    "ControlCenterWidget",
    "QuickTranslatorPanel",
    "DictionaryPage",
    "WordDetailPanel",
    "WordLookupCard",
    "SentenceTranslationCard",
    "WriterSettings",
    "SliderRoot",
  ],
  video: [
    "DualCaptionApp",
    "VideoLearningApp",
    "VideoToggleButton",
    "initializeVideoRouter",
  ],
  popup: ["PopupApp"],
};
const minimumUiComponents = { reader: 33, video: 4, popup: 1 };
for (const [area, required] of Object.entries(requiredUiComponents)) {
  const installed = renames[area]?.sourceComponents || [];
  if (
    installed.length < minimumUiComponents[area] ||
    required.some((component) => !installed.includes(component))
  ) {
    fail(
      `${area} UI is not fully sourced from src/${area} (${installed.length} installed)`,
    );
  }
}
for (const language of ["languageDetector", "posTagger", "romanize"]) {
  if (renames[language].count !== 0)
    fail(`Language/data bundle was unexpectedly renamed: ${language}`);
}

const hashFiles = () =>
  Object.fromEntries(
    [...new Set([...Object.keys(mainBundles), ...refs, "workspace.html", "study.html", "assets/learning/workspace.css", "assets/learning/study.css"])].map((file) => [
      file,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
    ]),
  );
const before = hashFiles();
execFileSync(
  process.execPath,
  [path.join(root, "tools/build-readable-bundles.mjs")],
  { cwd: root, stdio: "pipe" },
);
const after = hashFiles();
if (JSON.stringify(before) !== JSON.stringify(after))
  fail("Readable bundle build is not reproducible");

// Verify dist directory integrity
const distDir = path.join(root, "dist");
if (!fs.existsSync(distDir)) fail("Missing dist/ directory after build");
if (!fs.existsSync(path.join(distDir, "manifest.json"))) fail("Missing dist/manifest.json");
if (!fs.existsSync(path.join(distDir, "THIRD_PARTY_NOTICES.txt"))) fail("Missing third-party adaptation notice in dist/");
for (const file of expected) {
  if (!fs.existsSync(path.join(distDir, file))) {
    fail(`Missing file in dist/: ${file}`);
  }
}

for (const locale of fs.readdirSync(path.join(root, "_locales"))) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, "_locales", locale, "messages.json"), "utf8"));
  if (!messages.PKG_NAME.message.includes("Cheng") || messages.PKG_NAME.message.includes("LexiHalo")) fail(`Outdated display brand: ${locale}`);
}
if (!fs.existsSync(path.join(distDir, "assets/learning/fflate-LICENSE.txt"))) fail("Missing archive library license");
if (!fs.existsSync(path.join(distDir, "assets/cheng-theme.css"))) fail("Missing shared Cheng design tokens");

if (manifest.side_panel?.default_path !== "study.html" || !manifest.permissions.includes("sidePanel") || Number(manifest.minimum_chrome_version) < 116) fail("The learning entry must open a supported native side panel");

const browserReportPath = path.join(
  root,
  "artifacts",
  "reports",
  "browser-regression.json",
);
if (fs.existsSync(browserReportPath)) {
  const report = JSON.parse(fs.readFileSync(browserReportPath, "utf8"));
  if (report.status !== "passed" || report.errors?.length)
    fail("The latest readable browser regression did not pass");
}
console.log(
  `Readable bundle checks passed: ${Object.keys(mainBundles).length} bundles, ${totalRenames} semantic renames, deterministic build.`,
);
