/* One view for independent, webpage and material-linked learning notes. */
(() => {
  "use strict";
  const C = globalThis.ChengLearning,
    W = C.workspace,
    { element: el, button, request, notify, $ } = W;
  const initial = new URL(location.href),
    host = $("learning-notes");
  let active = initial.searchParams.get("view") === "notes",
    decided = false,
    draft = C.notes.create(),
    timer,
    materialFilter = initial.searchParams.get("noteMaterial") || "",
    anchorApplied = false;
  const title = el("h1", "学习笔记"),
    intro = el(
      "p",
      "可以直接记录理解、问题或灵感。出处可有可无；视频片段、网页选文和独立笔记都在这里。",
      "muted",
    );
  const tools = el("div", undefined, "toolbar"),
    showAll = button("查看全部笔记", () => {
      materialFilter = "";
      route();
      renderList();
    }),
    layout = el("div", undefined, "all-notes-grid"),
    editor = el("section", undefined, "panel"),
    listPanel = el("section", undefined, "panel");
  const label = el("h2", "直接写笔记"),
    status = el("span", "自动保存", "muted"),
    input = el("textarea");
  input.id = "all-note-body";
  input.rows = 8;
  input.maxLength = 100000;
  input.placeholder = "想到什么就写下来，不需要先关联资料…";
  input.setAttribute("aria-label", "学习笔记正文");
  const originView = el("div", undefined, "note-origin"),
    list = el("div");
  list.id = "all-notes-list";
  const search = el("input");
  search.id = "all-notes-search";
  search.type = "search";
  search.placeholder = "搜索笔记、选文、出处或标签";
  search.setAttribute("aria-label", "搜索全部学习笔记");
  const changed = (text, error, value) => {
    if (value !== draft) return;
    status.textContent = text;
    status.classList.toggle("error", error);
    renderOrigin();
    if (text === "已保存到本机") void W.refresh();
  };
  const flush = () => C.notes.save(draft, changed);
  async function begin(note = null) {
    clearTimeout(timer);
    await flush();
    draft = C.notes.create(note, note ? C.noteOrigin(W.state, note) : null);
    input.value = draft.body;
    status.textContent = note ? "编辑后自动保存" : "直接输入即可自动保存";
    renderOrigin();
    input.focus();
  }
  function renderOrigin() {
    originView.replaceChildren();
    const origin = draft.origin;
    originView.append(
      el(
        "p",
        origin.kind === "none"
          ? "无关联出处 · 独立笔记"
          : `关联出处：${origin.title}${origin.start !== null ? ` · ${C.timeLabel(origin.start)}` : ""}`,
        "muted",
      ),
    );
    if (origin.quote) originView.append(el("blockquote", origin.quote));
    if (origin.url) {
      const link = el("a", "打开出处页面 ↗", "note-source-link");
      link.href = origin.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = origin.url;
      originView.append(link);
    }
    if (origin.kind === "material" && origin.start !== null)
      originView.append(
        button("回到关联时间点", () =>
          request("seek", {
            materialId: draft.materialId,
            start: origin.start,
          }),
        ),
      );
    if (origin.kind !== "none")
      originView.append(
        button("取消关联（保留文字）", async () => {
          draft.materialId = "";
          draft.clipId = "";
          draft.source = null;
          draft.origin = {
            kind: "none",
            title: "独立笔记",
            quote: "",
            url: "",
            start: null,
            end: null,
          };
          await C.notes.touch(draft, changed);
          await flush();
          renderOrigin();
        }),
      );
  }
  input.addEventListener("input", () => {
    draft.body = input.value;
    void C.notes.touch(draft, changed).catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch((error) => notify(error.message, true));
    }, 450);
  });
  search.addEventListener("input", renderList);
  function renderList() {
    const query = search.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const notes = [...W.state.notes]
      .filter((note) => !materialFilter || note.materialId === materialFilter)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((note) => {
        const source = C.noteOrigin(W.state, note);
        return (
          !query ||
          `${note.body} ${note.tags.join(" ")} ${source.title} ${source.url} ${source.quote}`
            .toLocaleLowerCase()
            .includes(query)
        );
      });
    for (const note of notes) {
      const origin = C.noteOrigin(W.state, note),
        card = el("article", undefined, "note-card");
      card.id = `note-${note.id}`;
      card.tabIndex = -1;
      if (location.hash.slice(1) === card.id) {
        card.dataset.noteTarget = "true";
        card.classList.add("note-target");
      }
      card.append(
        el("p", note.body || "（已记录出处，暂无补充文字）"),
        el(
          "small",
          origin.kind === "none"
            ? "独立笔记 · 无关联出处"
            : `${origin.kind === "web" ? "网页笔记" : "资料笔记"} · ${origin.title}${origin.start !== null ? ` · ${C.timeLabel(origin.start)}` : ""}`,
          "muted",
        ),
      );
      if (origin.quote) card.append(el("blockquote", origin.quote));
      const sourceActions = el("div", undefined, "toolbar note-source-actions");
      if (origin.url) {
        const link = el(
          "a",
          origin.kind === "web" ? "打开网页出处 ↗" : "打开来源页面 ↗",
          "note-source-link",
        );
        link.href = origin.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.title = origin.url;
        sourceActions.append(link);
      }
      if (origin.kind === "material" && origin.start !== null) {
        const jump = button(`跳到 ${C.timeLabel(origin.start)}`, () =>
          request("seek", { materialId: note.materialId, start: origin.start }),
        );
        jump.classList.add("note-source-time");
        sourceActions.append(jump);
      }
      if (sourceActions.children.length) card.append(sourceActions);
      const actions = el("div", undefined, "toolbar");
      actions.append(
        button("编辑", () => begin(note)),
        button("导出 Markdown", () =>
          W.download(
            C.exportLearningNotes(W.state, [note.id]),
            "Cheng-note.md",
            "text/markdown;charset=utf-8",
          ),
        ),
        button("删除", async () => {
          if (!confirm("删除这条笔记？不会删除出处资料。")) return;
          clearTimeout(timer);
          await flush();
          await request("delete-note", { id: note.id });
          if (draft.id === note.id) {
            draft = C.notes.create();
            input.value = "";
            renderOrigin();
            status.textContent = "直接输入即可自动保存";
          }
          await W.refresh();
        }),
      );
      card.append(actions);
      list.append(card);
    }
    if (!notes.length)
      list.append(
        el(
          "p",
          query
            ? "没有匹配的笔记"
            : "还没有学习笔记。可以在旁边直接写，不需要关联任何资料。",
          "muted",
        ),
      );
    const material = W.state.materials.find((row) => row.id === materialFilter);
    title.textContent = material ? `“${material.title}”的学习笔记` : "学习笔记";
    showAll.hidden = !materialFilter;
    $("open-learning-notes").textContent = `学习笔记 · ${W.state.notes.length}`;
    if (!anchorApplied && location.hash.startsWith("#note-")) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
        anchorApplied = true;
      }
    }
  }
  function route() {
    const url = new URL(location.href);
    url.searchParams.set("view", active ? "notes" : "materials");
    if (active && materialFilter)
      url.searchParams.set("noteMaterial", materialFilter);
    else url.searchParams.delete("noteMaterial");
    history.replaceState(null, "", url);
  }
  function render() {
    if (!decided) {
      // Never infer the initial tab from stored data. Generic library links
      // mean Materials; only explicit view=notes links open note management.
      active = initial.searchParams.get("view") === "notes";
      decided = true;
      if (active) route();
    }
    host.hidden = !active;
    for (const id of ["refresh-tabs", "source-tabs", "capture"])
      $(id).hidden = active;
    $("open-learning-notes").classList.toggle("active", active);
    $("open-learning-materials").classList.toggle("active", !active);
    $("open-learning-notes").textContent = `学习笔记 · ${W.state.notes.length}`;
    if (active) {
      $("empty").hidden = true;
      $("detail").hidden = true;
      for (const card of $("notes").querySelectorAll('[id^="note-"]')) {
        card.id = "material-" + card.id;
        delete card.dataset.noteTarget;
        card.classList.remove("note-target");
      }
      renderList();
    }
  }
  async function open(options = {}) {
    if (!W.canDiscard()) return;
    materialFilter = options.materialId || "";
    W.resetNoteEditor();
    active = true;
    decided = true;
    route();
    await W.refresh();
  }
  async function leave() {
    if (!active) return true;
    try {
      clearTimeout(timer);
      await flush();
    } catch (error) {
      notify(error.message, true);
      return false;
    }
    active = false;
    materialFilter = "";
    host.hidden = true;
    list.replaceChildren();
    const url = new URL(location.href);
    url.searchParams.set("view", "materials");
    url.searchParams.delete("noteMaterial");
    if (url.hash.startsWith("#note-")) url.hash = "";
    history.replaceState(null, "", url);
    return true;
  }
  tools.append(
    button("新建笔记", () => begin()),
    showAll,
    button("导出全部笔记 Markdown", async () => {
      await flush();
      await W.refresh();
      W.download(
        C.exportLearningNotes(W.state),
        "Cheng-learning-notes.md",
        "text/markdown;charset=utf-8",
      );
    }),
  );
  editor.append(label, status, input, originView);
  listPanel.append(search, list);
  layout.append(editor, listPanel);
  host.append(title, intro, tools, layout);
  $("open-learning-notes").addEventListener("click", () => {
    void open().catch((error) => notify(error.message, true));
  });
  $("open-learning-materials").addEventListener("click", () => {
    void leave().then((ok) => {
      if (ok) W.render();
    });
  });
  document.addEventListener("cheng:workspace-render", render);
  addEventListener("beforeunload", (event) => {
    if (C.notes.dirty(draft)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  addEventListener("pagehide", () => {
    clearTimeout(timer);
    void flush().catch(() => {});
  });
  async function openNote(noteId) {
    const note = W.state.notes.find((row) => row.id === noteId);
    C.assert(note, "笔记不存在");
    anchorApplied = false;
    await open({ materialId: note.materialId || "" });
    const url = new URL(location.href);
    url.hash = `note-${note.id}`;
    history.replaceState(null, "", url);
    renderList();
  }
  async function openLinked(materialId, clipId) {
    await open({ materialId });
    const material = W.state.materials.find((row) => row.id === materialId),
      clip = W.state.clips.find(
        (row) => row.id === clipId && row.materialId === materialId,
      );
    C.assert(material && clip, "关联片段不存在");
    await begin({ materialId, clipId, source: null, body: "", tags: [] });
    draft.origin = C.noteOrigin(W.state, { materialId, clipId });
    renderOrigin();
    status.textContent = "已关联片段 · 输入后自动保存";
    input.focus();
  }
  C.notesLibrary = {
    open,
    openNote,
    openLinked,
    leave,
    get draft() {
      return draft;
    },
    flush,
  };
  renderOrigin();
  (async () => {
    C.notes.setOwner((await request("owner")).documentId);
    const recovered = await C.notes.recover([draft.key]);
    if (recovered.recovered)
      notify(`已恢复 ${recovered.recovered} 条未完成笔记`);
    await W.refresh();
  })().catch((error) => notify(error.message, true));
})();
