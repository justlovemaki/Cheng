/* Local note drafts are independent of pages/videos. Source association is optional. */
(() => {
  "use strict";
  const C = globalThis.ChengLearning,
    JOURNAL = "cheng_study_draft:";
  let ownerDocumentId = "";
  const payload = (value) => ({
    id: value.id,
    materialId: value.materialId || "",
    clipId: value.clipId || "",
    source: C.noteSource(value.source),
    body: value.body || "",
    tags: value.tags || [],
  });
  const signature = (value) => JSON.stringify(payload(value));
  function create(note = null, origin = null) {
    const value = {
      id: note?.id || C.newId(),
      key: JOURNAL + C.newId(),
      materialId: note?.materialId || "",
      clipId: note?.clipId || "",
      source: C.noteSource(note?.source),
      body: note?.body || "",
      tags: note?.tags || [],
      noteSaved: Boolean(note?.createdAt),
      origin: origin || {
        kind: "none",
        title: "独立笔记",
        quote: "",
        url: "",
        start: null,
        end: null,
        translation: "",
      },
      revision: 0,
      queue: Promise.resolve(),
    };
    value.savedSignature = signature(value);
    value.savedBody = value.body;
    return value;
  }
  function touch(value, onState = () => {}) {
    value.revision++;
    onState("保存中…", false, value);
    return chrome.storage.local
      .set({
        [value.key]: { note: payload(value), at: Date.now(), ownerDocumentId },
      })
      .catch((error) => {
        onState("本地草稿写入失败，请勿关闭页面", true, value);
        throw error;
      });
  }
  function save(value, onState = () => {}) {
    if (!value) return Promise.resolve();
    value.queue = value.queue
      .catch(() => {})
      .then(async () => {
        const input = payload(value),
          revision = value.revision,
          next = signature(value);
        const empty = !input.body.trim() && !input.materialId && !input.source;
        if (!value.noteSaved && empty) {
          value.savedSignature = next;
          value.savedBody = input.body;
        }
        if (next !== value.savedSignature && (value.noteSaved || !empty)) {
          const note = await C.store.saveNote(input);
          value.noteSaved = true;
          value.savedSignature = next;
          value.savedBody = input.body;
          value.updatedAt = note.updatedAt;
        }
        if (value.revision === revision) {
          await chrome.storage.local.remove(value.key);
          onState(
            value.noteSaved ? "已保存到本机" : "直接输入即可自动保存",
            false,
            value,
          );
        }
      });
    return value.queue.catch((error) => {
      onState("暂未写入资料库，草稿保留在本机", true, value);
      throw error;
    });
  }
  async function recover(skipKeys = []) {
    const keys = chrome.storage.local.getKeys
      ? (await chrome.storage.local.getKeys()).filter((key) =>
          key.startsWith(JOURNAL),
        )
      : null;
    const journals = Object.entries(
      await chrome.storage.local.get(keys || null),
    ).filter(([key]) => key.startsWith(JOURNAL) && !skipKeys.includes(key));
    const missing = [];
    let recovered = 0;
    if (!journals.length) return { missing, recovered };
    const liveDocuments = new Set(
      chrome.runtime.getContexts
        ? (await chrome.runtime.getContexts({})).map(
            (context) => context.documentId,
          )
        : [],
    );
    const state = await C.store.readTables(["materials", "clips", "notes"]);
    for (const [key, value] of journals) {
      if (value.ownerDocumentId && liveDocuments.has(value.ownerDocumentId))
        continue;
      try {
        const input = payload(value.note);
        C.record("notes", { ...C.stamp(), ...input });
        if (input.materialId)
          C.assert(
            state.materials.some((row) => row.id === input.materialId),
            "关联资料暂不可用",
          );
        if (input.clipId)
          C.assert(
            state.clips.some(
              (row) =>
                row.id === input.clipId && row.materialId === input.materialId,
            ),
            "关联片段暂不可用",
          );
        const existing = state.notes.find((row) => row.id === input.id);
        if (
          !existing &&
          !input.body.trim() &&
          !input.materialId &&
          !input.source
        ) {
          await chrome.storage.local.remove(key);
          continue;
        }
        if (!existing || signature(existing) !== signature(input)) {
          const note = await C.store.saveNote({
            ...input,
            id: existing ? C.newId() : input.id,
          });
          state.notes.push(note);
          recovered++;
        }
        await chrome.storage.local.remove(key);
      } catch {
        missing.push(value);
      }
    }
    return { missing, recovered };
  }
  C.notes = {
    JOURNAL,
    payload,
    signature,
    create,
    touch,
    save,
    recover,
    setOwner: (value) => {
      ownerDocumentId = typeof value === "string" ? value : "";
    },
    dirty: (value) => !!value && signature(value) !== value.savedSignature,
  };
})();
