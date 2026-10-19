(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const DB_NAME = "ChengLearning"; // Separate from every legacy translation cache.
  let connection;
  async function openDatabase() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, C.VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        for (const table of C.TABLES)
          if (!db.objectStoreNames.contains(table))
            db.createObjectStore(table, { keyPath: "id" });
        if (event.oldVersion > 0 && event.oldVersion < 2) {
          const cursor = request.transaction.objectStore("notes").openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            row.update(
              C.record("notes", {
                ...row.value,
                source: row.value.source ?? null,
              }),
            );
            row.continue();
          };
        }
        if (event.oldVersion > 0 && event.oldVersion < 3) {
          const cursor = request.transaction.objectStore("clips").openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            row.update(
              C.record("clips", {
                ...row.value,
                purpose: row.value.purpose || "bookmark",
              }),
            );
            row.continue();
          };
        }
      };
      request.onerror = () => {
        connection = null;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = null;
        reject(new Error("资料库升级被其他窗口阻塞，请关闭旧工作台后重试"));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
    });
    return connection;
  }
  async function transaction(update) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(C.TABLES, update ? "readwrite" : "readonly");
      const state = C.empty();
      let remaining = C.TABLES.length,
        result,
        cause;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(cause || tx.error || new Error("资料保存失败，已撤销本次操作"));
      tx.onerror = () => {}; // onabort owns error reporting.
      for (const table of C.TABLES) {
        const request = tx.objectStore(table).getAll();
        request.onsuccess = () => {
          state[table] = request.result;
          if (--remaining) return;
          try {
            if (!update) {
              result = state;
              return;
            }
            const previous = Object.fromEntries(
              C.TABLES.map((name) => [
                name,
                new Map(state[name].map((row) => [row.id, row])),
              ]),
            );
            result = update(state);
            C.assert(!(result instanceof Promise), "事务内部不能执行异步操作");
            const validated = C.validateSnapshot(state);
            for (const name of C.TABLES) {
              const store = tx.objectStore(name),
                nextIds = new Set();
              for (let index = 0; index < state[name].length; index++) {
                const row = state[name][index];
                nextIds.add(row.id);
                if (previous[name].get(row.id) !== row)
                  store.put(validated[name][index]);
              }
              for (const key of previous[name].keys())
                if (!nextIds.has(key)) store.delete(key);
            }
          } catch (error) {
            cause = error;
            tx.abort();
          }
        };
      }
    });
  }
  const fingerprint = async (value) => {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };
  function materialFromCapture(capture) {
    const sourceUrl = C.safeUrl(capture.sourceUrl);
    const platform = C.text(capture.platform || "web", 80);
    const sourceId = /^[\w.-]{1,160}$/.test(capture.sourceId || "")
      ? capture.sourceId
      : "";
    return C.record("materials", {
      ...C.stamp(),
      identity: C.identity(sourceUrl, platform, sourceId),
      title: capture.title || "未命名视频",
      sourceUrl,
      platform,
      sourceId,
      language: capture.language || "auto",
      currentTime: capture.currentTime || 0,
    });
  }
  async function saveCapture(capture, makeClip = false) {
    const material = materialFromCapture(capture);
    const cues = (capture.cues || []).map((cue, index) => ({
      id: `cue-${index}`,
      start: cue.start,
      end: cue.end,
      text: cue.text,
      repaired: cue.repaired || "",
      translation: cue.translation || "",
    }));
    // Validate before hashing potentially hostile or oversized page data.
    const candidate = C.record("transcripts", {
      ...C.stamp(),
      materialId: material.id,
      language: material.language,
      origin: "browser",
      cues,
    });
    candidate.fingerprint = await fingerprint(candidate.cues);
    return transaction((state) => {
      let current = state.materials.find(
        (row) => row.identity === material.identity,
      );
      if (!current) {
        current = material;
        state.materials.push(current);
      }
      let transcript = state.transcripts.find(
        (row) =>
          row.materialId === current.id &&
          row.fingerprint === candidate.fingerprint,
      );
      if (cues.length && !transcript) {
        transcript = { ...candidate, materialId: current.id };
        state.transcripts.push(transcript);
      }
      const updated = {
        ...current,
        currentTime: material.currentTime,
        updatedAt: Date.now(),
        activeTranscriptId: transcript?.id || current.activeTranscriptId,
      };
      state.materials = state.materials.map((row) =>
        row.id === current.id ? updated : row,
      );
      let clip;
      if (makeClip) {
        const nearby =
          transcript?.cues
            .filter(
              (cue) =>
                cue.start <= material.currentTime &&
                cue.end > material.currentTime,
            )
            .slice(0, 5) || [];
        clip = createClip(
          state,
          current.id,
          transcript?.id || "",
          nearby.map((cue) => cue.id),
          material.currentTime,
        );
      }
      return {
        materialId: current.id,
        transcriptId: transcript?.id || "",
        clipId: clip?.id || "",
      };
    });
  }
  function createClip(
    state,
    materialId,
    transcriptId,
    cueIds,
    time = 0,
    purpose = "bookmark",
  ) {
    const transcript = state.transcripts.find(
      (row) => row.id === transcriptId && row.materialId === materialId,
    );
    const selected =
      transcript?.cues.filter((cue) => cueIds.includes(cue.id)) || [];
    C.assert(
      cueIds.length <= 100 && selected.length === cueIds.length,
      "选中的字幕已变化，请重新选择",
    );
    const clip = C.record("clips", {
      ...C.stamp(),
      materialId,
      purpose,
      transcriptId,
      start: selected.length
        ? Math.min(...selected.map((cue) => cue.start))
        : time,
      end: selected.length
        ? Math.max(...selected.map((cue) => cue.end))
        : time + 5,
      text: selected.map((cue) => cue.text).join("\n"),
      translation: selected
        .map((cue) => cue.translation)
        .filter(Boolean)
        .join("\n"),
      cueIds,
    });
    state.clips.push(clip);
    return clip;
  }
  const pruneNoteClips = (state) => {
    const used = new Set(
      [
        ...state.notes.map((note) => note.clipId),
        ...state.attachments.map((attachment) => attachment.clipId),
      ].filter(Boolean),
    );
    state.clips = state.clips.filter(
      (clip) => (clip.purpose || "bookmark") !== "note" || used.has(clip.id),
    );
  };
  const saveNote = (input) =>
    transaction((state) => {
      const existing =
        input.id && state.notes.find((row) => row.id === input.id);
      const note = C.record("notes", {
        ...(existing || {
          ...C.stamp(),
          ...(input.id ? { id: C.id(input.id) } : {}),
        }),
        materialId: input.materialId || "",
        clipId: input.clipId || "",
        source: Object.prototype.hasOwnProperty.call(input, "source")
          ? input.source
          : (existing?.source ?? null),
        body: input.body,
        tags: input.tags || [],
        updatedAt: Date.now(),
      });
      state.notes = [...state.notes.filter((row) => row.id !== note.id), note];
      pruneNoteClips(state);
      return note;
    });
  const removeNote = (noteId) =>
    transaction((state) => {
      C.id(noteId);
      state.notes = state.notes.filter((note) => note.id !== noteId);
      pruneNoteClips(state);
      return true;
    });
  const removeMaterial = (materialId) =>
    transaction((state) => {
      for (const table of C.TABLES)
        state[table] = state[table].filter((row) =>
          table === "materials"
            ? row.id !== materialId
            : table === "glossary"
              ? row.scope !== materialId
              : row.materialId !== materialId,
        );
      return true;
    });
  const put = (table, input) =>
    transaction((state) => {
      C.assert(
        ["glossary", "concepts", "attachments"].includes(table),
        "此数据类型不能直接写入",
      );
      const row = C.record(table, input);
      state[table] = [
        ...state[table].filter((value) => value.id !== row.id),
        row,
      ];
      return row;
    });
  async function restore(input, mode) {
    C.assert(
      ["merge", "skip", "replace"].includes(mode),
      "请选择合并、跳过或完整恢复",
    );
    const imported = C.validateSnapshot(input);
    return transaction((state) => {
      if (mode === "replace") {
        for (const table of C.TABLES) state[table] = imported[table];
        return { restored: imported.materials.length };
      }
      const maps = Object.fromEntries(
        C.TABLES.map((table) => [table, new Map()]),
      );
      const skipped = new Set();
      const append = (table, row) => {
        const previous = state[table].find((item) => item.id === row.id);
        if (previous && JSON.stringify(previous) === JSON.stringify(row))
          return previous.id;
        if (previous) {
          const content = JSON.stringify({ ...row, id: "" });
          const importedBefore = state[table].find(
            (item) => JSON.stringify({ ...item, id: "" }) === content,
          );
          if (importedBefore) return importedBefore.id;
        }
        const next = { ...row, id: previous ? C.newId() : row.id };
        state[table].push(next);
        return next.id;
      };
      for (const row of imported.materials) {
        const same = state.materials.find(
          (item) => item.identity === row.identity,
        );
        if (same) {
          maps.materials.set(row.id, same.id);
          if (mode === "skip") skipped.add(row.id);
        } else
          maps.materials.set(
            row.id,
            append("materials", { ...row, activeTranscriptId: "" }),
          );
      }
      for (const table of [
        "transcripts",
        "clips",
        "notes",
        "concepts",
        "attachments",
        "glossary",
      ]) {
        for (const row of imported[table]) {
          const owner = table === "glossary" ? row.scope : row.materialId;
          if (owner && skipped.has(owner)) continue;
          const next = { ...row };
          if (next.materialId)
            next.materialId = maps.materials.get(next.materialId);
          if (next.scope) next.scope = maps.materials.get(next.scope);
          if (next.transcriptId)
            next.transcriptId = maps.transcripts.get(next.transcriptId);
          if (next.clipId) next.clipId = maps.clips.get(next.clipId);
          maps[table].set(row.id, append(table, next));
        }
      }
      for (const row of imported.materials) {
        if (skipped.has(row.id)) continue;
        const target = maps.materials.get(row.id);
        state.materials = state.materials.map((item) =>
          item.id === target && !item.activeTranscriptId
            ? {
                ...item,
                activeTranscriptId:
                  maps.transcripts.get(row.activeTranscriptId) || "",
              }
            : item,
        );
      }
      return {
        restored: imported.materials.length - skipped.size,
        skipped: skipped.size,
      };
    });
  }
  async function importTranscript(input) {
    const materialId = input.materialId || C.newId();
    const transcript = C.record("transcripts", {
      ...C.stamp(),
      materialId,
      language: input.language || "auto",
      origin: "import",
      cues: input.cues,
    });
    transcript.fingerprint = await fingerprint(transcript.cues);
    return transaction((state) => {
      let material = state.materials.find((row) => row.id === materialId);
      if (!material) {
        C.assert(!input.materialId, "目标资料不存在");
        material = C.record("materials", {
          ...C.stamp(),
          id: materialId,
          identity: `local:${materialId}`,
          title: input.title || "本地学习资料",
          sourceUrl: "",
          platform: "local",
          localFileName: input.localFileName || "",
        });
        state.materials.push(material);
      }
      const existing = state.transcripts.find(
        (row) =>
          row.materialId === materialId &&
          row.fingerprint === transcript.fingerprint,
      );
      if (!existing) state.transcripts.push(transcript);
      state.materials = state.materials.map((row) =>
        row.id === materialId
          ? {
              ...row,
              activeTranscriptId: existing?.id || transcript.id,
              updatedAt: Date.now(),
            }
          : row,
      );
      return { materialId, transcriptId: existing?.id || transcript.id };
    });
  }
  async function readTables(tables) {
    C.assert(
      tables.every((name) => C.TABLES.includes(name)),
      "未知数据表",
    );
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const result = {},
        tx = db.transaction(tables, "readonly");
      for (const table of tables) {
        const request = tx.objectStore(table).getAll();
        request.onsuccess = () => {
          result[table] = request.result;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error("读取资料失败"));
    });
  }
  Object.assign(C, {
    store: {
      snapshot: () => transaction(),
      mutate: transaction,
      saveCapture,
      createClip,
      pruneNoteClips,
      saveNote,
      removeNote,
      removeMaterial,
      put,
      restore,
      fingerprint,
      openDatabase,
      importTranscript,
      readTables,
    },
  });
})();
