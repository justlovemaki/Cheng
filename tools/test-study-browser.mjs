import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import { monitorExtensionErrors } from "./extension-error-monitor.mjs";
import { attachExtensionPanel } from "./extension-panel.mjs";
const root = process.cwd(),
  profile = path.join(root, ".pi/study-browser-profile");
fs.rmSync(profile, { recursive: true, force: true });
const errors = [],
  requests = [];
const wav = Buffer.alloc(44 + 8000 * 12 * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const server = http.createServer((req, res) => {
  if (req.url?.endsWith(".wav")) {
    const range = String(req.headers.range || "").match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0,
      end =
        range && range[2]
          ? Math.min(Number(range[2]), wav.length - 1)
          : wav.length - 1;
    res.writeHead(range ? 206 : 200, {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
      ...(range
        ? { "content-range": `bytes ${start}-${end}/${wav.length}` }
        : {}),
    });
    res.end(wav.subarray(start, end + 1));
    return;
  }
  if (req.url === "/ai") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks));
      requests.push(body);
      const data = JSON.parse(body.messages.at(-1).content),
        selected = data.context.find((cue) =>
          data.selectedCueIds.includes(cue.id),
        );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  inVideo: `解释：${selected.text}`,
                  background: "这是一条额外背景，不是原讲者的结论。",
                  uncertainty: "字幕不能确认完整实验细节。",
                  citations: [selected.id],
                }),
              },
            },
          ],
        }),
      );
    });
    return;
  }
  if (req.url?.startsWith("/article")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html><head><title>Article reading</title></head><body><h1 id="section">Reading methods</h1><p id="passage">Methods require original evidence, not just a summary.</p><input id="password" type="password" value="DO-NOT-CAPTURE-PASSWORD"><textarea>DO-NOT-CAPTURE-FORM</textarea></body></html>',
    );
    return;
  }
  const second = req.url?.includes("second");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><head><title>${second ? "Second video" : "First lecture"}</title></head><body><video controls preload="auto" src="/${second ? "second" : "first"}.wav" style="width:640px;height:360px"></video></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context, diagnosticPanel;
const fixture = async (page, url) => {
  await page.goto(url);
  await page.waitForFunction(
    () =>
      !!globalThis.chengVideoBridge &&
      document.querySelector("video").readyState >= 1,
  );
  await page.evaluate(() => {
    const video = document.querySelector("video");
    video.pause();
    video.currentTime = 0.5;
    window.studyCues = [
      {
        start: 0,
        end: 2000,
        text: "Backpressure controls the producer.",
        translation: "背压控制生产者。",
      },
      {
        start: 2000,
        end: 4000,
        text: "Keep getValue() unchanged.",
        AITranslation: "保留 getValue() 不变。",
      },
      {
        start: 4000,
        end: 7000,
        text: "A third important point.",
        translation: "第三个重要知识点。",
      },
    ];
    window.captionProvider = {
      video,
      platform: "html5",
      id: "fixture",
      from: "en",
      lines: window.studyCues,
      event: {
        emit: (type) => {
          window.studyCaptionEnable = type;
        },
      },
    };
  });
};
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${path.join(root, "dist")}`,
      `--load-extension=${path.join(root, "dist")}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  await context.route("https://cheng-study.example/**", async (route) => {
    const response = await route.fetch({
      url: base + new URL(route.request().url()).pathname,
    });
    await route.fulfill({ response });
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await monitorExtensionErrors(context, worker, errors);
  const id = new URL(worker.url()).hostname;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/byok.html`);
  await options.fill("#name", "Study mock");
  await options.fill("#model", "study-model");
  await options.fill("#endpoint", `${base}/ai`);
  await options.fill("#key", "study-test-key");
  await options.locator("#engine-form button[type=submit]").click();
  await options.locator(".engine-name", { hasText: "Study mock" }).waitFor();
  await options.close();
  const source = await context.newPage();
  await fixture(source, "https://cheng-study.example/first");
  const count = context.pages().length;
  await source.locator(".rd-float-btn [data-cheng-workspace]").click();
  let panel = (diagnosticPanel = await attachExtensionPanel(
    context,
    `chrome-extension://${id}/study.html`,
    errors,
  ));
  await panel.waitFor(
    () =>
      globalThis.ChengLearning?.studyPanel?.current?.available &&
      document.querySelector(".cue.active .translation")?.textContent ===
        "背压控制生产者。",
    undefined,
    "initial real-time bilingual subtitle",
  );
  assert.equal(
    context.pages().length,
    count,
    "Native study must not replace or navigate the video tab",
  );
  assert.equal(
    await panel.evaluate(
      () =>
        document.querySelector("#source-tabs") === null &&
        document.querySelector("#capture") === null,
    ),
    true,
  );
  assert.equal(
    (await panel.evaluate(() => ChengLearning.store.snapshot())).materials
      .length,
    0,
    "Live following is read-only until the learner takes action",
  );
  assert.equal(
    requests.length,
    0,
    "Opening/following subtitles must not call AI",
  );
  await source.evaluate(() => {
    document.querySelector("video").currentTime = 2.5;
  });
  await panel.waitFor(
    () =>
      document
        .querySelector(".cue.active .original")
        ?.textContent.includes("getValue()"),
    undefined,
    "seek/highlight synchronization",
  );
  await source.evaluate(() => {
    window.studyCues[1].AITranslation = "更新后的实时译文 getValue()";
  });
  await panel.waitFor(
    () =>
      document
        .querySelector(".cue.active .translation")
        ?.textContent.includes("更新后的实时译文"),
    undefined,
    "late translation updates",
  );
  await source.evaluate(() => {
    document.querySelector("video").currentTime = 0.5;
  });
  await panel.waitFor(
    () => document.querySelector(".cue.active")?.dataset.start === "0",
  );
  await panel.evaluate(() =>
    document.querySelector('.cue[data-start="2"] .original').click(),
  );
  await source.waitForFunction(
    () => document.querySelector("video").currentTime >= 2,
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelectorAll(".cue-select:checked").length,
    ),
    0,
    "Clicking subtitle text seeks; only the checkbox selects",
  );
  await panel.evaluate(() =>
    document.querySelector('.cue[data-start="0"] .time').click(),
  );
  await source.waitForFunction(
    () => document.querySelector("video").currentTime < 1,
  );
  await panel.waitFor(
    () => document.querySelector(".cue.active")?.dataset.start === "0",
  );
  await panel.evaluate(() => document.querySelector("#repeat").click());
  await source.waitForFunction(
    () => {
      const media = document.querySelector("video");
      return media.paused && media.currentTime >= 1.9;
    },
    {},
    { timeout: 12000 },
  );
  await source.evaluate(() => {
    document.querySelector("video").currentTime = 0.5;
  });
  await panel.waitFor(
    () => document.querySelector(".cue.active")?.dataset.start === "0",
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelector("#note-section h2").textContent,
    ),
    "学习笔记",
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#note").disabled),
    false,
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#note-context").hidden),
    true,
    "Sources are optional, not automatically attached",
  );
  await panel.evaluate(() => {
    const input = document.querySelector("#note");
    input.value = "PRIVATE LOCAL STUDY NOTE";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return (
      state.notes.length === 1 &&
      state.notes[0].body === "PRIVATE LOCAL STUDY NOTE"
    );
  });
  let independent = await panel.evaluate(() => ChengLearning.store.snapshot());
  assert.equal(independent.materials.length, 0);
  assert.equal(independent.clips.length, 0);
  assert.equal(independent.notes[0].materialId, "");
  const comparisonHeight = await panel.evaluate(
    () => document.querySelector(".subtitles").getBoundingClientRect().height,
  );
  await panel.evaluate(() =>
    document.querySelector('.cue[data-start="0"] .cue-select').click(),
  );
  await panel.waitFor(
    () =>
      !document.querySelector("#caption-selection").hidden &&
      document
        .querySelector("#selection-summary")
        .textContent.includes("已选 1 句"),
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelector(".subtitles").getBoundingClientRect().height,
    ),
    comparisonHeight,
    "Selecting subtitles must not change the comparison height",
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#explain").disabled),
    false,
    "Selecting a subtitle directly enables AI explanation",
  );
  await panel.evaluate(() => document.querySelector("#selection-note").click());
  await panel.waitFor(() => !!ChengLearning.studyPanel.draft.materialId);
  assert.equal(
    await panel.evaluate(() => document.querySelector("#note").value),
    "PRIVATE LOCAL STUDY NOTE",
    "Associating a video must not replace the independent note text",
  );
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#note-target-label").textContent,
      )
    ).includes("First lecture"),
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#remember").disabled),
    true,
  );
  await panel.evaluate(() => {
    const input = document.querySelector("#note");
    input.value = "PRIVATE LOCAL STUDY NOTE UPDATED";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return state.notes.length === 1 && state.notes[0].body.endsWith("UPDATED");
  });
  assert.equal(requests.length, 0, "Notes are local, not AI requests");
  await panel.waitFor(() => !document.querySelector("#note-library").hidden);
  const materialsEvent = context.waitForEvent("page");
  await panel.evaluate(() => document.querySelector("#library").click());
  const materialsPage = await materialsEvent;
  await materialsPage.waitForURL(/workspace\.html\?view=materials&material=/);
  await materialsPage.locator("#detail").waitFor({ state: "visible" });
  assert.equal(
    await materialsPage.locator("#learning-notes").isVisible(),
    false,
    "The side-panel library link always opens Materials, even when notes exist",
  );
  await materialsPage.close();
  await source.bringToFront();
  await panel.waitFor(
    () => ChengLearning.studyPanel.current?.title === "First lecture",
  );
  const libraryEvent = context.waitForEvent("page");
  await panel.evaluate(() => document.querySelector("#note-library").click());
  const libraryPage = await libraryEvent;
  await libraryPage.locator(".note-card[data-note-target]").waitFor();
  assert.ok(
    (
      await libraryPage.locator(".note-card[data-note-target]").textContent()
    ).includes("PRIVATE LOCAL STUDY NOTE UPDATED"),
    "The saved-note link must locate the actual note",
  );
  await libraryPage.close();
  await source.bringToFront();
  await panel.waitFor(
    () =>
      ChengLearning.studyPanel.current?.title === "First lecture" &&
      document.querySelector('.cue[data-start="2"] .cue-select'),
  );
  await panel.evaluate(() =>
    document.querySelector('.cue[data-start="2"] .cue-select').click(),
  );
  await panel.waitFor(() =>
    document
      .querySelector("#selection-summary")
      .textContent.includes("已选 2 句"),
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-ai-toggle").click(),
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#selection-ai").open),
    true,
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelector(".subtitles").getBoundingClientRect().height,
    ),
    comparisonHeight,
    "Opening AI actions overlays the comparison instead of adding height",
  );
  await panel.evaluate(() => {
    const input = document.querySelector("#question");
    input.value = "这里的背压是什么意思？";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#explain").click();
  });
  await panel.waitFor(
    () => !document.querySelector("#answer").hidden,
    undefined,
    "single-click explanation",
  );
  assert.equal(requests.length, 1);
  assert.equal(
    JSON.parse(requests[0].messages.at(-1).content).selectedCueIds.length,
    2,
    "AI explains exactly the subtitles selected in the real-time comparison",
  );
  assert.ok(!JSON.stringify(requests).includes("PRIVATE LOCAL STUDY NOTE"));
  assert.ok(!JSON.stringify(requests).includes("study-test-key"));
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#answer-anchor").textContent,
      )
    ).includes("Backpressure"),
  );
  const closeGeometry = await panel.evaluate(() => {
    const drawer = document.querySelector("#selection-ai"),
      button = document.querySelector("#selection-ai-close");
    drawer.scrollTop = drawer.scrollHeight;
    const outer = drawer.getBoundingClientRect(),
      close = button.getBoundingClientRect();
    return {
      visible:
        getComputedStyle(button).visibility === "visible" &&
        close.top >= outer.top &&
        close.bottom <= outer.bottom,
      top: close.top,
      outerTop: outer.top,
    };
  });
  assert.equal(
    closeGeometry.visible,
    true,
    "Close stays visible after scrolling a long AI result",
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-ai-close").click(),
  );
  await panel.waitFor(() => !document.querySelector("#selection-ai").open);
  await panel.evaluate(() => {
    const toggle = document.querySelector("#selection-ai-toggle");
    toggle.click();
    toggle.click();
  });
  assert.equal(
    await panel.evaluate(() => document.querySelector("#selection-ai").open),
    false,
    "Clicking AI explanation again closes the dialog",
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-ai-toggle").click(),
  );
  await panel.evaluate(() => {
    document.querySelector("#preview").open = true;
  });
  await panel.waitFor(
    () => document.querySelector("#explain").textContent.includes("预览中的"),
    undefined,
    "optional frozen preview",
  );
  assert.equal(requests.length, 1, "Preview must not call a model");
  await panel.evaluate(() =>
    document.querySelector("#selection-ai-close").click(),
  );
  await panel.waitFor(() => !document.querySelector("#selection-ai").open);
  assert.equal(
    await panel.evaluate(
      () =>
        getComputedStyle(document.querySelector("#cues")).display === "none",
    ),
    false,
    "Closing AI after expanding its preview must restore real-time subtitles",
  );
  assert.ok(
    await panel.evaluate(
      () => document.querySelectorAll("#cues .cue").length > 0,
    ),
  );
  await panel.evaluate(() => {
    document.querySelector("#selection-ai-toggle").click();
    document.querySelector("#preview").open = true;
  });
  await panel.waitFor(() =>
    document.querySelector("#explain").textContent.includes("预览中的"),
  );
  await source.evaluate(() => {
    document.querySelector("video").currentTime = 2.5;
  });
  await panel.waitFor(
    () => document.querySelector(".cue.active")?.dataset.start === "2",
  );
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#note-anchor").textContent,
      )
    ).includes("Backpressure"),
    "The note keeps its original subtitle while playback follows a later sentence",
  );
  assert.ok(
    (
      await panel.evaluate(() =>
        [...document.querySelectorAll(".cue.selected .original")]
          .map((node) => node.textContent)
          .join("\n"),
      )
    ).includes("Backpressure"),
    "Selected evidence stays explicit while playback moves",
  );
  await panel.evaluate(() => document.querySelector("#explain").click());
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return state.concepts.length === 2;
  });
  assert.equal(requests.length, 2);
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#answer-anchor").textContent,
      )
    ).includes("Backpressure"),
    "Preview explanation must remain bound to its original subtitle, not the later playhead",
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-ai-close").click(),
  );
  await source.evaluate(() => {
    for (let start = 7; start < 12; start++)
      window.studyCues.push({
        start: start * 1000,
        end: (start + 1) * 1000,
        text: `Later subtitle ${start}`,
        translation: `后续字幕 ${start}`,
      });
    document.querySelector("video").currentTime = 11.2;
  });
  await panel.waitFor(
    () =>
      document.querySelector(".cue.active")?.dataset.start === "11" &&
      !document.querySelector('.cue[data-start="0"]'),
  );
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#selection-summary").textContent,
      )
    ).includes("已选 2 句"),
    "Selections remain after their rows roll out of the live window",
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelectorAll(".cue.selected").length,
    ),
    0,
    "Old selected rows may be outside the current window without being lost",
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-summary").click(),
  );
  await panel.waitFor(
    () => !document.querySelector("#selection-review").hidden,
  );
  const reviewed = await panel.evaluate(
    () => document.querySelector("#selection-review-list").textContent,
  );
  assert.ok(
    reviewed.includes("Backpressure") && reviewed.includes("getValue()"),
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelector(".subtitles").getBoundingClientRect().height,
    ),
    comparisonHeight,
    "Reviewing off-screen selections uses an overlay and does not add height",
  );
  await panel.evaluate(() =>
    document.querySelector("#selection-review-list .remove").click(),
  );
  await panel.waitFor(() =>
    document
      .querySelector("#selection-summary")
      .textContent.includes("已选 1 句"),
  );
  assert.equal(
    await panel.evaluate(() => {
      const tools = document.querySelector(".study-tools");
      tools.scrollTop = tools.scrollHeight;
      const box = document.querySelector(".subtitles").getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    }),
    true,
    "Live comparison must stay visible while scrolling notes and explanations",
  );
  await panel.evaluate(() => {
    document.querySelector(".study-tools").scrollTop = 0;
  });
  fs.mkdirSync(path.join(root, "artifacts/reports"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts/reports/study-panel.png"),
    Buffer.from(await panel.screenshot(), "base64"),
  );
  const firstState = await panel.evaluate(() => ChengLearning.store.snapshot());
  assert.equal(firstState.materials.length, 1);
  assert.equal(firstState.clips.length, 1);
  assert.equal(
    firstState.clips[0].purpose,
    "note",
    "Subtitle sources created by notes are labelled as note references",
  );
  assert.equal(firstState.notes.length, 1);
  const second = await context.newPage();
  await fixture(second, "https://cheng-study.example/second");
  await second.bringToFront();
  await panel.waitFor(
    () =>
      ChengLearning.studyPanel.current?.title === "Second video" &&
      ChengLearning.studyPanel.current?.cues.some((cue) => cue.active) &&
      document.querySelector("#caption-selection").hidden,
    undefined,
    "automatic tab/video following",
  );
  assert.ok(
    (
      await panel.evaluate(
        () => document.querySelector("#note-target-label").textContent,
      )
    ).includes("First lecture"),
    "Navigation must not rebind an existing note",
  );
  await panel.evaluate(() => document.querySelector("#note-new").click());
  await panel.waitFor(
    () =>
      document.querySelector("#note").value === "" &&
      document.querySelector("#note-context").hidden,
  );
  await panel.evaluate(() => {
    const input = document.querySelector("#note");
    input.value = "Second video note";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return (
      state.notes.length === 2 &&
      state.notes.some(
        (note) => note.body === "Second video note" && !note.materialId,
      )
    );
  });
  await panel.evaluate(() => {
    document.querySelector(".cue.active .cue-select").click();
    document.querySelector("#selection-note").click();
  });
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return (
      state.materials.length === 2 &&
      state.notes.find((note) => note.body === "Second video note")?.materialId
    );
  });
  const state = await panel.evaluate(() => ChengLearning.store.snapshot());
  assert.notEqual(state.notes[0].materialId, state.notes[1].materialId);
  const article = await context.newPage();
  await article.goto(
    "https://cheng-study.example/article?page=2&token=secret#section",
  );
  await article.bringToFront();
  await panel.waitFor(
    () => ChengLearning.studyPanel.current?.title === "Article reading",
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector(".subtitles").hidden),
    false,
    "Video comparison and AI explanation remain visible; non-video pages show why they are unavailable",
  );
  assert.ok(
    (
      await panel.evaluate(() => document.querySelector("#cues").textContent)
    ).includes("当前网页"),
  );
  assert.equal(
    await panel.evaluate(
      () =>
        document.querySelector("#repeat").disabled &&
        document.querySelector("#follow").disabled &&
        document.querySelector("#explain").disabled,
    ),
    true,
  );
  assert.equal(
    await panel.evaluate(
      () => document.querySelector("#caption-selection").hidden,
    ),
    true,
    "AI explanation is an action on selected subtitles, not a standalone module",
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("#note").disabled),
    false,
  );
  await panel.evaluate(() => document.querySelector("#note-new").click());
  await panel.waitFor(() => document.querySelector("#note").value === "");
  await panel.evaluate(() => {
    const input = document.querySelector("#note");
    input.value = "Article personal note";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel.waitFor(async () => {
    const state = await ChengLearning.store.snapshot();
    return state.notes.some(
      (note) =>
        note.body === "Article personal note" &&
        !note.materialId &&
        !note.source,
    );
  });
  await article.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#passage"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await panel.evaluate(() => {
    document.querySelector("#note-sources").open = true;
    document.querySelector("#note-page").click();
  });
  await panel.waitFor(() =>
    ChengLearning.studyPanel.draft.source?.quote?.includes("original evidence"),
  );
  let articleNote = (
    await panel.evaluate(() => ChengLearning.store.snapshot())
  ).notes.find((note) => note.body === "Article personal note");
  assert.equal(articleNote.materialId, "");
  assert.equal(
    articleNote.source.url,
    "https://cheng-study.example/article?page=2#section",
  );
  await panel.evaluate(() => {
    document.querySelector("#note-sources").open = true;
    document.querySelector("#note-detach").click();
  });
  await panel.waitFor(() => !ChengLearning.studyPanel.draft.source);
  assert.equal(
    await panel.evaluate(() => document.querySelector("#note").value),
    "Article personal note",
    "Detaching must preserve the thought",
  );
  await article.evaluate(() => {
    const input = document.querySelector("#password");
    input.focus();
    input.select();
  });
  await panel.evaluate(() => {
    document.querySelector("#note-sources").open = true;
    document.querySelector("#note-page").click();
  });
  await panel.waitFor(() => !!ChengLearning.studyPanel.draft.source);
  assert.equal(
    await panel.evaluate(() => ChengLearning.studyPanel.draft.source.quote),
    "",
    "Never capture password/form selections",
  );
  await article.evaluate(() => {
    document.activeElement.blur();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#passage"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await panel.evaluate(() => {
    document.querySelector("#note-sources").open = true;
    document.querySelector("#note-page").click();
  });
  await panel.waitFor(() =>
    ChengLearning.studyPanel.draft.source?.quote?.includes("original evidence"),
  );
  const allNotesEvent = context.waitForEvent("page");
  await panel.evaluate(() => document.querySelector("#note-library").click());
  const notesPage = await allNotesEvent;
  await notesPage
    .locator("#all-notes-list .note-card[data-note-target]")
    .waitFor();
  const articleCard = notesPage.locator("#all-notes-list .note-card", {
    hasText: "Article personal note",
  });
  const articleSource = articleCard.locator(".note-source-link");
  assert.equal(
    await articleSource.getAttribute("href"),
    "https://cheng-study.example/article?page=2#section",
  );
  const openedSourceEvent = context.waitForEvent("page");
  await articleSource.click();
  const openedSource = await openedSourceEvent;
  await openedSource.waitForURL(
    "https://cheng-study.example/article?page=2#section",
  );
  await openedSource.close();
  await notesPage.bringToFront();
  const videoCard = notesPage.locator("#all-notes-list .note-card", {
    hasText: "PRIVATE LOCAL STUDY NOTE UPDATED",
  });
  assert.equal(
    await videoCard.locator(".note-source-link").getAttribute("href"),
    "https://cheng-study.example/first",
  );
  await videoCard.locator(".note-source-time").click();
  await source.waitForFunction(
    () => document.querySelector("video").currentTime < 1,
  );
  await notesPage.bringToFront();
  await notesPage.fill("#all-note-body", "Library independent note");
  await notesPage.waitForTimeout(800);
  assert.ok(
    (await notesPage.evaluate(() => ChengLearning.workspace.state.notes)).some(
      (note) =>
        note.body === "Library independent note" &&
        !note.materialId &&
        !note.source,
    ),
  );
  const allMarkdown = await notesPage.evaluate(() =>
    ChengLearning.exportLearningNotes(ChengLearning.workspace.state),
  );
  assert.ok(
    allMarkdown.includes("Article personal note") &&
      allMarkdown.includes("Library independent note"),
  );
  await notesPage.close();
  await article.bringToFront();
  assert.equal(
    requests.length,
    2,
    "Article/independent notes and source association must not call AI",
  );
  // Recovery never overwrites the committed note: it preserves a recovered copy.
  await panel.evaluate(async () => {
    const draft = ChengLearning.studyPanel.draft;
    await chrome.storage.local.set({
      "cheng_study_draft:recovery-fixture": {
        note: {
          id: draft.id,
          materialId: draft.materialId,
          clipId: draft.clipId,
          source: draft.source,
          body: "Recovered unfinished draft",
          tags: [],
        },
        at: Date.now(),
      },
      "cheng_study_draft:independent-recovery": {
        note: {
          id: crypto.randomUUID(),
          materialId: "",
          clipId: "",
          source: null,
          body: "Recovered independent draft",
          tags: [],
        },
        at: Date.now(),
      },
    });
  });
  await panel.close();
  await article.bringToFront();
  await article.locator(".rd-float-btn [data-cheng-workspace]").click();
  panel = diagnosticPanel = await attachExtensionPanel(
    context,
    `chrome-extension://${id}/study.html`,
    errors,
  );
  await panel.waitFor(
    async () => {
      if (!globalThis.ChengLearning?.store) return false;
      const state = await ChengLearning.store.snapshot();
      return (
        state.notes.some(
          (note) =>
            note.body === "Recovered unfinished draft" &&
            note.source?.kind === "web",
        ) &&
        state.notes.some(
          (note) =>
            note.body === "Recovered independent draft" &&
            !note.materialId &&
            !note.source,
        )
      );
    },
    undefined,
    "draft recovery",
  );
  assert.equal(
    await panel.evaluate(
      async () =>
        Object.keys(
          await chrome.storage.local.get("cheng_study_draft:recovery-fixture"),
        ).length,
    ),
    0,
  );
  assert.equal(
    requests.length,
    2,
    "Switching videos, saving notes and recovery never auto-call AI",
  );
  await panel.close();
  assert.deepEqual(errors, []);
  console.log(
    "Live native study passed: no new tab/manual selection → bilingual seek/translation sync → one-click clip → local autosave → one-click AI with verified frozen preview → automatic tab following → isolated notes/draft recovery; zero page/background errors.",
  );
} catch (error) {
  for (const page of context?.pages() || [])
    if (page.url().includes("workspace.html"))
      console.error(
        "library diagnostics",
        await page
          .evaluate(() => ({
            url: location.href,
            status: document.querySelector("#status")?.textContent,
            notes: [...document.querySelectorAll(".note-card")].map((node) => ({
              id: node.id,
              text: node.textContent,
            })),
            state: globalThis.ChengLearning?.workspace?.state,
          }))
          .catch(() => null),
      );
  console.error(
    "panel diagnostics",
    await diagnosticPanel
      ?.evaluate(async () => ({
        window: await chrome.windows.getCurrent(),
        active: await chrome.tabs.query({ active: true }),
        all: await chrome.tabs.query({}),
        connection: document.querySelector("#connection")?.textContent,
        current: globalThis.ChengLearning?.studyPanel?.current,
        cues: document.querySelector("#cues")?.textContent,
        ai: {
          open: document.querySelector("#selection-ai")?.open,
          previewOpen: document.querySelector("#preview")?.open,
          preview: document.querySelector("#preview-content")?.textContent,
          button: document.querySelector("#explain")?.textContent,
          engine: document.querySelector("#engine")?.value,
        },
      }))
      .catch(() => null),
  );
  for (const page of context?.pages() || [])
    if (page.url().startsWith("https://cheng-study.example/"))
      console.error(
        "source diagnostics",
        await page
          .evaluate(() => ({
            time: document.querySelector("video")?.currentTime,
            duration: document.querySelector("video")?.duration,
            ready: document.querySelector("video")?.readyState,
            provider: window.captionProvider?.lines,
          }))
          .catch(() => null),
      );
  console.error(errors);
  throw error;
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
