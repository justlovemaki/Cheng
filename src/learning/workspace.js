(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const $ = (id) => document.getElementById(id);
  let state = C.empty(),
    materialId = new URL(location.href).searchParams.get("material") || "";
  let noteId = "",
    dirty = false,
    page = 0,
    firstLoad = true,
    subtitleImportTarget = "";
  const selected = new Set();
  const requestedClip = new URL(location.href).searchParams.get("clip") || "";
  const request = async (action, payload = {}) => {
    // Extension-owned IndexedDB access avoids Chrome's runtime message-size limit
    // for complete libraries and ZIP restores. Website scripts have another origin.
    if (action === "snapshot") return C.store.snapshot();
    if (action === "restore")
      return C.store.restore(payload.data, payload.mode);
    const response = await chrome.runtime.sendMessage({
      type: `cheng:learning:${action}`,
      ...payload,
    });
    if (!response?.ok)
      throw new Error(response?.error || "后台未响应，请重新打开工作台");
    return response.data;
  };
  function notify(message, error = false) {
    $("status").textContent = message;
    $("status").classList.toggle("error", error);
  }
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function bind(node, action) {
    node.addEventListener("click", async (event) => {
      if (node.getAttribute("aria-busy") === "true") return;
      node.setAttribute("aria-busy", "true");
      try {
        await action(event);
      } catch (error) {
        notify(error.message, true);
      } finally {
        node.removeAttribute("aria-busy");
      }
    });
    return node;
  }
  const button = (label, action, className = "") =>
    bind(element("button", label, className), action);
  const material = () => state.materials.find((row) => row.id === materialId);
  const transcript = () =>
    state.transcripts.find((row) => row.id === material()?.activeTranscriptId);
  const cleanEditor = () => {
    noteId = "";
    dirty = false;
    $("note-body").value = "";
    $("note-tags").value = "";
    $("note-state").textContent = "";
  };
  const canDiscard = () =>
    !dirty || confirm("当前笔记尚未保存，是否放弃修改？");
  async function selectMaterial(id) {
    if (C.notesLibrary && !(await C.notesLibrary.leave())) return;
    if (id !== materialId && !canDiscard()) return;
    if (id !== materialId) {
      cleanEditor();
      selected.clear();
      page = 0;
      $("note-clip").value = "";
    }
    materialId = id;
    const url = new URL(location.href);
    url.searchParams.set("material", id);
    url.searchParams.delete("clip");
    history.replaceState(null, "", url);
    render();
  }
  async function refresh() {
    state = await request("snapshot");
    if (firstLoad && !state.materials.some((row) => row.id === materialId))
      materialId =
        [...state.materials].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ||
        "";
    firstLoad = false;
    render();
  }
  async function seek(start, end) {
    if (C.seekLocal && (await C.seekLocal(materialId, start, end))) return;
    notify("正在定位来源播放器…");
    await request("seek", {
      materialId,
      start,
      ...(end === undefined ? {} : { end }),
    });
    notify("已定位到原视频");
  }
  function renderLibrary() {
    const query = $("library-search").value.trim().toLocaleLowerCase();
    const list = $("materials");
    list.replaceChildren();
    const records = [...state.materials]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(
        (row) =>
          !query ||
          [
            row.title,
            ...state.transcripts
              .filter(
                (transcript) =>
                  transcript.materialId === row.id &&
                  transcript.id === row.activeTranscriptId,
              )
              .map((transcript) =>
                transcript.cues
                  .map((cue) => `${cue.text} ${cue.translation}`)
                  .join("\n"),
              ),
            ...state.notes
              .filter((note) => note.materialId === row.id)
              .map((note) => `${note.body} ${note.tags.join(" ")}`),
            ...state.concepts
              .filter((item) => item.materialId === row.id)
              .map(
                (item) => `${item.question} ${item.inVideo} ${item.background}`,
              ),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
      );
    for (const row of records) {
      const item = button(
        row.title,
        () => selectMaterial(row.id),
        `material-item${row.id === materialId ? " active" : ""}`,
      );
      item.append(
        element(
          "small",
          `${row.platform === "local" ? "本地资料" : row.platform} · ${new Date(row.updatedAt).toLocaleDateString()} · ${C.timeLabel(row.currentTime)}`,
        ),
      );
      list.append(item);
    }
    if (!records.length)
      list.append(
        element("p", query ? "没有匹配的资料" : "还没有学习资料", "muted"),
      );
  }
  function renderCues() {
    const current = transcript(),
      list = $("cues");
    list.replaceChildren();
    let cues = current?.cues || [];
    if (C.filterLearningCues) cues = C.filterLearningCues(cues);
    const totalPages = Math.max(1, Math.ceil(cues.length / 100));
    page = Math.min(page, totalPages - 1);
    for (const cue of cues.slice(page * 100, page * 100 + 100)) {
      const row = element("div", undefined, "cue");
      row.dataset.cueId = cue.id;
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(cue.id);
      checkbox.setAttribute(
        "aria-label",
        `选择 ${C.timeLabel(cue.start)} 的字幕`,
      );
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selected.add(cue.id) : selected.delete(cue.id);
        updateSelection();
      });
      const time = button(
        C.timeLabel(cue.start),
        () => seek(cue.start),
        "time",
      );
      const text = element("div");
      text.append(element("p", cue.repaired || cue.text, "original"));
      if (cue.translation)
        text.append(element("p", cue.translation, "translation"));
      row.append(checkbox, time, text);
      list.append(row);
    }
    if (!cues.length)
      list.append(
        element(
          "p",
          current
            ? "没有匹配的字幕"
            : "尚无可读取字幕。可导入 SRT / VTT，或回原视频使用 BYOK 转写后重新保存。",
          "muted",
        ),
      );
    $("page-label").textContent =
      `${page + 1} / ${totalPages} · ${cues.length} 行`;
    $("previous-page").disabled = page === 0;
    $("next-page").disabled = page >= totalPages - 1;
    updateSelection();
    document.dispatchEvent(new Event("cheng:cues-render"));
  }
  function updateSelection() {
    $("selection-count").textContent = `已选 ${selected.size} 行`;
    $("save-clip").disabled = !selected.size || selected.size > 100;
    document.dispatchEvent(new Event("cheng:selection-change"));
  }
  function renderNotes() {
    const clips = state.clips
      .filter((row) => row.materialId === materialId)
      .sort((a, b) => a.start - b.start);
    const options = $("note-clip"),
      previous = options.value;
    options.replaceChildren(new Option("整段视频", ""));
    for (const clip of clips)
      options.add(
        new Option(
          `${C.timeLabel(clip.start)} — ${clip.text.slice(0, 45) || "片段"}`,
          clip.id,
        ),
      );
    options.value = clips.some((row) => row.id === previous) ? previous : "";
    const clipList = $("clips");
    clipList.replaceChildren();
    for (const clip of clips) {
      const card = element("article", undefined, "clip-card"),
        noteRefs = state.notes.filter((note) => note.clipId === clip.id),
        attachmentRefs = state.attachments.filter(
          (attachment) => attachment.clipId === clip.id,
        ),
        purpose = clip.purpose || "bookmark";
      const badge = element("div", undefined, "clip-provenance");
      badge.append(
        element(
          "strong",
          noteRefs.length
            ? `笔记引用 · ${noteRefs.length} 条`
            : purpose === "note"
              ? "笔记引用"
              : "独立保存",
        ),
      );
      if (attachmentRefs.length)
        badge.append(element("span", ` · ${attachmentRefs.length} 张截图`));
      const tools = element("div", undefined, "toolbar");
      tools.append(
        button(`${C.timeLabel(clip.start)} — ${C.timeLabel(clip.end)}`, () =>
          seek(clip.start),
        ),
        button("重听", () => seek(clip.start, clip.end)),
        noteRefs.length
          ? button("查看引用笔记", () =>
              C.notesLibrary?.openNote(noteRefs[0].id),
            )
          : button("基于此片段写笔记", () =>
              C.notesLibrary?.openLinked(materialId, clip.id),
            ),
        ...(!noteRefs.length && !attachmentRefs.length
          ? [
              button("删除独立片段", async () => {
                if (!confirm("删除这个独立保存的字幕片段？")) return;
                await request("delete-clip", { id: clip.id });
                await refresh();
              }),
            ]
          : []),
      );
      card.append(badge, tools, element("p", clip.text || "无字幕时间片段"));
      if (clip.translation)
        card.append(element("p", clip.translation, "muted"));
      clipList.append(card);
    }
    const relatedNotes = state.notes.filter(
      (row) => row.materialId === materialId,
    );
    $("material-note-count").textContent = `${relatedNotes.length} 条关联笔记`;
    $("material-notes-link").textContent = relatedNotes.length
      ? `查看关联笔记（${relatedNotes.length}）`
      : "打开学习笔记";
    // Note bodies have one canonical UI: Learning Notes. Material detail only
    // reports the relationship and links there; it never renders duplicates.
    $("notes").replaceChildren();
  }
  function render() {
    renderLibrary();
    const current = material();
    $("empty").hidden = Boolean(current);
    $("detail").hidden = !current;
    $("import-subtitles-current").disabled = !current;
    if (!current) {
      $("import-subtitles-current").textContent = "给当前媒体添加字幕版本";
      $("subtitle-import-target").textContent =
        "选择一项媒体资料后，可把 SRT/VTT 添加为它的新字幕版本；不会替换媒体或旧字幕。";
      document.dispatchEvent(new Event("cheng:workspace-render"));
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("material", current.id);
    history.replaceState(null, "", url);
    $("material-title").textContent = current.title;
    $("import-subtitles-current").disabled = false;
    $("import-subtitles-current").textContent =
      `给当前媒体添加字幕版本：《${current.title.slice(0, 32)}${current.title.length > 32 ? "…" : ""}》`;
    $("subtitle-import-target").textContent =
      "导入后只切换到新的字幕版本；媒体文件和旧字幕版本都会保留。";
    $("material-source").textContent =
      current.sourceUrl ||
      `本地资料${current.localFileName ? ` · 上次文件：${current.localFileName}（需在本地播放区重新连接）` : " · 尚未连接媒体文件"}`;
    const versions = $("transcript-version");
    versions.replaceChildren();
    for (const row of state.transcripts.filter(
      (row) => row.materialId === materialId,
    ))
      versions.add(
        new Option(
          `${new Date(row.createdAt).toLocaleString()} · ${row.origin} · ${row.cues.length} 行`,
          row.id,
        ),
      );
    versions.value = current.activeTranscriptId;
    $("resume").textContent = `继续学习 · ${C.timeLabel(current.currentTime)}`;
    renderCues();
    renderNotes();
    document.dispatchEvent(new Event("cheng:workspace-render"));
  }
  function download(bytes, filename, type = "application/octet-stream") {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
    const url = URL.createObjectURL(blob),
      anchor = element("a");
    anchor.href = url;
    anchor.download = filename
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .slice(0, 180);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function refreshTabs() {
    const tabs = await request("tabs"),
      select = $("source-tabs"),
      previous = select.value;
    select.replaceChildren();
    for (const tab of tabs)
      select.add(new Option(tab.title.slice(0, 60), String(tab.id)));
    if (tabs.some((tab) => String(tab.id) === previous))
      select.value = previous;
  }
  for (const id of ["note-body", "note-tags", "note-clip"])
    $(id).addEventListener("input", () => {
      dirty = true;
      $("note-state").textContent = "未保存";
    });
  addEventListener("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  let librarySearchTimer;
  $("library-search").addEventListener("input", () => {
    clearTimeout(librarySearchTimer);
    librarySearchTimer = setTimeout(renderLibrary, 120);
  });
  $("transcript-version").addEventListener("change", async () => {
    try {
      await request("activate-transcript", {
        materialId,
        transcriptId: $("transcript-version").value,
      });
      selected.clear();
      page = 0;
      await refresh();
    } catch (error) {
      notify(error.message, true);
    }
  });
  bind($("refresh-tabs"), refreshTabs);
  bind($("material-notes-link"), () => C.notesLibrary?.open({ materialId }));
  bind($("capture"), async () => {
    if (!canDiscard()) return;
    notify("正在保存字幕和播放位置…");
    const saved = await request("capture", {
      tabId: Number($("source-tabs").value),
    });
    cleanEditor();
    materialId = saved.materialId;
    selected.clear();
    page = 0;
    await refresh();
    notify("已保存到本机资料库，翻译缓存清理不会删除这份资料");
  });
  bind($("save-clip"), async () => {
    const clip = await request("clip", {
      materialId,
      transcriptId: transcript()?.id,
      cueIds: [...selected],
    });
    await refresh();
    if (!dirty) $("note-clip").value = clip.id;
    notify("片段已收藏，可以继续写笔记");
  });
  bind($("clear-selection"), () => {
    selected.clear();
    renderCues();
  });
  bind($("previous-page"), () => {
    page = Math.max(0, page - 1);
    renderCues();
  });
  bind($("next-page"), () => {
    page++;
    renderCues();
  });
  bind($("save-note"), async () => {
    C.assert($("note-body").value.trim(), "请先输入笔记");
    await request("note", {
      note: {
        id: noteId || undefined,
        materialId,
        clipId: $("note-clip").value,
        body: $("note-body").value,
        tags: $("note-tags")
          .value.split(/[,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
      },
    });
    cleanEditor();
    await refresh();
    notify("笔记已保存到本机");
  });
  bind($("new-note"), () => {
    if (canDiscard()) {
      cleanEditor();
      $("note-clip").value = "";
      $("note-body").focus();
    }
  });
  bind($("resume"), () => seek(material().currentTime));
  bind($("delete-material"), async () => {
    if (
      !confirm(
        "删除此资料及其全部字幕、片段、笔记和附件？此操作不能撤销，请先备份。",
      )
    )
      return;
    await request("delete-material", { id: materialId });
    cleanEditor();
    materialId = "";
    await refresh();
    notify("资料已删除");
  });
  bind($("import-subtitles"), () => {
    if (!canDiscard()) return;
    subtitleImportTarget = "";
    $("subtitle-file").click();
  });
  bind($("import-subtitles-current"), () => {
    if (!canDiscard()) return;
    C.assert(material(), "请先选择要添加字幕的媒体资料");
    subtitleImportTarget = materialId;
    $("subtitle-file").click();
  });
  $("subtitle-file").addEventListener("change", async () => {
    try {
      const file = $("subtitle-file").files[0];
      if (!file) return;
      C.assert(file.size <= 16 * 1024 * 1024, "字幕不能超过 16 MB");
      const cues = C.parseSubtitles(await file.text());
      const saved = await request("import-subtitles", {
        input: {
          title: file.name.replace(/\.(srt|vtt)$/i, ""),
          cues,
          materialId: subtitleImportTarget || undefined,
        },
      });
      cleanEditor();
      materialId = saved.materialId;
      selected.clear();
      page = 0;
      await refresh();
      notify(
        subtitleImportTarget
          ? "已给当前媒体添加新字幕版本；媒体与旧字幕均保留"
          : "已创建新的字幕资料",
      );
    } catch (error) {
      notify(error.message, true);
    } finally {
      $("subtitle-file").value = "";
      subtitleImportTarget = "";
    }
  });
  bind($("export-backup"), async () => {
    const bytes = await C.exportArchive(await request("snapshot"));
    download(
      bytes,
      `Cheng-${new Date().toISOString().slice(0, 10)}.zip`,
      "application/zip",
    );
    notify("备份已导出，不包含 API Key、Cookie 或视频文件");
  });
  bind($("import-backup"), () => {
    if (canDiscard()) $("backup-file").click();
  });
  $("backup-file").addEventListener("change", async () => {
    try {
      const file = $("backup-file").files[0];
      if (!file) return;
      C.assert(file.size <= 128 * 1024 * 1024, "项目包不能超过 128 MB");
      const imported = await C.importArchive(
        new Uint8Array(await file.arrayBuffer()),
      );
      const mode = $("restore-mode").value;
      if (
        !confirm(
          `项目包包含 ${imported.materials.length} 份资料、${imported.notes.length} 条笔记。${mode === "replace" ? "将替换当前全部学习资料！建议先导出备份。" : "将按所选方式导入。"}是否继续？`,
        )
      )
        return;
      await request("restore", { data: imported, mode });
      cleanEditor();
      materialId = "";
      selected.clear();
      await refresh();
      notify("恢复完成");
    } catch (error) {
      notify(error.message, true);
    } finally {
      $("backup-file").value = "";
    }
  });
  for (const format of ["srt", "vtt"])
    bind($(`export-${format}`), () => {
      C.assert(transcript(), "当前资料没有字幕");
      download(
        C.exportSubtitles(transcript(), format),
        `${material().title}.${format}`,
        "text/plain;charset=utf-8",
      );
    });
  bind($("export-markdown"), async () => {
    const result = C.exportMarkdown(await request("snapshot"), materialId);
    if (Object.keys(result.files).length)
      download(
        fflate.zipSync(
          {
            "notes.md": new TextEncoder().encode(result.markdown),
            ...result.files,
          },
          { level: 0 },
        ),
        `${material().title}-notes.zip`,
        "application/zip",
      );
    else
      download(
        result.markdown,
        `${material().title}.md`,
        "text/markdown;charset=utf-8",
      );
  });
  C.workspace = {
    $,
    request,
    notify,
    element,
    button,
    bind,
    refresh,
    render,
    renderCues,
    download,
    seek,
    selectMaterial,
    canDiscard,
    resetNoteEditor: cleanEditor,
    get state() {
      return state;
    },
    get materialId() {
      return materialId;
    },
    get material() {
      return material();
    },
    get transcript() {
      return transcript();
    },
    get selected() {
      return [...selected];
    },
    resetPage() {
      page = 0;
      renderCues();
    },
  };
  Promise.all([refresh(), refreshTabs()])
    .then(() => {
      if (
        requestedClip &&
        state.clips.some(
          (row) => row.id === requestedClip && row.materialId === materialId,
        )
      ) {
        $("note-clip").value = requestedClip;
        $("note-body").focus();
      }
      if (location.hash.startsWith("#note-")) {
        const target = document.getElementById(location.hash.slice(1));
        target?.scrollIntoView({ block: "center" });
        target?.focus({ preventScroll: true });
      }
      document.dispatchEvent(new Event("cheng:workspace-ready"));
    })
    .catch((error) => notify(error.message, true));
})();
