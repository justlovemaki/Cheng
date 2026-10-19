import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { indexedDB } from "fake-indexeddb";
import * as fflate from "fflate";
globalThis.indexedDB = indexedDB;
globalThis.fflate = fflate;
const values = { trancy_byok_engines: [{ key: "must-stay-secret" }] };
let documents = [];
globalThis.chrome = {
  runtime: { getContexts: async () => documents },
  storage: {
    local: {
      get: async (keys) =>
        keys == null
          ? structuredClone(values)
          : Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => key in values)
                .map((key) => [key, structuredClone(values[key])]),
            ),
      set: async (data) => Object.assign(values, structuredClone(data)),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys])
          delete values[key];
      },
      getKeys: async () => Object.keys(values),
    },
  },
};
const load = (name) =>
  vm.runInThisContext(
    fs.readFileSync(
      new URL(`../src/learning/${name}.js`, import.meta.url),
      "utf8",
    ),
  );
load("schema");
const C = globalThis.ChengLearning;
// A real v1 object store, not merely a new empty v2 database.
await new Promise((resolve, reject) => {
  const request = indexedDB.open("ChengLearning", 1);
  request.onupgradeneeded = () => {
    for (const table of C.TABLES)
      request.result.createObjectStore(table, { keyPath: "id" });
  };
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result,
      tx = db.transaction(C.TABLES, "readwrite");
    tx.objectStore("materials").put(
      C.record("materials", {
        id: "legacy-material",
        createdAt: 10,
        updatedAt: 20,
        identity: "legacy:1",
        title: "Old lecture",
        sourceUrl: "https://example.com/lecture",
        platform: "web",
      }),
    );
    tx.objectStore("clips").put({
      id: "legacy-clip",
      createdAt: 10,
      updatedAt: 20,
      materialId: "legacy-material",
      transcriptId: "",
      start: 1,
      end: 2,
      text: "old clip",
      translation: "",
      cueIds: [],
    });
    tx.objectStore("notes").put({
      id: "legacy-note",
      createdAt: 11,
      updatedAt: 21,
      materialId: "legacy-material",
      clipId: "",
      body: "旧笔记不得丢失",
      tags: ["keep"],
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  };
});
for (const name of ["store", "notes", "transfer"]) load(name);
let legacy;
await test("Notes v3 migration preserves v1 ids, timestamps, body and links", async () => {
  const db = await C.store.openDatabase();
  assert.equal(db.version, 3);
  legacy = await C.store.snapshot();
  assert.equal(legacy.clips[0].purpose, "bookmark");
  assert.deepEqual(legacy.notes[0], {
    id: "legacy-note",
    createdAt: 11,
    updatedAt: 21,
    materialId: "legacy-material",
    source: null,
    clipId: "",
    body: "旧笔记不得丢失",
    tags: ["keep"],
  });
  C.validateSnapshot(legacy);
});
await test("Independent notes save without materials or clips", async () => {
  const note = await C.store.saveNote({
    id: "independent-note",
    body: "A thought with no source",
    tags: [],
  });
  assert.equal(note.materialId, "");
  assert.equal(note.clipId, "");
  assert.equal(note.source, null);
  const state = await C.store.snapshot();
  assert.equal(state.materials.length, 1);
  assert.equal(state.clips.length, 1);
  C.validateSnapshot(state);
});
await test("Optional web source retains article parameters and anchor, strips credentials/tracking", async () => {
  const note = await C.store.saveNote({
    id: "web-note",
    body: "My interpretation",
    source: {
      kind: "web",
      url: "https://example.com/article?page=2&token=secret&utm_source=tracking#section",
      title: "Article",
      quote: "原文片段 <not executable>",
    },
  });
  assert.equal(note.source.url, "https://example.com/article?page=2#section");
  assert.equal(note.materialId, "");
  assert.equal(
    C.safeNoteUrl("https://example.com/#access_token=secret"),
    "https://example.com/",
  );
  await assert.rejects(
    C.store.saveNote({
      id: "bad-source",
      body: "bad",
      source: { kind: "web", url: "javascript:alert(1)", quote: "" },
    }),
  );
  await assert.rejects(
    C.store.saveNote({
      id: "bad-both",
      materialId: "legacy-material",
      body: "bad",
      source: note.source,
    }),
    /两种/,
  );
  await assert.rejects(
    C.store.saveNote({ id: "bad-clip", clipId: "missing", body: "bad" }),
    /关联资料/,
  );
});
await test("Attach/detach changes only the source, preserving text and note id", async () => {
  const draft = C.notes.create();
  draft.body = "Keep this private thought";
  await C.notes.touch(draft);
  await C.notes.save(draft);
  const id = draft.id;
  const clip = await C.store.mutate((state) =>
    C.store.createClip(state, "legacy-material", "", [], 5),
  );
  draft.materialId = "legacy-material";
  draft.clipId = clip.id;
  await C.notes.touch(draft);
  await C.notes.save(draft);
  let row = (await C.store.snapshot()).notes.find((row) => row.id === id);
  assert.equal(row.body, "Keep this private thought");
  assert.equal(row.clipId, clip.id);
  draft.materialId = "";
  draft.clipId = "";
  draft.source = {
    kind: "web",
    url: "https://example.com/reading",
    title: "Reading",
    quote: "Selected passage",
  };
  await C.notes.touch(draft);
  await C.notes.save(draft);
  draft.source = null;
  await C.notes.touch(draft);
  await C.notes.save(draft);
  row = (await C.store.snapshot()).notes.find((row) => row.id === id);
  assert.equal(row.body, "Keep this private thought");
  assert.equal(row.materialId, "");
  assert.equal(row.source, null);
  assert.equal(
    (await C.store.snapshot()).notes.filter((row) => row.id === id).length,
    1,
  );
});
await test("Empty editors do not create blank notes; free draft recovery needs no parent material", async () => {
  const before = (await C.store.snapshot()).notes.length,
    draft = C.notes.create();
  await C.notes.save(draft);
  assert.equal((await C.store.snapshot()).notes.length, before);
  C.notes.setOwner("live-document");
  documents = [{ documentId: "live-document" }];
  draft.body = "Unfinished independent thought";
  await C.notes.touch(draft);
  assert.equal(
    (await C.notes.recover()).recovered,
    0,
    "Another live editor must not steal this journal",
  );
  documents = [];
  assert.equal((await C.notes.recover()).recovered, 1);
  const restored = (await C.store.snapshot()).notes.find(
    (row) => row.id === draft.id,
  );
  assert.equal(restored.materialId, "");
  assert.equal(restored.body, draft.body);
  assert.ok(!(draft.key in values));
});
await test("Version 1 archives import and merge idempotently after migration", async () => {
  const files = fflate.unzipSync(await C.exportArchive(legacy));
  const records = JSON.parse(new TextDecoder().decode(files["notes.json"]));
  for (const note of records) delete note.source;
  files["notes.json"] = new TextEncoder().encode(JSON.stringify(records));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  manifest.version = 1;
  manifest.checksums["notes.json"] = await C.hashBytes(files["notes.json"]);
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  const restored = await C.importArchive(fflate.zipSync(files, { level: 0 }));
  assert.equal(restored.notes[0].source, null);
  const count = (await C.store.snapshot()).notes.length;
  await C.store.restore(restored, "merge");
  await C.store.restore(restored, "merge");
  assert.equal((await C.store.snapshot()).notes.length, count);
});
await test("v3 backups and Markdown include independent, web and legacy material notes", async () => {
  const state = await C.store.snapshot(),
    archive = await C.exportArchive(state);
  assert.deepEqual(await C.importArchive(archive), C.validateSnapshot(state));
  const markdown = C.exportLearningNotes(state);
  assert.ok(markdown.includes("A thought with no source"));
  assert.ok(markdown.includes("https://example.com/article?page=2#section"));
  assert.ok(markdown.includes("旧笔记不得丢失"));
  assert.ok(markdown.includes("原文片段"));
  const text = Object.entries(fflate.unzipSync(archive))
    .filter(([name]) => name.endsWith(".json"))
    .map(([, bytes]) => new TextDecoder().decode(bytes))
    .join("\n");
  assert.ok(!text.includes("must-stay-secret"));
});
await test("Note-generated source clips are labelled and garbage-collected only after the last reference", async () => {
  const material =
    (await C.store.snapshot()).materials[0] ||
    (await C.store.importTranscript({
      title: "Reference fixture",
      cues: [
        {
          id: "cue-0",
          start: 0,
          end: 2,
          text: "evidence",
          repaired: "",
          translation: "",
        },
      ],
    }),
    (await C.store.snapshot()).materials.at(-1));
  const transcript = (await C.store.snapshot()).transcripts.find(
    (row) => row.materialId === material.id,
  );
  const clip = await C.store.mutate((state) =>
    C.store.createClip(
      state,
      material.id,
      transcript?.id || "",
      transcript ? ["cue-0"] : [],
      0,
      "note",
    ),
  );
  assert.equal(clip.purpose, "note");
  await C.store.saveNote({
    id: "reference-one",
    materialId: material.id,
    clipId: clip.id,
    body: "one",
    tags: [],
  });
  await C.store.saveNote({
    id: "reference-two",
    materialId: material.id,
    clipId: clip.id,
    body: "two",
    tags: [],
  });
  await C.store.removeNote("reference-one");
  assert.ok((await C.store.snapshot()).clips.some((row) => row.id === clip.id));
  await C.store.removeNote("reference-two");
  assert.ok(
    !(await C.store.snapshot()).clips.some((row) => row.id === clip.id),
  );
});
await test("Deleting an unrelated material does not delete independent/web notes", async () => {
  const before = (await C.store.snapshot()).notes
    .filter((row) => !row.materialId)
    .map((row) => row.id)
    .sort();
  await C.store.removeMaterial("legacy-material");
  assert.deepEqual(
    (await C.store.snapshot()).notes.map((row) => row.id).sort(),
    before,
  );
});
