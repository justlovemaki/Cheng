import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = path.join(root, ".pi", "readable-e2e-profile");
fs.rmSync(profile, { recursive: true, force: true });
const errors = [];
const aiRequests = [];
const transcriptionRequests = [];
const transcriptionRequestHeaders = [];
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/html5-fixture")) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><body style="margin:0;background:#111">
      <div id="generic-player" style="width:640px;height:360px;position:relative">
        <video controls style="display:block;width:640px;height:360px;background:#000">
          <source src="/audio-fixture" type="video/webm">
        </video>
        <div id="site-player-overlay" style="position:absolute;inset:0;z-index:2147483647;pointer-events:auto"></div>
      </div>
      <script>
        const video = document.querySelector("video");
        Object.defineProperty(video, "duration", { value: 60 });
        const track = video.addTextTrack("subtitles", "English", "en");
        track.mode = "showing";
        for (let index = 0; index < 3; index += 1) {
          track.addCue(new VTTCue(index * 2, index * 2 + 1.8, "Generic caption line " + index));
        }
      </script>
    </body></html>`);
    return;
  }
  if (request.url?.startsWith("/audio-fixture")) {
    response.writeHead(200, {
      "content-type": "audio/webm",
      "content-length": "16",
    });
    response.end(Buffer.from("fixture-audio-01"));
    return;
  }
  if (request.url?.startsWith("/transcribe")) {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("latin1");
      transcriptionRequests.push(body);
      transcriptionRequestHeaders.push(request.headers);
      const send = () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            language: "en",
            duration: 5,
            text: "generated from audio second timed caption",
            segments: [
              { start: 0, end: 2500, text: "generated from audio" },
              { start: 2500, end: 5000, text: "second timed caption" },
            ],
          }),
        );
      };
      if (request.url?.startsWith("/transcribe-slow")) setTimeout(send, 35000);
      else send();
    });
    return;
  }
  if (request.url?.startsWith("/ai")) {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        aiRequests.push(JSON.parse(body));
      } catch {
        aiRequests.push({ invalidBody: body });
      }
      let content = "bundle translation";
      if (body.includes("source_ids") || body.includes("待处理字幕")) {
        content = JSON.stringify({
          segments: [{ source_ids: [1], text: "repaired source" }],
        });
      } else if (body.includes("expert bilingual subtitle")) {
        content = JSON.stringify([
          { repaired: "repaired source", translation: "bundle translation" },
        ]);
      }
      const send = () => {
        response.writeHead(200, { "content-type": "application/json" });
        const payload = body.includes("responses envelope")
          ? {
              output: [
                {
                  content: [{ type: "output_text", text: content }],
                },
              ],
            }
          : body.includes("empty response fixture") &&
              body.includes("expert bilingual subtitle")
            ? { choices: [{ message: { content: "" } }] }
            : { choices: [{ message: { content } }] };
        response.end(JSON.stringify(payload));
      };
      if (body.includes("slow generation")) setTimeout(send, 500);
      else send();
    });
    return;
  }
  if (request.url?.startsWith("/caption")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 2500,
            segs: [{ utf8: "source caption" }],
          },
        ],
      }),
    );
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(
    "<!doctype html><html><body><main><p>This paragraph is used by the readable bundle regression.</p></main></body></html>",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const localUrl = `http://127.0.0.1:${server.address().port}/`;
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--disable-extensions-except=${path.join(root, "dist")}`,
      `--load-extension=${path.join(root, "dist")}`,
      "--no-first-run",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 20000 }));
  let backgroundReady = false;
  for (let attempt = 0; attempt < 100 && !backgroundReady; attempt += 1) {
    backgroundReady = await worker.evaluate(
      () => globalThis.__lexihaloReadableBackground === true,
    );
    if (!backgroundReady)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!backgroundReady)
    throw new Error("Readable background did not initialize");
  const extensionId = new URL(worker.url()).host;

  const popup = await context.newPage();
  popup.on("pageerror", (error) => errors.push(`popup:${error.message}`));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup
    .locator('[data-lexihalo-popup-runtime="readable"]')
    .waitFor({ timeout: 15000 });
  await popup.locator(".trancy-popup.ready").waitFor({ timeout: 15000 });

  const byok = await context.newPage();
  byok.on("pageerror", (error) => errors.push(`byok:${error.message}`));
  await byok.goto(`chrome-extension://${extensionId}/byok.html`);
  await byok
    .locator('html[data-lexihalo-byok-runtime="readable"]')
    .waitFor({ timeout: 15000 });
  await byok.locator("#engine-form").waitFor({ timeout: 15000 });
  await byok.locator("#name").fill("E2E Engine");
  await byok.locator("#model").fill("e2e-model");
  await byok.locator("#endpoint").fill(`${localUrl}ai`);
  await byok.locator("#transcription-model").fill("whisper-1");
  await byok.locator("#transcription-endpoint").fill(`${localUrl}transcribe`);
  await byok.locator("#transcription-language").fill("中文");
  await byok.locator("#transcription-prompt").fill("E2E glossary");
  await byok.locator("#key").fill("e2e-key");
  await byok.locator('#engine-form button[type="submit"]').click();
  await byok.locator(".engine-name", { hasText: "E2E Engine" }).waitFor({ timeout: 10000 });
  let storedEngines = await byok.evaluate(async () =>
    (await chrome.storage.local.get("trancy_byok_engines")).trancy_byok_engines,
  );
  if (
    storedEngines?.length !== 1 ||
    storedEngines[0].key !== "e2e-key" ||
    storedEngines[0].transcriptionModel !== "whisper-1" ||
    storedEngines[0].transcriptionEndpoint !== `${localUrl}transcribe` ||
    storedEngines[0].transcriptionLanguage !== "中文" ||
    storedEngines[0].transcriptionPrompt !== "E2E glossary"
  ) {
    throw new Error("BYOK create/persist failed");
  }
  const engineId = storedEngines[0]._id;
  await byok.getByRole("button", { name: "编辑" }).click();
  await byok.locator("#name").fill("E2E Engine Edited");
  await byok.locator('#engine-form button[type="submit"]').click();
  await byok.reload();
  await byok.locator(".engine-name", { hasText: "E2E Engine Edited" }).waitFor({ timeout: 10000 });
  storedEngines = await byok.evaluate(async () =>
    (await chrome.storage.local.get("trancy_byok_engines")).trancy_byok_engines,
  );
  if (storedEngines?.[0]?._id !== engineId || storedEngines[0].name !== "E2E Engine Edited") {
    throw new Error("BYOK edit/reload failed");
  }
  const requestBackground = (name, body) =>
    byok.evaluate(
      ({ name, body }) =>
        new Promise((resolve, reject) => {
          const uuid = `${name}-${crypto.randomUUID()}`;
          const timer = setTimeout(
            () => reject(new Error(`${name} timeout`)),
            10000,
          );
          const listener = (message) => {
            if (message?.uuid !== uuid || !message.response) return;
            clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message.response);
          };
          chrome.runtime.onMessage.addListener(listener);
          chrome.runtime
            .sendMessage({
              from: "content",
              to: ["background"],
              name,
              body,
              uuid,
            })
            .catch(reject);
        }),
      { name, body },
    );
  const stateResponse = await requestBackground("getState", {});
  if (stateResponse?.data?.user?.id !== "standalone")
    throw new Error("Standalone state missing");
  const publicEngine = {
    _id: engineId,
    name: "E2E Engine Edited",
    provider: "OpenAI",
    providerId: "OpenAI",
    model: "e2e-model",
    endpoint: `${localUrl}ai`,
    type: "user",
  };
  const aiRequestsBeforeTranslation = aiRequests.length;
  const translated = await requestBackground("translateWithEngine", {
    texts: ["source"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: publicEngine,
  });
  if (
    translated?.[0]?.translation !== "bundle translation" ||
    translated?.[0]?.repairedText !== "repaired source"
  ) {
    throw new Error(`Bundle subtitle translation/repair failed: ${JSON.stringify(translated)}`);
  }
  if (aiRequests.length !== aiRequestsBeforeTranslation + 1) {
    throw new Error("AI subtitle repair unexpectedly issued a fallback model request");
  }
  const structuredRequest = aiRequests.at(-1);
  if (
    structuredRequest?.response_format !== undefined ||
    structuredRequest?.max_tokens > 8192 ||
    structuredRequest?.max_tokens < 768
  ) {
    throw new Error(
      `AI subtitle request tuning missing: ${JSON.stringify(structuredRequest)}`,
    );
  }

  const openRouterResult = await requestBackground("translateWithEngine", {
    texts: ["provider tuning"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: {
      _id: "test-openrouter",
      name: "OpenRouter Test",
      provider: "OpenAI",
      providerId: "OpenRouter",
      model: "openai/gpt-4.1-mini",
      endpoint: `${localUrl}ai`,
      key: "e2e-key",
      type: "user",
    },
  });
  if (openRouterResult?.[0]?.message !== "ok") {
    throw new Error(`OpenRouter subtitle request failed: ${JSON.stringify(openRouterResult)}`);
  }
  if (
    aiRequests.at(-1)?.reasoning?.exclude !== true ||
    aiRequests.at(-1)?.response_format?.type !== "json_object"
  ) {
    throw new Error("OpenRouter subtitle tuning was not applied");
  }

  const alternateEnvelope = await requestBackground("translateWithEngine", {
    texts: ["responses envelope"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: publicEngine,
  });
  if (
    alternateEnvelope?.[0]?.translation !== "bundle translation" ||
    alternateEnvelope?.[0]?.repairedText !== "repaired source"
  ) {
    throw new Error(
      `Alternate AI response envelope was not recovered: ${JSON.stringify(alternateEnvelope)}`,
    );
  }

  const emptyEnvelope = await requestBackground("translateWithEngine", {
    texts: ["empty response fixture"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: publicEngine,
  });
  if (
    emptyEnvelope?.[0]?.message !== "ok" ||
    emptyEnvelope?.[0]?.translation !== "bundle translation" ||
    emptyEnvelope?.[0]?.repairedText !== "empty response fixture" ||
    emptyEnvelope?.[0]?.fallback !== "ai-translation-only"
  ) {
    throw new Error(
      `Empty AI response handling failed: ${JSON.stringify(emptyEnvelope)}`,
    );
  }

  const partialBatch = await requestBackground("translateWithEngine", {
    texts: ["partial batch one", "partial batch two", "partial batch three"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: publicEngine,
  });
  if (
    partialBatch?.some((item) => item?.message !== "ok") ||
    partialBatch?.[0]?.translation !== "bundle translation" ||
    partialBatch?.[1]?.fallback !== "ai-translation-only" ||
    partialBatch?.[2]?.fallback !== "ai-translation-only"
  ) {
    throw new Error(
      `Partial AI subtitle batch fallback failed: ${JSON.stringify(partialBatch)}`,
    );
  }

  const longSource = "long subtitle ".repeat(240);
  await requestBackground("translateWithEngine", {
    texts: [longSource],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    engine: publicEngine,
  });
  if (aiRequests.at(-1)?.max_tokens <= 2048) {
    throw new Error("Long AI subtitle batch did not receive an adaptive token budget");
  }

  const slowRequest = requestBackground("translateWithEngine", {
    texts: ["slow generation"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    requestGroup: "e2e-video",
    requestGeneration: 1,
    engine: publicEngine,
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const latestRequest = requestBackground("translateWithEngine", {
    texts: ["latest generation"],
    from: "en",
    to: "zh-CN",
    cacheScope: "subtitle",
    useCache: false,
    requestGroup: "e2e-video",
    requestGeneration: 2,
    engine: publicEngine,
  });
  const [superseded, latest] = await Promise.all([slowRequest, latestRequest]);
  if (superseded?.[0]?.message === "ok" || latest?.[0]?.message !== "ok") {
    throw new Error(
      `AI subtitle generation cancellation failed: ${JSON.stringify({ superseded, latest })}`,
    );
  }
  await byok.locator("#refresh-diagnostics").click();
  await byok
    .locator("#diagnostics-output")
    .filter({ hasText: "combined-repair-translation" })
    .waitFor({ timeout: 10000 });
  if (!(await byok.locator("#diagnostics-output").innerText()).includes("ai-translation-only")) {
    throw new Error("AI subtitle fallback diagnostics were not recorded");
  }

  const cacheConfig = await byok.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
        const requestId = crypto.randomUUID();
        const timer = setTimeout(
          () => reject(new Error("cache port timeout")),
          5000,
        );
        port.onMessage.addListener((message) => {
          if (message?.requestId !== requestId) return;
          clearTimeout(timer);
          port.disconnect();
          message.response?.ok
            ? resolve(message.response.data)
            : reject(new Error(message.response?.error));
        });
        port.postMessage({
          requestId,
          type: "lexihalo:subtitle-ai:get-config",
        });
      }),
  );
  if (!Array.isArray(cacheConfig.engines) || cacheConfig.engines[0]?._id !== engineId)
    throw new Error("Subtitle cache/config port failed");

  const transcribeAudio = ({ videoId = "e2e-audio-video", timeoutMs = 10000 } = {}) =>
    byok.evaluate(
      ({ engineId, audioUrl, videoId, timeoutMs }) =>
        new Promise((resolve, reject) => {
          const port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
          const requestId = crypto.randomUUID();
          const timer = setTimeout(
            () => reject(new Error("audio transcription timeout")),
            timeoutMs,
          );
          port.onMessage.addListener((message) => {
            if (message?.requestId !== requestId) return;
            clearTimeout(timer);
            port.disconnect();
            message.response?.ok
              ? resolve(message.response.data)
              : reject(new Error(message.response?.error));
          });
          port.postMessage({
            requestId,
            type: "lexihalo:subtitle-ai:transcribe",
            engineId,
            audioUrl,
            mimeType: "audio/webm",
            videoId,
            language: "en-US",
            duration: 2500,
          });
        }),
      { engineId, audioUrl: `${localUrl}audio-fixture`, videoId, timeoutMs },
    );
  const transcription = await transcribeAudio();
  if (
    transcription?.cached !== false ||
    transcription?.segments?.length !== 2 ||
    transcription?.segments?.[0]?.text !== "generated from audio" ||
    transcription?.segments?.[0]?.end !== 2500 ||
    transcription?.segments?.[1]?.start !== 2500 ||
    transcription?.segments?.[1]?.end !== 5000
  ) {
    throw new Error(`Audio transcription failed: ${JSON.stringify(transcription)}`);
  }
  const cachedTranscription = await transcribeAudio();
  if (cachedTranscription?.cached !== true || transcriptionRequests.length !== 1) {
    throw new Error("Audio transcription cache failed");
  }
  if (
    !String(transcriptionRequestHeaders[0]?.["content-type"] || "").startsWith(
      "multipart/form-data; boundary=",
    ) ||
    transcriptionRequestHeaders[0]?.authorization ||
    !transcriptionRequests[0]?.includes('name="model"') ||
    !transcriptionRequests[0]?.includes("whisper-1") ||
    !transcriptionRequests[0]?.includes('name="language"') ||
    !transcriptionRequests[0]?.includes('name="prompt"') ||
    !transcriptionRequests[0]?.includes("E2E glossary") ||
    !transcriptionRequests[0]?.includes('name="response_format"') ||
    !transcriptionRequests[0]?.includes("verbose_json") ||
    !transcriptionRequests[0]?.includes('name="temperature"') ||
    !transcriptionRequests[0]?.includes('name="timestamp_granularities[]"') ||
    !transcriptionRequests[0]?.includes("segment")
  ) {
    throw new Error("OpenAI transcription multipart request is incomplete");
  }

  await byok.evaluate(async (endpoint) => {
    const key = "trancy_byok_engines";
    const stored = await chrome.storage.local.get(key);
    stored[key][0].transcriptionEndpoint = endpoint;
    await chrome.storage.local.set({ [key]: stored[key] });
  }, `${localUrl}transcribe-slow`);
  const slowTranscription = await transcribeAudio({
    videoId: "e2e-audio-video-over-30-seconds",
    timeoutMs: 50000,
  });
  if (slowTranscription?.segments?.length !== 2 || transcriptionRequests.length !== 2) {
    throw new Error("Offscreen ASR did not survive a response taking longer than 30 seconds");
  }
  await byok.evaluate(async (endpoint) => {
    const key = "trancy_byok_engines";
    const stored = await chrome.storage.local.get(key);
    stored[key][0].transcriptionEndpoint = endpoint;
    await chrome.storage.local.set({ [key]: stored[key] });
  }, `${localUrl}transcribe`);

  const processSubtitle = () =>
    byok.evaluate(
      ({ engineId }) =>
        new Promise((resolve, reject) => {
          const port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
          const requestId = crypto.randomUUID();
          const timer = setTimeout(() => reject(new Error("subtitle process timeout")), 10000);
          port.onMessage.addListener((message) => {
            if (message?.requestId !== requestId) return;
            clearTimeout(timer);
            port.disconnect();
            message.response?.ok
              ? resolve(message.response.data)
              : reject(new Error(message.response?.error));
          });
          port.postMessage({
            requestId,
            type: "lexihalo:subtitle-ai:process",
            engineId,
            language: "en",
            lines: [{ id: 1, text: "source subtitle" }],
            contextBefore: [],
            contextAfter: [],
            options: { segmentation: true, repair: true },
          });
        }),
      { engineId },
    );
  const repaired = await processSubtitle();
  if (repaired?.segments?.[0]?.text !== "repaired source" || repaired.cached !== false) {
    throw new Error(`Subtitle repair failed: ${JSON.stringify(repaired)}`);
  }
  const repairedCached = await processSubtitle();
  if (repairedCached?.segments?.[0]?.text !== "repaired source" || repairedCached.cached !== true) {
    throw new Error("Subtitle repair cache recovery failed");
  }

  const clearSubtitleCache = (scope) =>
    byok.evaluate(
      ({ scope }) =>
        new Promise((resolve, reject) => {
          const port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
          const requestId = crypto.randomUUID();
          const timer = setTimeout(
            () => reject(new Error(`cache clear timeout: ${scope}`)),
            5000,
          );
          port.onMessage.addListener((message) => {
            if (message?.requestId !== requestId) return;
            clearTimeout(timer);
            port.disconnect();
            message.response?.ok
              ? resolve(message.response.data)
              : reject(new Error(message.response?.error));
          });
          port.postMessage({
            requestId,
            type: "lexihalo:subtitle-ai:clear-cache",
            scope,
          });
        }),
      { scope },
    );

  await clearSubtitleCache("subtitle-refresh");
  const refreshedFromAiCache = await processSubtitle();
  if (refreshedFromAiCache?.cached !== true) {
    throw new Error("Subtitle refresh unexpectedly deleted persistent AI cache");
  }
  await clearSubtitleCache("ai-subtitle");
  const rebuiltAfterDeepClear = await processSubtitle();
  if (rebuiltAfterDeepClear?.cached !== false) {
    throw new Error("Deep AI subtitle cache clear did not force model processing");
  }

  const rules = await context.newPage();
  await rules.goto(`chrome-extension://${extensionId}/site-rules.html`);
  await rules
    .locator('html[data-lexihalo-site-rules-runtime="readable"]')
    .waitFor({ timeout: 15000 });
  await rules.locator("#immersive-new-rule").fill("127.0.0.1");
  await rules.locator("#immersive-add").click();
  await rules.locator(".rule-row code", { hasText: "127.0.0.1" }).waitFor({ timeout: 10000 });
  let savedRules = await rules.evaluate(async () =>
    (await chrome.storage.local.get("lexihalo_site_rules")).lexihalo_site_rules,
  );
  if (savedRules?.immersive?.[0] !== "127.0.0.1") throw new Error("Site-rule add/save failed");
  await rules.reload();
  await rules.locator(".rule-row code", { hasText: "127.0.0.1" }).waitFor({ timeout: 10000 });
  await rules.getByRole("button", { name: /删除规则 127\.0\.0\.1/ }).click();
  await rules.locator(".rule-empty").waitFor({ timeout: 10000 });
  savedRules = await rules.evaluate(async () =>
    (await chrome.storage.local.get("lexihalo_site_rules")).lexihalo_site_rules,
  );
  if (savedRules?.immersive?.length) throw new Error("Site-rule delete failed");
  await rules.locator("#immersive-new-rule").fill("127.0.0.1");
  await rules.locator("#immersive-add").click();
  await rules.locator(".rule-row code", { hasText: "127.0.0.1" }).waitFor({ timeout: 10000 });

  for (const action of [
    { type: "setting/setLanguage", payload: { key: "subtitle", value: "en" } },
    { type: "setting/setLanguage", payload: { key: "translation", value: "zh-CN" } },
    { type: "setTranslatorService", payload: { sentence: publicEngine, fulltext: publicEngine, subtitle: publicEngine } },
    { type: "setFulltextMode", payload: "dual" },
  ]) {
    const dispatched = await requestBackground("dispatch", action);
    if (dispatched?.message !== "ok") throw new Error(`State dispatch failed: ${action.type}`);
  }

  const reader = await context.newPage();
  reader.on("pageerror", (error) =>
    errors.push(`reader:${error.stack || error.message}`),
  );
  await reader.goto(localUrl);
  await reader
    .locator('html[data-lexihalo-reader-runtime="readable"]')
    .waitFor({ timeout: 25000 });
  await reader
    .locator('html[data-lexihalo-language-runtime="readable"]')
    .waitFor({ timeout: 15000 });
  await reader
    .locator('html[data-lexihalo-pos-runtime="readable"]')
    .waitFor({ timeout: 15000 });
  await reader
    .locator('html[data-lexihalo-immersive-always="1"]')
    .waitFor({ timeout: 15000 });
  const translatedNode = reader.locator("font.xt-dual, xt-dual, xt-trans").first();
  await translatedNode.waitFor({ state: "attached", timeout: 30000 });
  if (!(await translatedNode.textContent())?.includes("bundle translation")) {
    throw new Error("Immersive translation did not render translated DOM");
  }
  await reader.bringToFront();
  if (
    !(await reader.locator("main").innerText()).includes(
      "readable bundle regression",
    )
  )
    throw new Error("Reader page content unavailable");

  await reader.evaluate(() =>
    window.postMessage(
      {
        eventName: "trancy:slider-toggle",
        path: "/",
      },
      "*",
    ),
  );
  await reader
    .locator("#lexihalo-global-cache-group")
    .waitFor({ timeout: 10000 });
  await reader
    .getByText("重新载入当前字幕", { exact: true })
    .waitFor({ timeout: 10000 });
  await reader
    .getByText("彻底清除 AI 字幕缓存", { exact: true })
    .waitFor({ timeout: 10000 });
  for (const removedCacheControl of [
    "网页沉浸式翻译缓存",
    "划词与句子翻译缓存",
    "快速翻译缓存",
  ]) {
    if (
      (await reader.getByText(removedCacheControl, { exact: true }).count()) !==
      0
    ) {
      throw new Error(`Obsolete cache control is still visible: ${removedCacheControl}`);
    }
  }

  await translatedNode.evaluate((node) =>
    node.setAttribute("data-language-regression-old", "1"),
  );
  await reader.evaluate(() =>
    window.postMessage(
      {
        eventName: "trancy:slider-toggle",
        path: "/setting/language/translation",
      },
      "*",
    ),
  );
  const japaneseLanguage = reader
    .locator(".item-slider", { hasText: "日本語" })
    .first();
  await japaneseLanguage.waitFor({ state: "visible", timeout: 10000 });
  await japaneseLanguage.click();
  await reader
    .locator('[data-language-regression-old="1"]')
    .waitFor({ state: "detached", timeout: 10000 });
  const languageState = await requestBackground("getState", {});
  if (languageState?.data?.setting?.language?.translation !== "ja") {
    throw new Error("General translation language change was not persisted");
  }
  await reader
    .locator("font.xt-dual, xt-dual, xt-trans")
    .first()
    .waitFor({ state: "attached", timeout: 10000 });

  const genericVideo = await context.newPage();
  genericVideo.on("pageerror", (error) =>
    errors.push(`generic-video:${error.stack || error.message}`),
  );
  await genericVideo.goto(`${localUrl}html5-fixture`);
  await genericVideo
    .locator('html[data-lexihalo-video-runtime="readable"]')
    .waitFor({ timeout: 30000 });
  await genericVideo.locator("#xt-toggle-button .trancy-button-logo").waitFor({
    state: "attached",
    timeout: 15000,
  });
  await genericVideo.waitForFunction(
    () =>
      window.captionProvider?.platform === "html5" &&
      window.captionProvider?.lines?.length >= 3,
    null,
    { timeout: 15000 },
  );
  const genericVideoState = await genericVideo.evaluate(() => {
    const button = document.querySelector("#xt-toggle-button");
    const style = button ? getComputedStyle(button) : null;
    const rect = button?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : null;
    return {
      platform: window.captionProvider?.platform,
      contextPlatform: window.metacontext?.platform,
      lines: window.captionProvider?.lines?.length,
      buttonClass: button?.className,
      pointerEvents: style?.pointerEvents,
      position: style?.position,
      top: style?.top,
      parentIsPlayer: button?.parentElement?.id === "generic-player",
      insideVideo:
        Boolean(rect) &&
        rect.left >= document.querySelector("video").getBoundingClientRect().left &&
        rect.right <= document.querySelector("video").getBoundingClientRect().right &&
        rect.top >= document.querySelector("video").getBoundingClientRect().top &&
        rect.bottom <= document.querySelector("video").getBoundingClientRect().bottom,
      hitIsButton: Boolean(hit?.closest?.("#xt-toggle-button")),
      containerClass: document.querySelector("#generic-player")?.className,
    };
  });
  if (
    genericVideoState.platform !== "html5" ||
    genericVideoState.contextPlatform !== "html5" ||
    genericVideoState.lines < 3 ||
    !genericVideoState.buttonClass?.includes("trancy-html5-button") ||
    genericVideoState.pointerEvents !== "auto" ||
    genericVideoState.position !== "absolute" ||
    !genericVideoState.parentIsPlayer ||
    !genericVideoState.insideVideo ||
    !genericVideoState.hitIsButton ||
    !genericVideoState.containerClass?.includes("lexihalo-html5-container")
  ) {
    throw new Error(`Generic HTML5 video mode failed: ${JSON.stringify(genericVideoState)}`);
  }
  const captionWrap = await genericVideo.evaluate(async () => {
    const player=document.querySelector('#generic-player');
    const root=document.createElement('trancy-caption-window');
    Object.assign(root.style,{position:'absolute',inset:'0',display:'block',width:'640px',height:'360px'});
    root.innerHTML=`<div class="trancy-caption-container" style="position:relative;width:100%;height:100%">
      <div class="trancy-caption"><div class="trancy-caption-content" style="font-size:20px">
        <div class="trancy-caption-primary"><span class="token">${'UnbrokenLongToken'.repeat(28)}</span></div>
        <div class="trancy-caption-secondary">${'这是一条需要在播放器宽度内自动换行的超长中文字幕'.repeat(10)}</div>
      </div></div></div>`;
    player.appendChild(root);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const caption=root.querySelector('.trancy-caption'),content=root.querySelector('.trancy-caption-content');
    const primary=root.querySelector('.trancy-caption-primary'),secondary=root.querySelector('.trancy-caption-secondary');
    const token=root.querySelector('.token'),lineHeight=parseFloat(getComputedStyle(primary).lineHeight);
    const result={captionWidth:caption.getBoundingClientRect().width,contentWidth:content.getBoundingClientRect().width,
      primaryHeight:primary.getBoundingClientRect().height,secondaryHeight:secondary.getBoundingClientRect().height,
      lineHeight,primaryOverflow:primary.scrollWidth-primary.clientWidth,secondaryOverflow:secondary.scrollWidth-secondary.clientWidth,
      tokenWhiteSpace:getComputedStyle(token).whiteSpace,tokenWrap:getComputedStyle(token).overflowWrap};
    root.remove();return result;
  });
  if (captionWrap.captionWidth > 641 || captionWrap.contentWidth > captionWrap.captionWidth ||
      captionWrap.primaryHeight < captionWrap.lineHeight * 1.8 || captionWrap.secondaryHeight < captionWrap.lineHeight * 1.8 ||
      captionWrap.primaryOverflow > 1 || captionWrap.secondaryOverflow > 1 ||
      captionWrap.tokenWhiteSpace !== 'pre-wrap' || captionWrap.tokenWrap !== 'anywhere') {
    throw new Error(`Long captions did not wrap inside the player: ${JSON.stringify(captionWrap)}`);
  }
  await genericVideo.locator("#xt-toggle-button .trancy-button-logo").click();
  const genericTranscriptionRequestsBefore = transcriptionRequests.length;
  await genericVideo
    .locator('#xt-toggle-button [data-lexihalo-audio-transcribe="true"]')
    .click({ timeout: 10000 });
  await genericVideo.waitForFunction(
    () => window.captionProvider?.lines?.[0]?.text === "generated from audio",
    null,
    { timeout: 15000 },
  );
  if (transcriptionRequests.length !== genericTranscriptionRequestsBefore + 1) {
    throw new Error("Generic HTML5 AI caption request was blocked");
  }

  // Reproduce XgPlayer/MSE: DOM is blob-backed, only the network reveals HLS.
  await context.route('https://208.69.102.250:21302/fixture/index.m3u8', route => route.fulfill({
    status: 200, contentType: 'application/vnd.apple.mpegurl',
    headers: { 'access-control-allow-origin': '*' },
    body: '#EXTM3U\n#EXTINF:1,\nhttps://208.69.102.249:11302/fixture/part.ts\n#EXT-X-ENDLIST',
  }));
  await context.route('https://www.kkys02.com/play/capture-fixture.html', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: `<!doctype html><html><body><div id="fixture-player" class="video-js" style="width:640px;height:360px;position:relative">
      <video id="fixture-player_html5_api" controls style="width:640px;height:360px"></video></div>
      <script>
        const v=document.querySelector('video'), wrapper=document.getElementById('fixture-player');
        Object.defineProperty(v,'duration',{value:60});
        window.videojs={getPlayer:()=>({el:()=>wrapper,
          currentSource:()=>({src:'https://media.example.com/direct-fallback.m3u8',type:'application/x-mpegURL'}),
          currentSources:()=>[]})};
        fetch('https://208.69.102.250:21302/fixture/index.m3u8').then(r=>r.text());
      </script></body></html>`,
  }));
  const capturePage = await context.newPage();
  capturePage.on('pageerror', error => errors.push(`capture:${error.message}`));
  await capturePage.goto('https://www.kkys02.com/play/capture-fixture.html');
  await capturePage.locator('#xt-toggle-button .trancy-button-logo').waitFor({ timeout: 15000 });
  await capturePage.waitForFunction(async () => {
    const result = await window.lexihaloGetCapturedSources?.();
    return result?.sources?.some(source => source.captureId && source.ext === 'm3u8');
  }, null, { timeout: 15000 });
  const captured = await capturePage.evaluate(async () => (await window.lexihaloSiteAdapters.prepare()).sources);
  if (!captured.some(source => source.captureId && source.ext === 'm3u8') || !captured.some(source => source.url)) {
    throw new Error('Captured and direct media sources were not attached to the current player');
  }
  await capturePage.evaluate(() => {
    window.confirm=()=>true;
    window.lexihaloTranscribeAudio=async payload=>{
      window.__captureAiPayload=payload;
      return {language:'en',segments:[{start:0,end:1000,text:'captured AI'}]};
    };
  });
  await capturePage.locator('#xt-toggle-button .trancy-button-logo').click();
  await capturePage.locator('[data-lexihalo-audio-transcribe="true"]').click();
  await capturePage.waitForFunction(() => window.__captureAiPayload, null, { timeout: 15000 });
  const captureAiPayload = await capturePage.evaluate(() => window.__captureAiPayload);
  if (!captureAiPayload.useBrowserAudio || !captureAiPayload.browserSource?.captureId) {
    throw new Error(`AI transcription lost the background capture beside a direct source: ${JSON.stringify(captureAiPayload)}`);
  }
  await capturePage.close();

  const platformCatalog = JSON.parse(fs.readFileSync(path.join(root, "config/media-platforms.json"), "utf8"));
  const siteCatalog = platformCatalog.filter(entry => entry.mode === "browser");
  const sitePages = JSON.parse(fs.readFileSync(path.join(root, "tools/fixtures/media-site-pages.json"), "utf8"));
  const testedSites = [];
  for (const site of siteCatalog) {
    const address = sitePages[site.id];
    const mediaHost = site.id === "xiaohongshu" ? "sns-video-fixture.xhscdn.com" : site.mediaHosts[0];
    const mediaUrl = site.id === "channels"
      ? "https://finder.video.qq.com/1/2/stodownload?fixture=1"
      : `https://${mediaHost}/lexihalo-fixture.${site.audio ? "m4a" : "mp4"}`;
    await context.route(mediaUrl, (route) => route.fulfill({
      status: 200, contentType: site.audio ? "audio/mp4" : "video/mp4", body: "fixture media",
    }));
    const attributes = site.id === "xiaohongshu"
      ? 'id="noteContainer" note-id="0123456789abcdef01234567" data-type="video"'
      : 'id="site-player"';
    const tag = site.audio ? "audio" : "video";
    await context.route(address.split("#")[0], (route) => route.fulfill({
      status: 200, contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0;background:#111">
        <section ${attributes} style="position:relative;width:640px;height:360px">
          <${tag} src="${mediaUrl}" controls style="display:block;width:640px;height:${site.audio ? "70" : "360"}px"></${tag}>
        </section>
        <script>
          const m=document.querySelector('${tag}');Object.defineProperty(m,'duration',{value:60});
          const t=m.addTextTrack('subtitles','English','en');t.mode='showing';
          for(let i=0;i<3;i++)t.addCue(new VTTCue(i*2,i*2+1.8,'Site adapter caption '+i));
        </script></body></html>`,
    }));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${site.id}:${error.stack || error.message}`));
    await page.goto(address);
    await page.locator("#xt-toggle-button .trancy-button-logo").waitFor({ timeout: 15000 });
    const info = await page.evaluate(() => ({
      site: window.lexihaloSites.page(location.href)?.id,
      platform: window.captionProvider?.platform,
      mediaTag: window.lexihaloSiteAdapters.pickMedia()?.tagName,
      generatedAudioHosts: document.querySelectorAll('.lexihalo-audio-host').length,
    }));
    if (info.site !== site.id || info.platform !== "html5" || info.mediaTag !== tag.toUpperCase() ||
        (site.audio && info.generatedAudioHosts !== 0)) {
      throw new Error(`Site media adapter failed: ${site.id}: ${JSON.stringify(info)}`);
    }
    await page.evaluate((id) => {
      window.confirm = () => true;
      window.lexihaloTranscribeAudio = async (payload) => {
        window.__siteAsr = payload;
        return { language: 'en', segments: [{ start: 0, end: 1000, text: `fixture-asr-${id}` }] };
      };
      window.lexihaloListVideoFormats = async () => ({ formats: [{
        formatId: 'native-fixture', resolution: 720, height: 720,
        label: '720p', ext: 'mp4', hasAudio: true,
      }] });
      window.lexihaloDownloadVideo = async (payload) => {
        window.__siteDownload = payload;
        return { filename: `fixture-download-${id}.mp4`, directory: 'Downloads/LexiHalo' };
      };
    }, site.id);
    await page.locator("#xt-toggle-button .trancy-button-logo").click();
    await page.locator('[data-lexihalo-audio-transcribe="true"]').click();
    await page.waitForFunction(() => Boolean(window.__siteAsr), null, { timeout: 10000 });
    await page.waitForFunction((id) => window.captionProvider?.lines?.[0]?.text === `fixture-asr-${id}`, site.id, { timeout: 10000 });
    await page.locator("#xt-toggle-button .trancy-button-logo").click();
    await page.locator('[data-lexihalo-video-download="true"]').click();
    await page.locator('.lexihalo-download-format').first().waitFor({ timeout: 10000 });
    await page.locator('.lexihalo-download-format').first().click();
    await page.waitForFunction(() => Boolean(window.__siteDownload), null, { timeout: 10000 });
    const payloads = await page.evaluate(() => ({ asr: window.__siteAsr, download: window.__siteDownload }));
    if (!payloads.asr.mediaPageUrl || !payloads.asr.useNativeHelper || !payloads.asr.useBrowserAudio ||
        !payloads.download.mediaPageUrl || !payloads.download.formatId) {
      throw new Error(`Site ASR/download pipeline failed: ${site.id}: ${JSON.stringify(payloads)}`);
    }
    testedSites.push(site.id);
    await page.close();
  }
  if (testedSites.length !== 19) throw new Error("The 19-site browser matrix is incomplete");

  await context.route('https://soundcloud.com/fixture/no-dom-audio', route => route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><html><body><h1>Audio fixture without a media element</h1></body></html>',
  }));
  const audioToolPage = await context.newPage();
  audioToolPage.on('pageerror', error => errors.push(`audio-tool:${error.message}`));
  await audioToolPage.goto('https://soundcloud.com/fixture/no-dom-audio');
  await audioToolPage.locator('#xt-toggle-button .trancy-button-logo').waitFor({timeout:15000});
  const audioTool = await audioToolPage.evaluate(() => {
    const host=document.querySelector('.lexihalo-audio-tool-host'),audio=host?.querySelector('audio');
    const rect=host?.getBoundingClientRect();
    return {host:!!host,width:rect?.width||0,height:rect?.height||0,text:host?.innerText||'',
      audioDisplay:audio?getComputedStyle(audio).display:null,controls:audio?.controls,
      cards:document.querySelectorAll('.lexihalo-audio-host:not(.lexihalo-audio-tool-host)').length};
  });
  if (!audioTool.host || audioTool.width > 60 || audioTool.height > 60 || audioTool.text ||
      audioTool.audioDisplay !== 'none' || audioTool.controls || audioTool.cards) {
    throw new Error(`Audio-only fallback rendered an intrusive module: ${JSON.stringify(audioTool)}`);
  }
  await audioToolPage.close();

  // X uses absolute placementTracking/videoPlayer layers inside a ratio box.
  // Plugin layout overrides must not collapse them or intercept native controls.
  await context.route('https://x.com/fixture/status/1111111111111111111', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: `<!doctype html><html><head><style>
      .ratio { position:relative;width:640px;padding-top:360px;height:0; }
      .native-placement,.native-player { position:absolute;inset:0; }
      .component { position:relative;width:100%;height:100%; }
      .media-layer { position:absolute;inset:0; }
      video { position:absolute;width:100%;height:100%; }
      #native-play {position:absolute;left:40%;top:40%;width:90px;height:50px;z-index:20;}
    </style></head><body style="margin:0"><div class="ratio">
      <div data-testid="placementTracking" class="native-placement">
        <div data-testid="videoPlayer" class="native-player">
          <div data-testid="videoComponent" class="component"><div class="media-layer">
            <div style="position:relative;width:100%;height:100%"><video src="data:video/mp4;base64,"></video></div>
          </div></div><button id="native-play">Play</button>
        </div>
      </div></div><script>
        const v=document.querySelector('video');Object.defineProperty(v,'duration',{value:60});
        window.nativePlayClicks=0;document.getElementById('native-play').addEventListener('click',()=>window.nativePlayClicks++);
      </script></body></html>`,
  }));
  const xLayoutPage = await context.newPage();
  xLayoutPage.on('pageerror', error => errors.push(`x-layout:${error.message}`));
  await xLayoutPage.goto('https://x.com/fixture/status/1111111111111111111');
  await xLayoutPage.locator('#xt-toggle-button .trancy-button-logo').waitFor({ timeout: 15000 });
  const xNativeLayout = await xLayoutPage.evaluate(() => {
    const v=document.querySelector('video'), player=document.querySelector('[data-testid="videoPlayer"]');
    return { height:v.getBoundingClientRect().height,
      trackingPosition:getComputedStyle(document.querySelector('[data-testid="placementTracking"]')).position,
      playerPosition:getComputedStyle(player).position,
      hostIsPlayer:document.querySelector('#xt-toggle-button')?.parentElement===player,
      isolation:getComputedStyle(player).isolation,
      placeholder:!!document.querySelector('audio[data-lexihalo-placeholder]') };
  });
  if (xNativeLayout.height < 350 || xNativeLayout.trackingPosition !== 'absolute' ||
      xNativeLayout.playerPosition !== 'absolute' || !xNativeLayout.hostIsPlayer ||
      xNativeLayout.isolation !== 'auto' || xNativeLayout.placeholder) {
    throw new Error(`X native layout changed: ${JSON.stringify(xNativeLayout)}`);
  }
  await xLayoutPage.locator('#native-play').click();
  if (await xLayoutPage.evaluate(() => window.nativePlayClicks) !== 1) throw new Error('X native play click was intercepted');
  await xLayoutPage.locator('#xt-toggle-button .trancy-button-logo').click();
  await xLayoutPage.locator('#xt-toggle-button .trancy-panel-menu.visible').waitFor({ timeout: 10000 });
  await xLayoutPage.close();

  for (const wrapperHost of ['hsck123.com', 'wrappers.example.org']) {
  await context.route(`https://${wrapperHost}/detail/fixture.html`, (route) => route.fulfill({
    status: 200, contentType: "text/html",
    body: '<html><body><img id="video_img" src="https://stream.example.com/current.m3u8"><iframe src="/downvideo/videoTest.html" style="width:700px;height:420px"></iframe></body></html>',
  }));
  await context.route("https://stream.example.com/**", (route) => route.fulfill({
    status: 200, contentType: "application/vnd.apple.mpegurl", body: '#EXTM3U\n#EXTINF:1,\npart.ts\n#EXT-X-ENDLIST',
  }));
  await context.route(`https://${wrapperHost}/downvideo/videoTest.html`, (route) => route.fulfill({
    status: 200, contentType: "text/html",
    body: `<!doctype html><html><body><div style="width:640px;height:360px;position:relative">
      <video id="my-video" controls style="width:640px;height:360px"><source id="mp4m3u8" type="application/x-mpegURL"></video>
      </div><script>
        const v=document.querySelector('video');Object.defineProperty(v,'duration',{value:60});
        document.querySelector('source').src=parent.document.getElementById('video_img').src;
        const t=v.addTextTrack('subtitles','English','en');t.mode='showing';
        for(let i=0;i<3;i++)t.addCue(new VTTCue(i*2,i*2+1.8,'Wrapper caption '+i));
      </script></body></html>`,
  }));
  const wrapperPage = await context.newPage();
  wrapperPage.on("pageerror", (error) => errors.push(`wrapper:${error.message}`));
  await wrapperPage.goto(`https://${wrapperHost}/detail/fixture.html`);
  const wrapperFrame = wrapperPage.frameLocator('iframe');
  await wrapperFrame.locator('#xt-toggle-button .trancy-button-logo').waitFor({ timeout: 15000 });
  const playerFrame = wrapperPage.frames().find(frame => frame.url().endsWith('/downvideo/videoTest.html'));
  const runtimeOwners = {
    top: await wrapperPage.evaluate(() => ({
      buttons:document.querySelectorAll('#xt-toggle-button').length,
      proxies:document.querySelectorAll('.lexihalo-media-proxy-host').length,
      loadingTips:Array.from(document.querySelectorAll('*')).filter(node => /字幕加载中/.test(node.textContent || '') && !Array.from(node.children).some(child => /字幕加载中/.test(child.textContent || ''))).length,
    })),
    frame: await playerFrame.evaluate(() => ({ buttons:document.querySelectorAll('#xt-toggle-button').length })),
  };
  if (runtimeOwners.top.buttons !== 0 || runtimeOwners.top.proxies !== 0 || runtimeOwners.top.loadingTips !== 0 || runtimeOwners.frame.buttons !== 1) {
    throw new Error(`Ordinary iframe must have exactly one child runtime owner: ${JSON.stringify(runtimeOwners)}`);
  }
  const wrapperSource = await playerFrame.evaluate(() => window.lexihaloSiteAdapters.snapshot().sources[0]);
  if (wrapperSource?.url !== 'https://stream.example.com/current.m3u8' || wrapperSource.ext !== 'm3u8') {
    throw new Error(`Wrapper real-source detection failed: ${JSON.stringify(wrapperSource)}`);
  }
  await playerFrame.evaluate(() => {
    window.lexihaloTranscribeAudio = async payload => {
      window.__wrapperAsr = payload;
      return { language: 'en', segments: [{ start: 0, end: 1000, text: 'wrapper-asr' }] };
    };
  });
  await wrapperFrame.locator('#xt-toggle-button .trancy-button-logo').click();
  wrapperPage.once('dialog', dialog => dialog.accept());
  await wrapperFrame.locator('[data-lexihalo-audio-transcribe="true"]').click();
  await playerFrame.waitForFunction(() => window.__wrapperAsr?.useBrowserAudio === true, null, { timeout: 10000 });
  await wrapperPage.close();
  }

  await context.route("https://www.pornhub.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0;background:#111">
        <div id="mgp" class="mgp_container" style="position:relative;width:640px;height:360px">
          <div class="mgp_videoWrapper" style="position:absolute;inset:0;z-index:1">
            <video class="mgp_videoElement" src="data:video/mp4;base64," style="width:100%;height:100%"></video>
          </div>
          <div class="mgp_eventCatcher" style="position:absolute;inset:0;z-index:10;pointer-events:auto"></div>
          <div class="mgp_controls" style="position:absolute;inset:0;z-index:20;pointer-events:none">
            <div class="mgp_controlBar" style="position:absolute;left:0;right:0;bottom:0;height:48px;pointer-events:auto">
              <div class="mgp_front" style="height:48px;display:flex;align-items:center;justify-content:flex-end;pointer-events:auto">
                <div class="mgp_fullscreen" style="width:42px;height:48px;pointer-events:auto"></div>
              </div>
            </div>
          </div>
        </div>
        <script>const v=document.querySelector('video');Object.defineProperty(v,'duration',{value:60});</script>
      </body></html>`,
    }),
  );
  const pornhubVideo = await context.newPage();
  pornhubVideo.on("pageerror", (error) =>
    errors.push(`pornhub-video:${error.stack || error.message}`),
  );
  await pornhubVideo.goto(
    "https://www.pornhub.com/view_video.php?viewkey=ph123fixture",
  );
  await pornhubVideo
    .locator("#xt-toggle-button.trancy-pornhub-control .trancy-button-logo")
    .waitFor({ timeout: 15000 });
  const pornhubButtonState = await pornhubVideo.evaluate(() => {
    const button = document.querySelector("#xt-toggle-button");
    const rect = button?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : null;
    return {
      parentClass: button?.parentElement?.className,
      beforeFullscreen:
        button?.nextElementSibling?.classList.contains("mgp_fullscreen") || false,
      pointerEvents: button ? getComputedStyle(button).pointerEvents : "",
      hitIsButton: Boolean(hit?.closest?.("#xt-toggle-button")),
    };
  });
  if (
    !String(pornhubButtonState.parentClass).includes("mgp_front") ||
    !pornhubButtonState.beforeFullscreen ||
    pornhubButtonState.pointerEvents !== "auto" ||
    !pornhubButtonState.hitIsButton
  ) {
    throw new Error(
      `Pornhub player adapter failed: ${JSON.stringify(pornhubButtonState)}`,
    );
  }
  await pornhubVideo
    .locator("#xt-toggle-button.trancy-pornhub-control .trancy-button-logo")
    .click();
  await pornhubVideo
    .locator("#xt-toggle-button .trancy-panel-menu.visible")
    .waitFor({ timeout: 10000 });
  await pornhubVideo.evaluate(() => {
    window.lexihaloTranscribeAudio = async (payload) => {
      window.__pornhubTranscriptionPayload = payload;
      return {
        language: "en",
        segments: [{ start: 0, end: 1000, text: "native helper fixture" }],
      };
    };
  });
  pornhubVideo.once("dialog", (dialog) => dialog.accept());
  await pornhubVideo
    .locator('[data-lexihalo-audio-transcribe="true"]')
    .click();
  await pornhubVideo.waitForFunction(
    () => window.__pornhubTranscriptionPayload?.useNativeHelper === true &&
      window.__pornhubTranscriptionPayload?.useBrowserAudio === true,
    null,
    { timeout: 10000 },
  );
  const pornhubTranscriptionPayload = await pornhubVideo.evaluate(
    () => window.__pornhubTranscriptionPayload,
  );
  if (
    pornhubTranscriptionPayload.mediaPageUrl !==
    "https://www.pornhub.com/view_video.php?viewkey=ph123fixture"
  ) {
    throw new Error(
      `Pornhub did not prefer native helper: ${JSON.stringify(pornhubTranscriptionPayload)}`,
    );
  }
  await pornhubVideo.evaluate(() => {
    window.lexihaloListVideoFormats = async () => {
      window.__pornhubNativeFormatFallback = true;
      return { formats: [{ formatId:'native-720',height:720,resolution:720,label:'720p',ext:'mp4' }] };
    };
    window.lexihaloDownloadVideo = payload => new Promise((_resolve,reject) => {
      window.__pendingDownloadRequest = payload.requestId;
      window.__rejectPendingDownload = reject;
    });
    window.lexihaloCancelVideoDownload = async requestId => {
      window.__cancelledDownloadRequest = requestId;
      window.__rejectPendingDownload?.(new Error('已取消视频下载'));
      return {cancelled:true};
    };
  });
  if (!(await pornhubVideo.locator('#xt-toggle-button .trancy-panel-menu').evaluate(element => element.classList.contains('visible')))) {
    await pornhubVideo.locator('#xt-toggle-button .trancy-button-logo').click();
  }
  await pornhubVideo.locator('[data-lexihalo-video-download="true"]').click();
  await pornhubVideo.locator('.lexihalo-download-format').waitFor({ timeout: 10000 });
  if (!(await pornhubVideo.evaluate(() => window.__pornhubNativeFormatFallback === true))) {
    throw new Error('Pornhub yt-dlp format fallback was incorrectly removed');
  }
  pornhubVideo.once('dialog', dialog => dialog.accept());
  await pornhubVideo.locator('.lexihalo-download-format').first().click();
  const cancelButton = pornhubVideo.locator('.lexihalo-download-cancel');
  await cancelButton.waitFor({state:'visible',timeout:10000});
  const cancelContrast = await cancelButton.evaluate(element => {
    const style=getComputedStyle(element);
    const rgb=value=>(value.match(/\d+/g)||[]).slice(0,3).map(Number);
    const luminance=values=>{
      const linear=values.map(value=>{const x=value/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});
      return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
    };
    let parent=element.parentElement,effectiveBackground='rgb(0, 0, 0)';
    while(parent){const value=getComputedStyle(parent).backgroundColor;if(value!=='transparent'&&!/rgba\([^)]*,\s*0\s*\)$/.test(value)){effectiveBackground=value;break}parent=parent.parentElement}
    const foreground=luminance(rgb(style.color)),background=luminance(rgb(effectiveBackground));
    return {color:style.color,background:style.backgroundColor,effectiveBackground,
      borderWidth:style.borderTopWidth,fontWeight:Number(style.fontWeight),
      ratio:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)};
  });
  if (cancelContrast.ratio < 4.5 || cancelContrast.fontWeight < 600 ||
      cancelContrast.color !== 'rgb(255, 180, 171)' || cancelContrast.background !== 'rgba(0, 0, 0, 0)' ||
      cancelContrast.borderWidth !== '0px') {
    throw new Error(`Download cancel contrast is not stable: ${JSON.stringify(cancelContrast)}`);
  }
  await cancelButton.click();
  await pornhubVideo.waitForFunction(() => window.__pendingDownloadRequest &&
    window.__cancelledDownloadRequest === window.__pendingDownloadRequest, null, {timeout:10000});

  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body><div id="movie_player" class="html5-video-player"><video src="data:video/mp4;base64,"></video><button class="ytp-subtitles-button" aria-pressed="true"></button><button class="ytp-fullscreen-button"></button></div><script>const p=document.getElementById('movie_player');const v=p.querySelector('video');Object.defineProperty(v,'duration',{value:60});p.getPlayerState=()=>1;p.getPlayerResponse=()=>({videoDetails:{videoId:'abcdefghijk',title:'Readable Test',lengthSeconds:'60'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'${localUrl}caption',languageCode:'en',vssId:'.en',name:{simpleText:'English'}}]}}});p.getVolume=()=>100;p.setVolume=()=>{};p.play=()=>{};p.pause=()=>{};p.toggleSubtitlesCalls=[];p.toggleSubtitles=(enabled)=>{p.toggleSubtitlesCalls.push(enabled);p.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed',String(enabled));};</script></body></html>`,
    }),
  );
  const video = await context.newPage();
  video.on("pageerror", (error) =>
    errors.push(`video:${error.stack || error.message}`),
  );
  await video.goto("https://www.youtube.com/watch?v=abcdefghijk");
  await video
    .locator('html[data-lexihalo-video-runtime="readable"]')
    .waitFor({ timeout: 30000 });
  await video
    .locator("#xt-toggle-button")
    .waitFor({ state: "attached", timeout: 30000 });
  await video.locator("#xt-toggle-button .trancy-button-logo").click();
  await video
    .locator("#xt-toggle-button .trancy-panel-menu.visible")
    .waitFor({ timeout: 10000 });
  const primaryDownloadCount = await video
    .locator("#xt-toggle-button .trancy-primary-panel-menu")
    .getByText("下载完整双语字幕 (.srt)", { exact: true })
    .count();
  if (primaryDownloadCount !== 0) {
    throw new Error("Bilingual download must not appear beside More Features");
  }
  await video
    .locator("#xt-toggle-button .trancy-primary-panel-menu")
    .getByText("下载视频（多清晰度）", { exact: true })
    .waitFor({ timeout: 10000 });
  await video
    .locator("#xt-toggle-button .trancy-primary-panel-menu")
    .getByText("更多功能", { exact: true })
    .evaluate((label) => label.parentElement?.click());
  await video
    .locator("#xt-toggle-button .trancy-second-panel-menu")
    .getByText("下载完整双语字幕 (.srt)", { exact: true })
    .waitFor({ timeout: 10000 });
  const language = await video.evaluate(() => ({
    detected: window.detectLanguage(
      "This is a sufficiently long English sentence.",
    )?.[0]?.lang,
    lemma: window.posTagger
      .tagSentence("The cats are running quickly.")
      .find((token) => token.value === "cats")?.lemma,
    korean: window.romanize.ko("한국"),
    chinese: window.romanize.zh("你好"),
    captionProvider: Boolean(window.captionProvider),
    aiScheduler: window.captionProvider?.lexihaloAiScheduler,
  }));
  if (
    language.detected !== "en" ||
    language.lemma !== "cat" ||
    !language.korean ||
    !language.chinese ||
    !language.captionProvider ||
    language.aiScheduler?.maxConcurrent !== 2 ||
    language.aiScheduler?.stableBatch !== 6 ||
    language.aiScheduler?.retryDelayMs !== 2000 ||
    language.aiScheduler?.seekSettleMs !== 0 ||
    language.aiScheduler?.baselineFallbackForPreload !== true
  )
    throw new Error(`Language/video regression: ${JSON.stringify(language)}`);

  const youtubeBaselineFallback = await video.evaluate(() => {
    const provider = window.captionProvider;
    const originalCache = provider.captionCache.get(provider.id);
    const originalEngine = provider.engine;
    const originalBackfill = provider.backfillBaseline;
    const originalLastPretransCurrent = provider.lastPretransCurrent;
    let calls = 0;
    provider.captionCache.set(provider.id, {
      ...(originalCache || {}),
      lines: [],
      builtinLines: [],
    });
    provider.engine = {
      _id: "byok-baseline-regression",
      model: "regression-model",
      provider: "OpenAI",
    };
    provider.backfillBaseline = () => {
      calls += 1;
    };
    provider.lastPretransCurrent = provider.current;
    provider.drivePretranslate();
    provider.backfillBaseline = originalBackfill;
    provider.engine = originalEngine;
    provider.lastPretransCurrent = originalLastPretransCurrent;
    if (originalCache) provider.captionCache.set(provider.id, originalCache);
    else provider.captionCache.clear();
    return {
      calls,
      platform: provider.platform,
      hasExternalCorpus: provider.hasExternalCorpus,
    };
  });
  if (
    youtubeBaselineFallback.platform !== "youtube" ||
    youtubeBaselineFallback.hasExternalCorpus ||
    youtubeBaselineFallback.calls !== 1
  ) {
    throw new Error(
      `YouTube baseline fallback did not match streaming platforms: ${JSON.stringify(youtubeBaselineFallback)}`,
    );
  }

  const nativeCaptionSuppression = await video.evaluate(async () => {
    const provider = window.captionProvider;
    const player = document.querySelector(".html5-video-player");
    const button = player.querySelector(".ytp-subtitles-button");

    provider.restore();
    button.setAttribute("aria-pressed", "true");
    player.toggleSubtitlesCalls.length = 0;
    provider.suppressNativeCaptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const disabledWhileLexiHaloIsActive =
      button.getAttribute("aria-pressed") === "false";
    provider.restore();
    const restoredWhenLexiHaloStops =
      button.getAttribute("aria-pressed") === "true";
    const enabledCycleCalls = [...player.toggleSubtitlesCalls];

    button.setAttribute("aria-pressed", "false");
    player.toggleSubtitlesCalls.length = 0;
    provider.suppressNativeCaptions();
    provider.restore();
    const stayedDisabledWhenOriginallyDisabled =
      button.getAttribute("aria-pressed") === "false";
    const disabledCycleCalls = [...player.toggleSubtitlesCalls];

    return {
      disabledWhileLexiHaloIsActive,
      restoredWhenLexiHaloStops,
      stayedDisabledWhenOriginallyDisabled,
      enabledCycleCalls,
      disabledCycleCalls,
    };
  });
  if (
    !nativeCaptionSuppression.disabledWhileLexiHaloIsActive ||
    !nativeCaptionSuppression.restoredWhenLexiHaloStops ||
    !nativeCaptionSuppression.stayedDisabledWhenOriginallyDisabled ||
    nativeCaptionSuppression.enabledCycleCalls[0] !== false ||
    nativeCaptionSuppression.enabledCycleCalls.at(-1) !== true ||
    nativeCaptionSuppression.disabledCycleCalls.includes(true)
  ) {
    throw new Error(
      `YouTube native caption suppression failed: ${JSON.stringify(nativeCaptionSuppression)}`,
    );
  }

  const chineseVariantTest = await video.evaluate(() => {
    const provider = window.captionProvider;
    const originalCache = provider.captionCache.get(provider.id);
    const originalTarget = provider.to;
    const originalLearningLanguage = provider.learningLang;
    const check = (text, target) => {
      const lines = Array.from({ length: 4 }, (_, index) => ({
        idx: 200 + index,
        start: index * 1000,
        end: (index + 1) * 1000,
        text,
        originalText: text,
      }));
      provider.captionCache.set(provider.id, {
        ...(originalCache || {}),
        lines,
        builtinLines: lines,
      });
      provider.langVoteCache.clear();
      provider.to = target;
      const detected = provider.corpusLang();
      const same = provider.syncCorpusSameLang();
      provider.learningLang = "zh-CN";
      provider.evalLookupAllowed();
      return {
        detected,
        same,
        marked: provider.lines.every((line) => line.sameLangTo === target),
        lookupAllowed: provider.isLookupAllowed,
      };
    };
    const simplifiedToTraditional = check(
      "这个视频讲述软件开发与学习",
      "zh-Hant",
    );
    const traditionalToTraditional = check(
      "這個影片講述軟體開發與學習",
      "zh-Hant",
    );
    const traditionalToSimplified = check(
      "這個影片講述軟體開發與學習",
      "zh-CN",
    );
    if (originalCache) provider.captionCache.set(provider.id, originalCache);
    else provider.captionCache.clear();
    provider.langVoteCache.clear();
    provider.to = originalTarget;
    provider.learningLang = originalLearningLanguage;
    return {
      simplifiedToTraditional,
      traditionalToTraditional,
      traditionalToSimplified,
    };
  });
  if (
    chineseVariantTest.simplifiedToTraditional.detected !== "zh-CN" ||
    chineseVariantTest.simplifiedToTraditional.same ||
    chineseVariantTest.simplifiedToTraditional.marked ||
    chineseVariantTest.traditionalToTraditional.detected !== "zh-Hant" ||
    !chineseVariantTest.traditionalToTraditional.same ||
    !chineseVariantTest.traditionalToTraditional.marked ||
    !chineseVariantTest.traditionalToTraditional.lookupAllowed ||
    chineseVariantTest.traditionalToSimplified.detected !== "zh-Hant" ||
    chineseVariantTest.traditionalToSimplified.same ||
    chineseVariantTest.traditionalToSimplified.marked
  ) {
    throw new Error(
      `Chinese subtitle variant detection failed: ${JSON.stringify(chineseVariantTest)}`,
    );
  }

  const languageReset = await video.evaluate(() => {
    const provider = window.captionProvider;
    const beforeGeneration = provider.translationGeneration;
    const translatedLine = {
      idx: 98,
      start: 0,
      end: 1000,
      text: "repaired source",
      originalText: "raw source",
      translation: "旧译文",
      AITranslation: "旧 AI 译文",
      translateEngine: "old-engine",
      message: "old error",
      sameLangTo: "zh-CN",
    };
    const cache = provider.captionCache.get(provider.id) || {};
    provider.captionCache.set(provider.id, {
      ...cache,
      lines: [translatedLine],
      builtinLines: [translatedLine],
    });
    provider.pretransFailedAt = Date.now();
    provider.baselineFailedAt = Date.now();
    provider.tokenizeFailedAt = Date.now();
    let reloads = 0;
    const onReload = () => {
      reloads += 1;
    };
    provider.event.on("caption:reload", onReload);
    provider.resetForLanguageChange();
    provider.event.off("caption:reload", onReload);
    const resetLine = provider.lines[0];
    return {
      generationAdvanced:
        provider.translationGeneration === beforeGeneration + 1,
      sourceRestored: resetLine?.text === "raw source",
      translationCleared:
        !resetLine?.translation &&
        !resetLine?.AITranslation &&
        !resetLine?.translateEngine &&
        !resetLine?.message &&
        !resetLine?.sameLangTo,
      failuresCleared:
        provider.pretransFailedAt === 0 &&
        provider.baselineFailedAt === 0 &&
        provider.tokenizeFailedAt === 0,
      reloads,
    };
  });
  if (
    !languageReset.generationAdvanced ||
    !languageReset.sourceRestored ||
    !languageReset.translationCleared ||
    !languageReset.failuresCleared ||
    languageReset.reloads !== 0
  ) {
    throw new Error(
      `Caption language reset failed: ${JSON.stringify(languageReset)}`,
    );
  }

  const seekScheduler = await video.evaluate(() => {
    const provider = window.captionProvider;
    const before = provider.translationGeneration;
    provider.aiInflightByGeneration.set(before, 2);
    provider.aiInflightRequests = 2;
    provider.lastPretransCurrent = provider.current + 5000;
    provider.drivePretranslate();
    return {
      before,
      after: provider.translationGeneration,
      currentInflight: provider.aiInflightRequests,
      oldInflight: provider.aiInflightByGeneration.get(before),
    };
  });
  if (
    seekScheduler.after !== seekScheduler.before + 1 ||
    seekScheduler.currentInflight !== 0 ||
    seekScheduler.oldInflight !== 2
  ) {
    throw new Error(
      `AI seek generation isolation failed: ${JSON.stringify(seekScheduler)}`,
    );
  }

  const retainTest = await video.evaluate(() => {
    const provider = window.captionProvider;
    const testLines = [{ idx: 99, start: 0, end: 1000, text: "repaired by ai", originalText: "raw", AITranslation: "已翻译", translation: "已翻译" }];
    const cache = provider.captionCache.get(provider.id) || {};
    provider.captionCache.set(provider.id, { ...cache, lines: testLines, builtinLines: testLines });
    // Simulate seeking
    provider.lastPretransCurrent = provider.current + 5000;
    provider.drivePretranslate();
    const after = provider.lines.find((l) => l.idx === 99);
    return {
      hasAiTranslation: after?.AITranslation === "已翻译",
      text: after?.text,
    };
  });
  if (!retainTest.hasAiTranslation || retainTest.text !== "repaired by ai") {
    throw new Error(`Seek reverted already translated lines: ${JSON.stringify(retainTest)}`);
  }

  const backwardSeekTest = await video.evaluate(async () => {
    const provider = window.captionProvider;
    // Simulate line in flight that gets superseded by backward seek
    const initialLine = { idx: 101, start: 50000, end: 53000, text: "going back", originalText: "going back" };
    const cache = provider.captionCache.get(provider.id) || {};
    provider.captionCache.set(provider.id, { ...cache, lines: [initialLine], builtinLines: [initialLine] });
    provider.current = 50000;
    provider.lastPretransCurrent = 50000;

    // Backward seek from 50000 to 5000
    provider.current = 5000;
    provider.drivePretranslate();

    // Verify seek reset pretransFailedAt and did not poison lines
    const currentLine = provider.lines.find((l) => l.idx === 101);
    return {
      generation: provider.translationGeneration,
      pretransFailedAt: provider.pretransFailedAt,
      hasErrorMessage: Boolean(currentLine?.message),
      hasFailedText: currentLine?.AITranslation?.includes("AI 翻译失败") || currentLine?.translation?.includes("AI 翻译失败"),
      retryCount: provider.aiRetryCounts.get(101) || 0,
    };
  });
  if (
    backwardSeekTest.pretransFailedAt !== 0 ||
    backwardSeekTest.hasErrorMessage ||
    backwardSeekTest.hasFailedText ||
    backwardSeekTest.retryCount !== 0
  ) {
    throw new Error(`Backward seek sanity failed: ${JSON.stringify(backwardSeekTest)}`);
  }

  const bilingualDownloadTest = await video.evaluate(async () => {
    const provider = window.captionProvider;
    // Set 2 lines, 1 translated, 1 untranslated.
    const twoLines = [
      {
        idx: 1,
        start: 0,
        end: 2000,
        text: "AI repaired Hello",
        originalText: "Raw Hello",
        AITranslation: "你好",
      },
      {
        idx: 2,
        start: 2000,
        end: 4000,
        text: "AI repaired World",
        originalText: "Raw World",
        AITranslation: undefined,
        translation: undefined,
      },
    ];
    const cache = provider.captionCache.get(provider.id) || {};
    provider.captionCache.set(provider.id, { ...cache, lines: twoLines, builtinLines: twoLines });
    const statusIncomplete = provider.getTranslationStatus();

    let incompleteBlocked = false;
    try {
      provider.downloadBilingualSrt("test");
    } catch (e) {
      incompleteBlocked = true;
    }

    // Now complete the second line and capture the generated SRT.
    const completedLines = twoLines.map((line, index) => ({
      ...line,
      AITranslation: index === 0 ? "你好" : "世界",
    }));
    provider.captionCache.set(provider.id, { ...cache, lines: completedLines, builtinLines: completedLines });
    const statusComplete = provider.getTranslationStatus();
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    let downloadedBlob;
    URL.createObjectURL = (blob) => {
      downloadedBlob = blob;
      return originalCreateObjectURL(blob);
    };
    let completeAllowed = false;
    try {
      provider.downloadBilingualSrt("test");
      completeAllowed = true;
    } catch (e) {
      completeAllowed = false;
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
    const downloadedText = downloadedBlob ? await downloadedBlob.text() : "";

    return {
      incompleteStatus: statusIncomplete,
      incompleteBlocked,
      completeStatus: statusComplete,
      completeAllowed,
      exportedRepairedSource:
        downloadedText.includes("AI repaired Hello") &&
        downloadedText.includes("AI repaired World"),
      exportedRawSource:
        downloadedText.includes("Raw Hello") || downloadedText.includes("Raw World"),
    };
  });

  if (
    !bilingualDownloadTest.incompleteBlocked ||
    bilingualDownloadTest.incompleteStatus.isAllDone ||
    !bilingualDownloadTest.completeAllowed ||
    !bilingualDownloadTest.completeStatus.isAllDone ||
    !bilingualDownloadTest.exportedRepairedSource ||
    bilingualDownloadTest.exportedRawSource
  ) {
    throw new Error(`Bilingual download gating test failed: ${JSON.stringify(bilingualDownloadTest)}`);
  }

  const mixedLanguageTest = await video.evaluate(() => {
    const provider=window.captionProvider,target='zh-CN';
    const originalCache=provider.captionCache.get(provider.id),originalTo=provider.to;
    const originalWhisper=provider.endableWhisper;
    const texts=[
      '这是完整的中文字幕内容',
      'This is English with 中文 words mixed in',
      'Hello 世界 hello 世界',
      '这是一段包含 OpenAI 名称但主体仍然是中文的字幕内容',
      '今日は good weather です',
    ];
    const decisions=texts.map(text=>provider.lineSameLanguage(text,target));
    provider.to=target;provider.endableWhisper=false;
    provider.captionCache.set(provider.id,{...(originalCache||{}),builtinLines:texts.map((text,idx)=>({idx,text,start:idx*1000,end:idx*1000+900}))});
    const allSame=provider.syncCorpusSameLang();
    provider.evalSameLanguage();
    const tagged=provider.lines.map(line=>line.sameLangTo===target);
    const aggregate=provider.isSameLanguage;
    provider.captionCache.set(provider.id,originalCache||{});provider.to=originalTo;provider.endableWhisper=originalWhisper;
    return {decisions,tagged,allSame,aggregate,
      englishDominant:provider.lineSameLanguage('This is English with 中文 words mixed in','en')};
  });
  if (JSON.stringify(mixedLanguageTest.decisions)!==JSON.stringify([true,false,false,true,false]) ||
      JSON.stringify(mixedLanguageTest.tagged)!==JSON.stringify([true,false,false,true,false]) ||
      mixedLanguageTest.allSame || mixedLanguageTest.aggregate || !mixedLanguageTest.englishDominant) {
    throw new Error(`Mixed-language same-language detection failed: ${JSON.stringify(mixedLanguageTest)}`);
  }

  await video.evaluate(() => {
    window.__youtubeGenericPrepareCalls = 0;
    window.lexihaloSiteAdapters.prepare = async () => {
      window.__youtubeGenericPrepareCalls++;
      return { sources: [{ captureId:'wrong-page-sound',ext:'mp3',isAudio:true,size:7000 }] };
    };
    window.lexihaloSiteAdapters.snapshot = () => ({
      page:{id:'generic'},media:document.querySelector('video'),sources:[
        { captureId:'wrong-page-sound',ext:'mp3',isAudio:true,size:7000 },
      ],
    });
    window.lexihaloTranscribeAudio = async payload => {
      window.__youtubeAudioPayload = payload;
      return { language:'en',segments:[{start:0,end:1000,text:'youtube native audio'}] };
    };
    window.confirm = () => true;
  });
  await video.locator('#movie_player').scrollIntoViewIfNeeded();
  const youtubeMenu = video.locator('#xt-toggle-button .trancy-panel-menu');
  if (!(await youtubeMenu.evaluate(element => element.classList.contains('visible')))) {
    await video.locator('#xt-toggle-button .trancy-button-logo').click();
  }
  const youtubeBack = video.locator('#xt-toggle-button .btn-back-panel:visible');
  if (await youtubeBack.count()) await youtubeBack.last().click();
  const youtubeAudioButton = video.locator('[data-lexihalo-audio-transcribe="true"]');
  await youtubeAudioButton.evaluate(element => {
    const root=element.closest('#xt-toggle-button');
    document.body.appendChild(root);
    Object.assign(root.style, {position:'fixed',top:'80px',left:'80px',display:'block',zIndex:'2147483647'});
    root.querySelector('.trancy-panel-menu')?.classList.add('visible');
    const primary=root.querySelector('.trancy-primary-panel-menu');
    if(primary) Object.assign(primary.style,{transform:'none',position:'relative',left:'0'});
    Object.assign(element.style, {position:'relative',display:'flex',transform:'none'});
  });
  await youtubeAudioButton.click();
  await video.waitForFunction(() => window.__youtubeAudioPayload, null, {timeout:10000});
  const youtubeAudioRoute = await video.evaluate(() => ({
    payload:window.__youtubeAudioPayload,prepareCalls:window.__youtubeGenericPrepareCalls,
  }));
  if (!youtubeAudioRoute.payload.useNativeHelper || youtubeAudioRoute.payload.useBrowserAudio ||
      youtubeAudioRoute.payload.browserSource || youtubeAudioRoute.prepareCalls !== 0) {
    throw new Error(`YouTube consumed a generic captured page sound: ${JSON.stringify(youtubeAudioRoute)}`);
  }
  await video.evaluate(() => {
    window.lexihaloListVideoFormats=async()=>({formats:[{formatId:'yt-audio',resolution:0,height:0,isAudio:true,label:'音频',ext:'m4a'}]});
  });
  if (!(await youtubeMenu.evaluate(element => element.classList.contains('visible')))) {
    await video.locator('#xt-toggle-button .trancy-button-logo').click();
  }
  await video.locator('[data-lexihalo-video-download="true"]').click();
  await video.locator('.lexihalo-download-format').waitFor({timeout:10000});
  if (await video.evaluate(() => window.__youtubeGenericPrepareCalls !== 0)) {
    throw new Error('YouTube download consumed generic captured page sounds');
  }

  const severe = errors.filter(
    (value) =>
      !/NotSupportedError|Failed to load resource: net::ERR_FAILED|ResizeObserver loop/i.test(
        value,
      ),
  );
  if (severe.length) throw new Error(severe.join("\n"));
  const reportsDir = path.join(root, "artifacts", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, "browser-regression.json"),
    JSON.stringify(
      {
        status: "passed",
        surfaces: [
          "background",
          "popup",
          "options",
          "reader",
          "video",
          "language",
          "translation",
          "cache",
          "site-rules",
        ],
        siteAdapterFixtures: testedSites,
        siteAdapterExecution: { asr: "mock", download: "mock", liveAccounts: false },
        errors: [],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Readable single-bundle Chromium regression passed.");
} finally {
  await context?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
