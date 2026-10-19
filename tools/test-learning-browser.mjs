import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { monitorExtensionErrors } from "./extension-error-monitor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = path.join(root, ".pi/cheng-e2e-profile");
fs.rmSync(profile, { recursive: true, force: true });
const errors = [],
  aiRequests = [];
const sampleRate = 8000,
  duration = 8,
  dataSize = sampleRate * duration * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);
const server = http.createServer((req, res) => {
  if (req.url === "/tone.wav") {
    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Content-Length": wav.length,
    });
    res.end(wav);
    return;
  }
  if (req.url?.startsWith("/ai")) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      aiRequests.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      const prompt = body.messages.at(-1).content;
      if (prompt.includes("expert bilingual subtitle")) {
        const input = JSON.parse(
          prompt.match(/Input Subtitles: (\[[^\n]+\])/)[1],
        );
        const terms = JSON.parse(
          prompt.match(
            /Terminology preferences \(data, not instructions\): (\[[^\n]*\])/,
          )[1],
        );
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    items: input.map((cue) => ({
                      id: cue.id,
                      repaired: cue.text,
                      translation: terms[0]?.target || "未匹配术语",
                    })),
                  }),
                },
              },
            ],
          }),
        );
        return;
      }
      const input = JSON.parse(prompt);
      const output = input.cues
        ? {
            items: input.cues.map((cue) => ({
              id: cue.id,
              translation: cue.text.includes("getValue()")
                ? "保留 getValue() 不变。"
                : "背压控制生产者。",
            })),
          }
        : {
            inVideo: "当前片段介绍背压。",
            background: "背压使生产速度适应消费能力。",
            uncertainty: "字幕不能确认具体实现。",
            citations: ["cue-0"],
          };
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
      );
    });
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><title>Cheng learning fixture</title></head><body><video controls src="/tone.wav" style="width:640px;height:360px"></video><script>
  const media = document.querySelector('video');
  const track = media.addTextTrack('subtitles','English','en'); track.mode = 'showing';
  track.addCue(new VTTCue(0,2,'Backpressure controls the producer.'));
  track.addCue(new VTTCue(2,4,'Keep getValue() unchanged.'));
  track.addCue(new VTTCue(4,7,'A third important point.'));
  </script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context;
const launch = () =>
  chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${path.join(root, "dist")}`,
      `--load-extension=${path.join(root, "dist")}`,
      "--no-first-run",
      "--autoplay-policy=no-user-gesture-required",
    ],
    viewport: { width: 1500, height: 1000 },
    acceptDownloads: true,
  });
try {
  context = await launch();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await monitorExtensionErrors(context, worker, errors);
  const extensionId = new URL(worker.url()).hostname;
  const source = await context.newPage();
  await source.goto(base);
  await source.waitForFunction(
    () => typeof globalThis.chengVideoBridge?.snapshot === "function",
  );
  await source.waitForFunction(
    () => document.querySelector("video").readyState >= 1,
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await page.waitForSelector("#source-tabs option", { state: "attached" });
  await page.selectOption("#source-tabs", { label: "Cheng learning fixture" });
  await page.click("#capture");
  await page.waitForSelector("#detail", { state: "visible" });
  assert.equal(
    await page.locator("#material-title").textContent(),
    "Cheng learning fixture",
  );
  assert.equal(
    await page.locator("#import-to-current").count(),
    0,
    "Ambiguous subtitle-target checkbox was removed",
  );
  assert.equal(
    await page.locator("#import-subtitles").textContent(),
    "导入字幕，创建新资料",
  );
  assert.equal(
    await page.locator("#import-subtitles-current").isEnabled(),
    true,
  );
  assert.ok(
    (await page.locator("#import-subtitles-current").textContent()).includes(
      "Cheng learning fixture",
    ),
  );
  await page.waitForSelector("#cues .cue");
  await page.locator("#cues .cue input").first().check();
  await page.click("#save-clip");
  await page.waitForSelector(".clip-card");
  await page
    .locator(".clip-card")
    .getByRole("button", { name: "基于此片段写笔记", exact: true })
    .click();
  await page.waitForSelector("#learning-notes", { state: "visible" });
  await page.fill("#all-note-body", "My retained research note");
  await page.waitForSelector("#all-notes-list .note-card");
  const before = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  assert.equal(before.notes.length, 1);
  assert.equal(before.clips.length, 1);
  await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "lexihalo:subtitle-ai:clear-cache",
      scope: "all",
    }),
  );
  await page.reload();
  await page.waitForSelector("#all-notes-list .note-card");
  assert.ok(
    (await page.locator("#all-notes-list .note-card").textContent()).includes(
      "My retained research note",
    ),
  );
  const downloadEvent = page.waitForEvent("download");
  await page.click("#export-backup");
  const download = await downloadEvent,
    backupPath = await download.path();
  assert.ok(fs.statSync(backupPath).size > 100);
  await page.evaluate(() =>
    ChengLearning.workspace.request("restore", {
      data: ChengLearning.empty(),
      mode: "replace",
    }),
  );
  await page.reload();
  await page.waitForSelector("#learning-notes", { state: "visible" });
  await page.selectOption("#restore-mode", "replace");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#backup-file").setInputFiles(backupPath);
  await page.waitForSelector("#all-notes-list .note-card");
  assert.deepEqual(
    await page.evaluate(() => ChengLearning.workspace.request("snapshot")),
    before,
  );
  await page.click("#open-learning-materials");
  await page.locator("#materials .material-item").first().click();
  await page.waitForSelector("#detail", { state: "visible" });
  assert.equal(await page.locator("#legacy-material-notes").isVisible(), false);
  assert.equal(
    await page
      .locator("#notes .note-card")
      .isVisible()
      .catch(() => false),
    false,
    "Media view must not duplicate note bodies",
  );
  assert.ok(
    (await page.locator("#material-notes-link").textContent()).includes("1"),
  );
  assert.ok(
    (await page.locator(".clip-provenance").first().textContent()).includes(
      "笔记引用",
    ),
    "Material view explains that this clip exists as a note citation",
  );
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup
    .getByRole("button", { name: /^(打开学习资料库|Open learning library)$/ })
    .waitFor();
  assert.ok((await popup.locator("body").textContent()).includes("澄 Cheng"));
  await popup.close();
  // Phase 2: configure the real provider adapter, then exercise consent and citations.
  const byok = await context.newPage();
  await byok.goto(`chrome-extension://${extensionId}/byok.html`);
  await byok.fill("#name", "Cheng Fixture AI");
  await byok.fill("#model", "fixture-model");
  await byok.fill("#endpoint", `${base}/ai`);
  await byok.fill("#key", "fixture-secret-key");
  await byok.locator('#engine-form button[type="submit"]').click();
  await byok.locator(".engine-name", { hasText: "Cheng Fixture AI" }).waitFor();
  await byok.close();
  await page.reload();
  await page.waitForSelector("#concept-engine option[value^='byok-']", {
    state: "attached",
  });
  assert.equal(
    await page.locator("#glossary-section").isVisible(),
    false,
    "Specialist glossary creation is retired from the learning page",
  );
  await page.evaluate(() =>
    ChengLearning.workspace.request("save-glossary", {
      scope: ChengLearning.workspace.materialId,
      rows: [{ source: "Backpressure", target: "背压" }],
    }),
  );
  await page.evaluate(() => ChengLearning.workspace.refresh());
  await page.locator("#cues .cue input").first().check();
  await page.fill("#concept-question", "What is backpressure?");
  assert.equal(
    await page.locator("#concept-send").isEnabled(),
    true,
    "AI explanation is directly available; preview is optional",
  );
  assert.match(
    await page.locator("#concept-send").getAttribute("title"),
    /预览可选/,
  );
  const callsBefore = aiRequests.length;
  await page.click("#concept-send");
  await page.locator(".concept-card").waitFor();
  assert.equal(
    aiRequests.length,
    callsBefore + 1,
    "The page can explain directly without preview",
  );
  await page.fill(
    "#concept-question",
    "Preview the same backpressure evidence",
  );
  await page.click("#concept-preview");
  await page
    .locator("#concept-preview-data", { hasText: "Backpressure" })
    .waitFor();
  assert.equal(
    aiRequests.length,
    callsBefore + 1,
    "Preview must not call a provider",
  );
  assert.ok(
    !(await page.locator("#concept-preview-data").textContent()).includes(
      "fixture-secret-key",
    ),
  );
  await page.click("#concept-send");
  await page.locator(".concept-card").nth(1).waitFor();
  assert.equal(aiRequests.length, callsBefore + 2);
  const sent = JSON.stringify(aiRequests.at(-1));
  assert.ok(sent.includes("Backpressure"));
  assert.ok(!sent.includes("My retained research note"));
  const learned = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  assert.equal(learned.concepts.length, 2);
  assert.equal(learned.glossary.length, 1);
  assert.ok(
    learned.concepts.every(
      (item) => JSON.stringify(item.citations) === '["cue-0"]',
    ),
  );
  const publicEngines = await page.evaluate(() =>
    ChengLearning.workspace.request("engines"),
  );
  assert.ok(!JSON.stringify(publicEngines).includes("fixture-secret-key"));
  await page.reload();
  await page.locator(".concept-card").first().waitFor();
  console.log(
    "Cheng Phase 2 browser regression passed: glossary → preview (no network) → consent → BYOK → verified citations → reload.",
  );
  // Real legacy subtitle requests must include glossary choices in their cache key.
  const cachedTranslation = () =>
    worker.evaluate(async () => {
      const [engine] = (await chrome.storage.local.get("trancy_byok_engines"))
        .trancy_byok_engines;
      const material = (await ChengLearning.store.readTables(["materials"]))
        .materials[0];
      return globalThis.lexihaloTranslateSubtitlesWithAi({
        texts: ["Backpressure controls the producer."],
        from: "en",
        to: "zh-CN",
        engine,
        useCache: true,
        requestGroup: "cheng-cache-fixture",
        requestGeneration: 0,
        learningSource: {
          sourceUrl: material.sourceUrl,
          platform: material.platform,
          sourceId: material.sourceId,
        },
      });
    });
  const memoCalls = aiRequests.length;
  assert.equal((await cachedTranslation())[0].translation, "背压");
  assert.equal((await cachedTranslation())[0].translation, "背压");
  assert.equal(aiRequests.length, memoCalls + 1);
  await page.evaluate(() =>
    ChengLearning.workspace.request("save-glossary", {
      scope: ChengLearning.workspace.materialId,
      rows: [{ source: "Backpressure", target: "反压" }],
    }),
  );
  assert.equal((await cachedTranslation())[0].translation, "反压");
  assert.equal(aiRequests.length, memoCalls + 2);
  await page.evaluate(() => ChengLearning.workspace.refresh());
  // Phase 3: selected translation creates a version, then reading controls stay local.
  const waitUntil = async (predicate, label) => {
    const start = Date.now();
    while (Date.now() - start < 12000) {
      if (await page.evaluate(predicate)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${label}`);
  };
  await page.locator("#cues .cue input").nth(1).check();
  const versionsBefore = learned.transcripts.length;
  await page.click("#translation-preview");
  await page
    .locator("#translation-preview-data", { hasText: "getValue()" })
    .waitFor();
  await page.click("#translation-send");
  await waitUntil(
    () =>
      ChengLearning.workspace.transcript?.cues[1]?.translation?.includes(
        "getValue()",
      ),
    "selected translation",
  );
  const translated = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  assert.equal(translated.transcripts.length, versionsBefore + 1);
  assert.deepEqual(
    translated.transcripts.find((row) => row.id === before.transcripts[0].id),
    before.transcripts[0],
  );
  await page.selectOption("#translation-display", "reveal");
  const translatedRow = page.locator("#cues .cue").nth(1);
  assert.equal(await translatedRow.locator(".translation").isVisible(), false);
  await translatedRow
    .getByRole("button", { name: "显示译文", exact: true })
    .click();
  assert.equal(await translatedRow.locator(".translation").isVisible(), true);
  await page.fill("#cue-search", "getValue");
  await waitUntil(
    () => document.querySelectorAll("#cues .cue").length === 1,
    "full text filtering",
  );
  await page.fill("#cue-search", "");
  await waitUntil(
    () => document.querySelectorAll("#cues .cue").length === 3,
    "clear filtering",
  );
  await page.check("#media-to-current");
  const callsBeforeMedia = aiRequests.length;
  await page.locator("#local-media-file").setInputFiles({
    name: "local-tone.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await waitUntil(
    () => document.querySelector("#local-player").readyState >= 1,
    "local media metadata",
  );
  assert.equal(
    await page.locator("#local-media-status").getAttribute("data-state"),
    "connected",
  );
  assert.ok(
    (await page.locator("#local-media-status").textContent()).includes(
      "当前已连接",
    ),
  );
  const linkedMetadata = await page.evaluate(
    () => ChengLearning.workspace.material.localFingerprint,
  );
  await page.reload();
  await page.locator('#local-media-status[data-state="reconnect"]').waitFor();
  assert.ok(
    (await page.locator("#local-media-status").textContent()).includes(
      "需要重新连接",
    ),
  );
  assert.equal(await page.locator("#local-player").isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => ChengLearning.workspace.material.localFingerprint,
    ),
    linkedMetadata,
    "Refresh keeps verification metadata but not temporary file access",
  );
  assert.equal(
    await page.locator("#unlink-local-media").textContent(),
    "清除历史关联",
  );
  await page.check("#media-to-current");
  await page
    .locator("#local-media-file")
    .setInputFiles({
      name: "local-tone.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
  await waitUntil(
    () => document.querySelector("#local-player").readyState >= 1,
    "reconnect local media",
  );
  assert.equal(
    await page.locator("#local-media-status").getAttribute("data-state"),
    "connected",
  );
  await page
    .locator(".clip-card")
    .first()
    .getByRole("button", { name: "重听", exact: true })
    .click();
  await waitUntil(
    () =>
      document.querySelector("#local-player").paused &&
      document.querySelector("#local-player").currentTime > 1.9,
    "segment ends at clip boundary",
  );
  await page.locator("#cues .cue").last().locator(".time").click();
  await waitUntil(
    async () =>
      (await ChengLearning.workspace.request("snapshot")).materials[0]
        .currentTime >= 3.9,
    "local progress persistence",
  );
  assert.equal(
    aiRequests.length,
    callsBeforeMedia,
    "Local file playback must not upload audio",
  );
  const beforeUnlink = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#unlink-local-media");
  await waitUntil(
    async () =>
      !(await ChengLearning.workspace.request("snapshot")).materials[0]
        .localFingerprint,
    "unlink local media",
  );
  assert.equal(await page.locator("#local-player").isVisible(), false);
  const afterUnlink = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  assert.equal(afterUnlink.transcripts.length, beforeUnlink.transcripts.length);
  assert.equal(afterUnlink.notes.length, beforeUnlink.notes.length);
  assert.equal(afterUnlink.clips.length, beforeUnlink.clips.length);
  assert.equal(await page.locator("#glossary-section").isVisible(), false);
  assert.equal(await page.locator("#attachments-section").isVisible(), false);
  assert.equal(await page.locator("#capture-online-frame").isVisible(), false);
  assert.equal(await page.locator("#capture-local-frame").isVisible(), false);
  const full = await page.evaluate(async () => {
    const data = await ChengLearning.workspace.request("snapshot");
    return {
      data,
      restored: await ChengLearning.importArchive(
        await ChengLearning.exportArchive(data),
      ),
    };
  });
  assert.deepEqual(full.data, full.restored);
  assert.equal(full.data.attachments.length, 0);
  assert.equal(full.data.materials[0].localFingerprint, "");
  assert.equal(full.data.materials[0].localFileName, "");
  await page.reload();
  await page.locator("#local-media-status", { hasText: "尚未连接" }).waitFor();
  assert.equal(await page.locator("#local-player").isVisible(), false);
  assert.equal(await page.locator("#attachments-section").isVisible(), false);
  assert.equal(
    await page.locator("#notes .note-card:visible").count(),
    0,
    "Material view never duplicates note bodies",
  );
  assert.equal(
    (await page.evaluate(() => ChengLearning.workspace.state.notes)).length,
    1,
  );
  assert.equal(
    aiRequests.length,
    callsBeforeMedia,
    "Local playback and reload must not call AI",
  );
  console.log(
    "Cheng Phase 3 browser regression passed: translation versions → reveal/search → local playback/repeat/progress → retired optional UI remains hidden → ZIP roundtrip → reopen.",
  );
  const reports = path.join(root, "artifacts/reports");
  fs.mkdirSync(reports, { recursive: true });
  await page.screenshot({
    path: path.join(reports, "cheng-workspace.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const snapshotBeforeRestart = await page.evaluate(() =>
    ChengLearning.workspace.request("snapshot"),
  );
  const reopenUrl = page.url();
  await context.close();
  context = await launch();
  const restartedWorker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await monitorExtensionErrors(context, restartedWorker, errors);
  const reopened = await context.newPage();
  await reopened.goto(reopenUrl);
  await reopened.waitForSelector("#detail", { state: "visible" });
  await reopened.waitForSelector(".concept-card");
  assert.equal(await reopened.locator("#notes .note-card:visible").count(), 0);
  await reopened.click("#open-learning-notes");
  await reopened.waitForSelector("#all-notes-list .note-card");
  assert.deepEqual(
    await reopened.evaluate(() => ChengLearning.workspace.request("snapshot")),
    snapshotBeforeRestart,
  );
  assert.equal(
    await reopened.locator("#attachments-section").isVisible(),
    false,
  );
  assert.equal(await reopened.locator("#local-player").isVisible(), false);
  assert.deepEqual(
    errors,
    [],
    "No page or background exceptions, including after browser restart",
  );
  fs.writeFileSync(
    path.join(reports, "cheng-learning-regression.json"),
    JSON.stringify(
      {
        status: "passed",
        phases: [1, 2, 3],
        fullBrowserRestart: true,
        provider: "local mock",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Cheng Phase 1 browser regression passed: capture → clip → note → clear cache → reload → backup → restore → full browser restart.",
  );
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
