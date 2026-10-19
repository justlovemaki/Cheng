import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { indexedDB } from "fake-indexeddb";
import * as fflate from "fflate";

globalThis.indexedDB = indexedDB;
globalThis.fflate = fflate;
const load = (name) =>
  vm.runInThisContext(
    fs.readFileSync(
      new URL(`../src/learning/${name}.js`, import.meta.url),
      "utf8",
    ),
    { filename: `${name}.js` },
  );
for (const name of ["schema", "store", "transfer"]) load(name);
const C = globalThis.ChengLearning;
const capture = {
  title: "Lecture on systems",
  sourceUrl:
    "https://www.youtube.com/watch?v=abcdefghijk&token=secret&utm_source=test",
  platform: "youtube",
  sourceId: "abcdefghijk",
  currentTime: 1,
  language: "en",
  cues: [
    {
      start: 0,
      end: 2,
      text: "Back pressure",
      repaired: "Backpressure",
      translation: "背压",
    },
    {
      start: 2,
      end: 5,
      text: "Preserve identifiers such as getValue().",
      translation: "保留代码标识符",
    },
  ],
};
let saved, baseline;

await test("Phase 1: capture, immutable transcript versions, clips and notes", async () => {
  saved = await C.store.saveCapture(capture, true);
  const note = await C.store.saveNote({
    materialId: saved.materialId,
    clipId: saved.clipId,
    body: "My own interpretation",
    tags: ["systems"],
  });
  assert.ok(note.id);
  const second = await C.store.saveCapture({
    ...capture,
    cues: capture.cues.map((cue) => ({
      ...cue,
      translation: `${cue.translation}!`,
    })),
  });
  assert.notEqual(saved.transcriptId, second.transcriptId);
  const state = await C.store.snapshot();
  assert.equal(state.transcripts.length, 2);
  assert.equal(
    state.transcripts.find((row) => row.id === saved.transcriptId).cues[0].text,
    "Back pressure",
  );
  assert.equal(state.clips[0].transcriptId, saved.transcriptId);
  assert.equal(
    state.materials[0].sourceUrl,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(state.notes[0].body, "My own interpretation");
  baseline = state;
});
await test("Phase 1: browser restart keeps project data; caches are a separate database", async () => {
  const db = await C.store.openDatabase();
  db.close();
  load("store");
  assert.deepEqual(await C.store.snapshot(), baseline);
  assert.notEqual((await C.store.openDatabase()).name, "CacheDB");
});
await test("Phase 1: rejected writes roll back atomically", async () => {
  const before = await C.store.snapshot();
  await assert.rejects(
    C.store.mutate((state) => {
      state.notes.push({ ...C.stamp(), materialId: "missing", body: "bad" });
    }),
    /不存在/,
  );
  assert.deepEqual(await C.store.snapshot(), before);
});
await test("Phase 1: SRT/VTT preserve timestamp units and reject invalid input", () => {
  const cues = C.parseSubtitles(
    "WEBVTT\n\n00:00.100 --> 00:02.500 align:start\n<c>Hello</c> &amp; world\n\nsecond\n00:03.000 --> 00:04.000\nLine two\n",
  );
  assert.equal(cues[0].start, 0.1);
  assert.equal(cues[0].text, "Hello & world");
  const again = C.parseSubtitles(C.exportSubtitles({ cues }, "srt"));
  assert.deepEqual(again, cues);
  const technical = C.parseSubtitles(
    "1\n00:00:00,000 --> 00:00:02,000\nUse std::vector<int> and List<T>; x < y.",
  );
  assert.equal(technical[0].text, "Use std::vector<int> and List<T>; x < y.");
  assert.deepEqual(
    C.parseSubtitles(C.exportSubtitles({ cues: technical }, "vtt")),
    technical,
  );
  assert.throws(
    () => C.parseSubtitles("1\n00:00:99,000 --> 00:01:50,000\nInvalid"),
    /小于/,
  );
  assert.throws(
    () => C.parseSubtitles("1\n00:00:02,000 --> 00:00:01,000\nBad"),
    /无效/,
  );
});
await test("Phase 1: subtitle import preserves prior versions and is deduplicated", async () => {
  const imported = await C.store.importTranscript({
    title: "Imported",
    cues: C.parseSubtitles("1\n00:00:00,000 --> 00:00:02,000\nHello"),
  });
  const again = await C.store.importTranscript({
    materialId: imported.materialId,
    cues: C.parseSubtitles("1\n00:00:00,000 --> 00:00:02,000\nHello"),
  });
  assert.equal(again.transcriptId, imported.transcriptId);
});
await test("Phase 1: complete ZIP roundtrip, merge idempotence and conflict handling", async () => {
  const before = await C.store.snapshot();
  const bytes = await C.exportArchive(before);
  const restored = await C.importArchive(bytes);
  assert.deepEqual(restored, C.validateSnapshot(before));
  await C.store.restore(restored, "merge");
  const first = await C.store.snapshot();
  await C.store.restore(restored, "merge");
  assert.deepEqual(await C.store.snapshot(), first);
  await C.store.restore(C.empty(), "replace");
  assert.equal((await C.store.snapshot()).materials.length, 0);
  await C.store.restore(restored, "replace");
  assert.deepEqual(await C.store.snapshot(), restored);
  const skipped = await C.store.restore(restored, "skip");
  assert.equal(skipped.skipped, restored.materials.length);
  assert.ok(
    !new TextDecoder()
      .decode(fflate.unzipSync(bytes)["materials.json"])
      .includes("secret"),
  );
});
await test("Phase 1: corrupted archives and unsupported ZIP entries cannot modify storage", async () => {
  const before = await C.store.snapshot();
  const bytes = await C.exportArchive(before),
    files = fflate.unzipSync(bytes);
  files["notes.json"] = new TextEncoder().encode("[]");
  await assert.rejects(
    C.importArchive(fflate.zipSync(files, { level: 0 })),
    /损坏/,
  );
  await assert.rejects(
    C.importArchive(
      fflate.zipSync(
        { "../malicious.json": new Uint8Array([1]) },
        { level: 0 },
      ),
    ),
    /不允许/,
  );
  await assert.rejects(
    C.importArchive(fflate.zipSync(files, { level: 6 })),
    /无压缩/,
  );
  assert.deepEqual(await C.store.snapshot(), before);
});
await test("Phase 1: citation and ownership validation", () => {
  const state = structuredClone(baseline);
  state.clips[0].cueIds = ["nonexistent"];
  assert.throws(() => C.validateSnapshot(state), /字幕行/);
  const invalid = structuredClone(baseline);
  invalid.materials[0].sourceUrl = "javascript:alert(1)";
  assert.throws(() => C.validateSnapshot(invalid), /HTTP/);
});
await test("Phase 1: Markdown retains source and timestamp provenance", () => {
  const output = C.exportMarkdown(baseline, saved.materialId);
  assert.ok(output.markdown.includes("My own interpretation"));
  assert.ok(output.markdown.includes("t=0s"));
  assert.ok(output.markdown.includes("Back pressure"));
});
const listeners = [];
globalThis.chrome = {
  runtime: {
    id: "test-extension",
    getURL: (file) => `chrome-extension://test-extension/${file}`,
    onMessage: { addListener: (listener) => listeners.push(listener) },
  },
  tabs: { query: async () => [], create: async (options) => options },
};
load("background");
const dispatch = (
  action,
  payload = {},
  sender = {
    id: "test-extension",
    url: "chrome-extension://test-extension/workspace.html",
  },
) =>
  new Promise((resolve) => {
    listeners[0](
      { type: `cheng:learning:${action}`, ...payload },
      sender,
      resolve,
    );
  });
await test("Phase 1: web pages cannot read, export, or modify the learning database", async () => {
  const sender = {
    id: "test-extension",
    url: "https://attacker.example/",
    tab: { id: 1 },
    frameId: 0,
  };
  for (const action of [
    "snapshot",
    "restore",
    "note",
    "delete-material",
    "recent",
    "seek",
  ]) {
    const result = await dispatch(action, {}, sender);
    assert.equal(result.ok, false, action);
    assert.match(result.error, /工作台/);
  }
  assert.equal((await dispatch("snapshot")).ok, true);
});

const configuredEngine = {
  _id: "byok-test",
  name: "Test provider",
  provider: "OpenAI",
  providerId: "OpenAI",
  model: "test-model",
  endpoint: "https://provider.example/v1/chat/completions?token=hidden",
  key: "PRIVATE-KEY",
};
chrome.storage = {
  local: { get: async () => ({ trancy_byok_engines: [configuredEngine] }) },
};
load("ai");
let lastAiRequest;
globalThis.lexihaloExecuteStructuredAi = async (request) => {
  lastAiRequest = request;
  return JSON.stringify({
    inVideo: "This excerpt describes backpressure.",
    background: "Additional background, not a speaker claim.",
    uncertainty: "Implementation is not established.",
    citations: ["cue-0"],
  });
};
const explanationInput = {
  materialId: saved.materialId,
  transcriptId: saved.transcriptId,
  cueIds: ["cue-0"],
  question: "What is backpressure?",
  mode: "concept",
  engineId: configuredEngine._id,
};
await test("Phase 2: glossary upsert, scope isolation and CSV/JSON roundtrips", async () => {
  await C.learningAi.saveGlossary(
    [
      {
        source: "Backpressure",
        target: "全局背压",
        aliases: ["back pressure"],
        note: "Technical term",
      },
    ],
    "",
  );
  await C.learningAi.saveGlossary(
    [
      {
        source: "Backpressure",
        target: "资料背压",
        aliases: ["back pressure"],
      },
    ],
    saved.materialId,
  );
  const terms = await C.glossaryForTranslation(["Back pressure"], {
    sourceUrl: capture.sourceUrl,
    sourceId: capture.sourceId,
  });
  assert.equal(terms[0].target, "资料背压");
  const foreign = await C.glossaryForTranslation(["Back pressure"], {
    sourceUrl: "https://unrelated.example/",
  });
  assert.equal(foreign[0].target, "全局背压");
  await C.learningAi.saveGlossary(
    [
      {
        source: "Backpressure",
        target: "更新译法",
        aliases: ["back pressure"],
      },
    ],
    saved.materialId,
  );
  assert.equal((await C.store.snapshot()).glossary.length, 2);
  const rows = [
    {
      source: "=special",
      target: '逗号,引号"',
      aliases: ["alias"],
      note: "First line\nSecond line",
    },
  ];
  assert.deepEqual(C.parseGlossary(C.exportGlossaryCsv(rows), "csv"), rows);
  assert.deepEqual(C.parseGlossary(JSON.stringify(rows), "json"), rows);
  await assert.rejects(
    C.learningAi.saveGlossary(
      [{ source: "X", target: "Y" }],
      "missing-material",
    ),
    /范围/,
  );
});
await test("Phase 2: preview excludes secrets and unrelated notes; consent is bound to exact context", async () => {
  const result = await dispatch("engines");
  assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes("PRIVATE-KEY"));
  assert.ok(!JSON.stringify(result).includes("hidden"));
  const planned = await C.learningAi.preview(explanationInput);
  assert.ok(!JSON.stringify(planned).includes("My own interpretation"));
  assert.ok(!JSON.stringify(planned).includes("PRIVATE-KEY"));
  await assert.rejects(
    C.learningAi.explain({
      ...explanationInput,
      previewHash: planned.previewHash,
    }),
    /确认/,
  );
  await assert.rejects(
    C.learningAi.explain({
      ...explanationInput,
      question: "changed",
      consent: true,
      previewHash: planned.previewHash,
    }),
    /变化/,
  );
  const explanation = await C.learningAi.explain({
    ...explanationInput,
    consent: true,
    previewHash: planned.previewHash,
  });
  assert.equal(explanation.transcriptId, saved.transcriptId);
  assert.ok(lastAiRequest.requestGroup.startsWith("cheng-concept:"));
  assert.ok(
    !JSON.stringify(lastAiRequest.messages).includes("My own interpretation"),
  );
  assert.deepEqual(explanation.citations, ["cue-0"]);
});
await test("Phase 2: reject invented citations; original code and numbers are protected", () => {
  assert.throws(
    () =>
      C.learningAi.parseResponse(
        JSON.stringify({
          inVideo: "claim",
          background: "",
          uncertainty: "",
          citations: ["invented"],
        }),
        [{ id: "cue-0" }],
      ),
    /不存在/,
  );
  assert.equal(
    C.preserveSourceIdentifiers(
      "Use getValue() at 42 ms",
      "Use fetchValue() at 43 ms",
    ),
    "Use getValue() at 42 ms",
  );
  assert.equal(
    C.preserveSourceIdentifiers("hello world", "Hello world."),
    "Hello world.",
  );
});
await test("Phase 2: concepts and glossary survive ZIP backup with original references", async () => {
  const state = await C.store.snapshot();
  assert.deepEqual(
    await C.importArchive(await C.exportArchive(state)),
    C.validateSnapshot(state),
  );
  const markdown = C.exportMarkdown(state, saved.materialId).markdown;
  assert.ok(markdown.includes("AI 补充背景"));
  assert.ok(markdown.includes("Test provider"));
});

load("media");
await test("Phase 3: local binding persists metadata only and requires mismatch confirmation", async () => {
  const first = await dispatch("bind-local", {
    filename: "local.webm",
    fingerprint: "a".repeat(64),
  });
  assert.equal(first.ok, true);
  const second = await dispatch("bind-local", {
    filename: "renamed.webm",
    fingerprint: "a".repeat(64),
  });
  assert.equal(first.data.materialId, second.data.materialId);
  const mismatch = await dispatch("bind-local", {
    materialId: first.data.materialId,
    filename: "different.webm",
    fingerprint: "b".repeat(64),
  });
  assert.equal(mismatch.ok, false);
  const material = (await C.store.snapshot()).materials.find(
    (row) => row.id === first.data.materialId,
  );
  assert.equal(material.localFileName, "renamed.webm");
  assert.ok(!Object.hasOwn(material, "bytes"));
  const unbound = await dispatch("unbind-local", {
    materialId: first.data.materialId,
  });
  assert.equal(unbound.ok, true);
  const detached = (await C.store.snapshot()).materials.find(
    (row) => row.id === first.data.materialId,
  );
  assert.equal(detached.localFileName, "");
  assert.equal(detached.localFingerprint, "");
  assert.equal(
    detached.title,
    material.title,
    "Unlinking media must preserve the learning material",
  );
});
await test("Phase 3: translation creates immutable versions and rejects changed identifiers", async () => {
  let state = await C.store.snapshot();
  const source = state.materials.find((row) => row.id === saved.materialId);
  const input = {
    materialId: source.id,
    transcriptId: source.activeTranscriptId,
    cueIds: ["cue-1"],
    to: "zh-CN",
    engineId: configuredEngine._id,
  };
  const planned = await C.learningAi.translationPreview(input);
  const oldAdapter = globalThis.lexihaloExecuteStructuredAi;
  globalThis.lexihaloExecuteStructuredAi = async () =>
    JSON.stringify({
      items: [{ id: "cue-1", translation: "Wrong changedValue()." }],
    });
  await assert.rejects(
    C.learningAi.translateSelected({
      ...input,
      consent: true,
      previewHash: planned.previewHash,
    }),
    /标识符/,
  );
  assert.equal(
    (await C.store.snapshot()).transcripts.length,
    state.transcripts.length,
  );
  globalThis.lexihaloExecuteStructuredAi = async () =>
    JSON.stringify({
      items: [{ id: "cue-1", translation: "保留 getValue()。" }],
    });
  const result = await C.learningAi.translateSelected({
    ...input,
    consent: true,
    previewHash: planned.previewHash,
  });
  const after = await C.store.snapshot();
  assert.notEqual(result.transcriptId, input.transcriptId);
  assert.deepEqual(
    after.transcripts.find((row) => row.id === input.transcriptId),
    state.transcripts.find((row) => row.id === input.transcriptId),
  );
  assert.equal(after.clips[0].transcriptId, saved.transcriptId);
  globalThis.lexihaloExecuteStructuredAi = oldAdapter;
});
await test("Phase 3: screenshots retain provenance in ZIP and Markdown image packages", async () => {
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const result = await dispatch("save-attachment", {
    materialId: saved.materialId,
    clipId: saved.clipId,
    time: 1,
    caption: "A slide",
    dataUrl,
  });
  assert.equal(result.ok, true);
  const before = await C.store.snapshot(),
    restored = await C.importArchive(await C.exportArchive(before));
  assert.deepEqual(restored, C.validateSnapshot(before));
  assert.ok(
    Object.keys(C.exportMarkdown(before, saved.materialId).files).some((file) =>
      file.endsWith(".png"),
    ),
  );
  const invalid = await dispatch("save-attachment", {
    materialId: saved.materialId,
    time: 0,
    dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
  });
  assert.equal(invalid.ok, false);
});
await test("Phase 3: repeated conflict merges do not duplicate remapped descendants", async () => {
  const original = await C.store.snapshot(),
    imported = structuredClone(original);
  const row = imported.materials.find((item) => item.id === saved.materialId);
  row.identity = "url:https://another.example/lecture";
  row.sourceUrl = "https://another.example/lecture";
  row.title = "Different lecture, colliding ids";
  await C.store.restore(imported, "merge");
  const once = await C.store.snapshot();
  await C.store.restore(imported, "merge");
  assert.deepEqual(await C.store.snapshot(), once);
  await C.store.restore(original, "replace");
});
await test("Phase 3: source identities isolate feed items and normalize platform ids", async () => {
  const a = await C.sourceIdentifier({
    platform: "html5",
    sourceUrl: "https://example.com/feed?token=private",
    mediaPath: "https://cdn.example.com/one.mp4",
    sourceId: "https://example.com/feed",
  });
  const b = await C.sourceIdentifier({
    platform: "html5",
    sourceUrl: "https://example.com/feed",
    mediaPath: "https://cdn.example.com/two.mp4",
    sourceId: "https://example.com/feed",
  });
  assert.notEqual(a, b);
  assert.notEqual(
    await C.sourceIdentifier({
      platform: "html5",
      itemIdentity: "tiktok:item-one",
      sourceUrl: "https://example.com/feed",
      mediaPath: "https://cdn.example.com/play",
    }),
    await C.sourceIdentifier({
      platform: "html5",
      itemIdentity: "tiktok:item-two",
      sourceUrl: "https://example.com/feed",
      mediaPath: "https://cdn.example.com/play",
    }),
  );
  assert.equal(
    (await C.sourceIdentifier({ platform: "html5", sourceId: "site:item-1" }))
      .length,
    64,
  );
  assert.equal(
    C.identity("https://youtube.com/live/abcdefghijk"),
    "youtube:abcdefghijk",
  );
  assert.equal(
    (
      await dispatch(
        "snapshot",
        {},
        { id: "test-extension", url: "file:///workspace.html" },
      )
    ).ok,
    false,
  );
  for (const action of [
    "save-attachment",
    "screenshot",
    "bind-local",
    "explain",
    "save-glossary",
  ])
    assert.equal(
      (
        await dispatch(
          action,
          {},
          {
            id: "test-extension",
            url: "https://untrusted.example/",
            tab: { id: 1 },
          },
        )
      ).ok,
      false,
    );
});

load("study-background");
const panelSender = {
  id: "test-extension",
  url: "chrome-extension://test-extension/study.html",
};
const studyDispatch = (action, payload = {}, sender = panelSender) =>
  new Promise((resolve) =>
    listeners.at(-1)(
      { type: `cheng:study:${action}`, ...payload },
      sender,
      resolve,
    ),
  );
let nativeOpen,
  studyAiCalls = 0;
chrome.sidePanel = {
  open: (options) => {
    nativeOpen = options;
    return Promise.resolve();
  },
};
chrome.tabs.get = async (id) => ({
  id,
  url: capture.sourceUrl,
  title: capture.title,
});
C.runBridge = async () => [
  {
    frameId: 0,
    result: {
      ...capture,
      sourceUrl: C.safeUrl(capture.sourceUrl),
      score: 100,
      total: capture.cues.length,
      paused: true,
    },
  },
];
C.capture = async () => structuredClone(capture);
const studyInput = {
  tabId: 7,
  frameId: 0,
  identity: C.identity(capture.sourceUrl, capture.platform, capture.sourceId),
  anchor: { start: 0, end: 2, text: capture.cues[0].text },
  question: "Explain this current excerpt",
  engineId: configuredEngine._id,
};
await test("Live study: native open preserves the original gesture and creates no tab", async () => {
  const pending = studyDispatch(
    "open",
    {},
    {
      id: "test-extension",
      url: "https://example.com/video",
      tab: { id: 7, windowId: 12 },
    },
  );
  assert.deepEqual(
    nativeOpen,
    { windowId: 12 },
    "Native open must be called synchronously, before awaiting anything",
  );
  assert.equal((await pending).ok, true);
  assert.equal((await studyDispatch("open")).ok, false);
});
await test("Live study: only the extension-owned panel can read/act on the live stream", async () => {
  for (const action of [
    "live",
    "remember",
    "preview",
    "explain",
    "engines",
    "seek",
  ]) {
    assert.equal(
      (
        await studyDispatch(action, studyInput, {
          id: "test-extension",
          url: "https://attacker.example/",
          tab: { id: 7 },
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await studyDispatch(action, studyInput, {
          id: "test-extension",
          url: "file:///study.html",
        })
      ).ok,
      false,
    );
  }
  const engines = await studyDispatch("engines");
  assert.equal(engines.ok, true);
  assert.ok(!JSON.stringify(engines).includes("PRIVATE-KEY"));
});
await test("Live study: polling is read-only and its subtitle payload is bounded", async () => {
  const before = await C.store.snapshot();
  const result = await studyDispatch("live", { tabId: 7 });
  assert.equal(result.ok, true);
  assert.equal(result.data.cues.length, 2);
  assert.deepEqual(await C.store.snapshot(), before);
  const old = C.runBridge;
  C.runBridge = async () => [
    {
      frameId: 0,
      result: { ...capture, cues: Array(11).fill(capture.cues[0]) },
    },
  ];
  assert.equal((await studyDispatch("live", { tabId: 7 })).ok, false);
  C.runBridge = old;
});
await test("Live study: one click stores/reuses the current clip; stale identities cannot cross videos", async () => {
  const first = await studyDispatch("remember", studyInput),
    second = await studyDispatch("remember", studyInput);
  assert.equal(first.ok, true);
  assert.equal(second.data.clip.id, first.data.clip.id);
  const before = await C.store.snapshot();
  assert.equal(
    (
      await studyDispatch("remember", {
        ...studyInput,
        identity: "different-video",
      })
    ).ok,
    false,
  );
  assert.deepEqual(await C.store.snapshot(), before);
});
await test("Live study: optional preview freezes its original evidence and requires explicit AI consent", async () => {
  const old = globalThis.lexihaloExecuteStructuredAi;
  globalThis.lexihaloExecuteStructuredAi = async (request) => {
    studyAiCalls++;
    lastAiRequest = request;
    return JSON.stringify({
      inVideo: "The selected video excerpt",
      background: "Supplement, not speaker claim",
      uncertainty: "Unconfirmed details",
      citations: ["cue-0"],
    });
  };
  const planned = await studyDispatch("preview", studyInput);
  assert.equal(planned.ok, true);
  assert.equal(studyAiCalls, 0);
  assert.equal((await studyDispatch("explain", studyInput)).ok, false);
  const explained = await studyDispatch("explain", {
    ...studyInput,
    frozen: planned.data.frozen,
    consent: true,
  });
  assert.equal(explained.ok, true);
  assert.equal(explained.data.start, 0);
  assert.equal(studyAiCalls, 1);
  assert.ok(
    !JSON.stringify(lastAiRequest.messages).includes("My own interpretation"),
  );
  const changed = await studyDispatch("explain", {
    ...studyInput,
    question: "A changed question",
    frozen: planned.data.frozen,
    consent: true,
  });
  assert.equal(changed.ok, false);
  assert.equal(studyAiCalls, 1);
  globalThis.lexihaloExecuteStructuredAi = old;
});
await test("Live study: stable note ids make autosave/recovery idempotent", async () => {
  const before = await C.store.snapshot();
  const input = {
    id: "study-note-idempotent",
    materialId: saved.materialId,
    clipId: saved.clipId,
    body: "First autosave",
    tags: [],
  };
  assert.equal((await C.store.saveNote(input)).id, input.id);
  await C.store.saveNote({ ...input, body: "Latest autosave" });
  const after = await C.store.snapshot();
  assert.equal(after.notes.length, before.notes.length + 1);
  assert.equal(
    after.notes.find((note) => note.id === input.id).body,
    "Latest autosave",
  );
});
