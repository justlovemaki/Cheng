(() => {
  "use strict";
  const C = globalThis.ChengLearning,
    $ = (id) => document.getElementById(id);
  const pinned = Number(new URL(location.href).searchParams.get("tab")) || 0;
  const JOURNAL = C.notes.JOURNAL;
  let windowId,
    tabId = pinned,
    generation = 0,
    current = null,
    polling = false,
    closed = false,
    initialized = false,
    renderKey = "",
    quietUntil = 0,
    errorUntil = 0,
    draft = C.notes.create(),
    timer,
    preview = null,
    previewGeneration = 0,
    selectionIdentity = "";
  const selectedCues = new Map();
  const busy = new Set();
  const node = (tag, text, className) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (className) value.className = className;
    return value;
  };
  const request = async (action, data = {}) => {
    const result = await chrome.runtime.sendMessage({
      type: `cheng:study:${action}`,
      ...data,
    });
    if (!result?.ok)
      throw new Error(
        result?.error || "学习服务未响应，请重新加载扩展后刷新原视频",
      );
    return result.data;
  };
  function status(text, error = false) {
    $("connection").textContent = text;
    $("connection").classList.toggle("error", error);
    if (error) errorUntil = Date.now() + 6000;
  }
  const activeCue = () => current?.cues?.filter((cue) => cue.active).at(-1);
  const linkLibrary = (materialId) => {
    const url = new URL(chrome.runtime.getURL("workspace.html"));
    url.searchParams.set("view", "materials");
    url.searchParams.set("material", materialId);
    $("library").href = url.href;
  };
  const cueKey = (cue) => `${cue.start}:${cue.end}:${cue.text}`;
  const selection = () =>
    [...selectedCues.values()].sort(
      (a, b) => a.start - b.start || a.end - b.end,
    );
  const selectionAnchors = () =>
    selection().map(({ start, end, text }) => ({ start, end, text }));
  function closeAiDialog() {
    if ($("preview")?.open) $("preview").open = false;
    else invalidatePreview();
    if ($("selection-ai")?.open) $("selection-ai").close();
  }
  function clearSelection() {
    selectedCues.clear();
    selectionIdentity = current?.identity || "";
    invalidatePreview();
    renderSelection();
  }
  function renderSelection() {
    const cues = selection(),
      visible = cues.length > 0;
    $("caption-selection").hidden = !visible;
    if (!visible) {
      if ($("selection-ai").open) closeAiDialog();
      $("selection-review").hidden = true;
    }
    setText(
      "selection-summary",
      `已选 ${cues.length} 句 · ${visible ? `${C.timeLabel(cues[0].start)} — ${C.timeLabel(cues.at(-1).end)}` : ""}`,
    );
    const review = $("selection-review-list");
    review.replaceChildren();
    for (const cue of cues) {
      const item = node("div", undefined, "selection-review-item"),
        time = node("button", C.timeLabel(cue.start), "time"),
        text = node("span", cue.repaired || cue.text),
        remove = node("button", "取消", "remove");
      time.type = "button";
      time.title = "跳回这句字幕";
      time.addEventListener("click", () =>
        request("seek", { ...source(), start: cue.start })
          .then(poll)
          .catch((error) => status(error.message, true)),
      );
      remove.type = "button";
      remove.setAttribute("aria-label", `取消选择 ${cue.text}`);
      remove.addEventListener("click", () => toggleCue(cue, false));
      item.append(time, text, remove);
      review.append(item);
    }
    for (const row of $("cues").querySelectorAll(".cue")) {
      const chosen = selectedCues.has(row.dataset.cueKey);
      row.classList.toggle("selected", chosen);
      const checkbox = row.querySelector(".cue-select");
      if (checkbox) {
        checkbox.checked = chosen;
        checkbox.setAttribute("aria-checked", String(chosen));
      }
    }
    $("selection-note").disabled = !visible || busy.has("selection-note");
    $("repeat-selection").disabled = !visible || busy.has("repeat-selection");
    $("explain").disabled =
      !visible || !$("engine").value || busy.has("explain");
    setText(
      "ai-help",
      visible
        ? `将解释所选 ${cues.length} 句，并补充附近上下文。`
        : "先从实时字幕中选择 1–10 句。",
    );
  }
  function toggleCue(cue, checked = !selectedCues.has(cueKey(cue))) {
    if (current?.identity !== selectionIdentity) {
      selectedCues.clear();
      selectionIdentity = current?.identity || "";
    }
    const key = cueKey(cue);
    if (checked) {
      C.assert(
        selectedCues.size < 10 || selectedCues.has(key),
        "一次最多选择 10 句字幕",
      );
      selectedCues.set(key, { ...cue });
    } else selectedCues.delete(key);
    invalidatePreview();
    renderSelection();
    controls();
  }
  const source = () => {
    C.assert(current?.available, "请先切换到视频页面并开始播放");
    return {
      tabId: current.tabId,
      frameId: current.frameId,
      identity: current.identity,
    };
  };
  const setText = (id, text) => {
    if ($(id).textContent !== text) $(id).textContent = text;
  };
  function editingCurrentCue() {
    const origin = draft.origin,
      cues = selection(),
      cue = activeCue();
    if (
      !current?.available ||
      origin.kind !== "material" ||
      origin.identity !== current.identity
    )
      return false;
    if (cues.length)
      return (
        origin.start === cues[0].start &&
        origin.end === cues.at(-1).end &&
        origin.quote === cues.map((row) => row.text).join("\n")
      );
    return cue
      ? origin.start === cue.start &&
          origin.end === cue.end &&
          origin.quote === cue.text
      : origin.start !== null &&
          current.currentTime >= origin.start &&
          current.currentTime < origin.end;
  }
  function renderNoteTarget() {
    const origin = draft.origin || { kind: "none" },
      linked = origin.kind !== "none";
    $("note-context").hidden = !linked;
    $("note-detach").hidden = !linked;
    const label =
      origin.kind === "material"
        ? `${origin.title}${origin.start !== null ? ` · ${C.timeLabel(origin.start)} — ${C.timeLabel(origin.end)}` : ""}`
        : origin.title || "";
    setText("note-target-label", label);
    $("note-target-label").title = label;
    setText("note-anchor", origin.quote || "");
    $("note-anchor").hidden = !origin.quote;
    setText("note-translation", origin.translation || "");
    $("note-translation").hidden = !origin.translation;
    $("note-source-url").hidden = !origin.url;
    if (origin.url) {
      $("note-source-url").href = origin.url;
      $("note-source-url").title = origin.url;
      setText(
        "note-source-url",
        origin.kind === "web" ? "打开网页出处 ↗" : "打开来源页面 ↗",
      );
    }
    setText(
      "note-guidance",
      linked
        ? "这条笔记已关联上面的出处，但不会随浏览或播放自动改绑。取消关联也不会删除笔记文字。"
        : "这是独立笔记，不关联任何页面也能保存。想写另一条，点“新建”。",
    );
    setText(
      "remember",
      busy.has("remember")
        ? "正在关联…"
        : editingCurrentCue()
          ? "已关联当前片段"
          : draft.materialId || draft.source
            ? "替换为当前片段"
            : selection().length
              ? `关联选中 ${selection().length} 句字幕`
              : activeCue()
                ? "关联当前字幕"
                : "关联视频时间点",
    );
    $("note-library").hidden = !draft.noteSaved;
    if (draft.noteSaved) {
      const url = new URL(chrome.runtime.getURL("workspace.html"));
      url.searchParams.set("view", "notes");
      url.hash = `note-${draft.id}`;
      $("note-library").href = url.href;
    }
  }
  function controls() {
    $("remember").disabled =
      !current?.available || busy.has("remember") || editingCurrentCue();
    $("note-new").disabled = busy.has("note-new");
    $("note-page").disabled = !current?.pageUrl || busy.has("note-page");
    $("note-detach").disabled = busy.has("note-detach");
    $("repeat").disabled = !activeCue() || busy.has("repeat");
    $("follow").disabled = !current?.available;
    $("enable-captions").disabled =
      !current?.available || busy.has("enable-captions");
    renderNoteTarget();
    renderSelection();
  }
  function action(id, callback) {
    $(id).addEventListener("click", async () => {
      if (busy.has(id)) return;
      busy.add(id);
      $(id).setAttribute("aria-busy", "true");
      controls();
      try {
        await callback();
      } catch (error) {
        status(error.message, true);
      } finally {
        busy.delete(id);
        $(id).removeAttribute("aria-busy");
        controls();
      }
    });
  }
  function follow() {
    const selected = $("cues").querySelector(".active"),
      list = $("cues");
    if (selected && Date.now() >= quietUntil) {
      const delta =
        selected.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTop += delta - (list.clientHeight - selected.clientHeight) / 2;
    }
  }
  function render(value) {
    current = value;
    $("video-title").textContent = value?.title || "学习笔记";
    if (
      value?.identity &&
      selectionIdentity &&
      value.identity !== selectionIdentity
    ) {
      selectedCues.clear();
      preview = null;
      previewGeneration++;
    }
    if (value?.identity) selectionIdentity = value.identity;
    if (!value?.available) {
      // Opening this extension's own library/settings briefly activates an
      // internal tab. Preserve the video selection in that case; clear only
      // after following a different ordinary page.
      if (value?.pageUrl && selectedCues.size) {
        selectedCues.clear();
        selectionIdentity = "";
        preview = null;
        previewGeneration++;
      }
      $("clock").textContent = value?.pageUrl
        ? "当前网页 · 可以直接写笔记，也可关联选文"
        : "可以直接记录想法；关联出处是可选的";
      $("cues").replaceChildren(
        node(
          "p",
          value?.message ||
            "当前网页未检测到可读视频。切换到视频标签页后会自动连接。",
          "muted",
        ),
      );
      $("subtitle-count").textContent = "未连接视频";
      $("subtitle-help").textContent =
        "实时对照、字幕跳转和重听仍在；检测到视频及字幕后会自动可用。";
      renderKey = "";
      controls();
      return;
    }
    $("clock").textContent =
      `${value.paused ? "已暂停" : "播放中"} · ${C.timeLabel(value.currentTime)} · 自动对照`;
    $("subtitle-count").textContent = `${value.total} 行字幕`;
    const key = JSON.stringify([value.identity, value.cues]);
    if (key !== renderKey) {
      renderKey = key;
      const list = $("cues"),
        scroll = list.scrollTop;
      list.replaceChildren();
      for (const cue of value.cues) {
        const row = node("div", undefined, `cue${cue.active ? " active" : ""}`),
          checkbox = node("input"),
          time = node("button", C.timeLabel(cue.start), "time"),
          content = node("div", undefined, "cue-text");
        row.tabIndex = 0;
        row.setAttribute("role", "group");
        row.dataset.start = cue.start;
        row.dataset.cueKey = cueKey(cue);
        row.title = "点击字幕跳转；勾选左侧复选框后可记笔记或 AI 解释";
        checkbox.type = "checkbox";
        checkbox.className = "cue-select";
        checkbox.checked = selectedCues.has(cueKey(cue));
        checkbox.setAttribute(
          "aria-label",
          `选择字幕 ${C.timeLabel(cue.start)} ${cue.text}`,
        );
        content.append(node("p", cue.repaired || cue.text, "original"));
        if (cue.translation)
          content.append(node("p", cue.translation, "translation"));
        row.append(checkbox, time, content);
        const target = {
          tabId: value.tabId,
          frameId: value.frameId,
          identity: value.identity,
          start: cue.start,
        };
        const seek = () =>
          request("seek", target)
            .then(() => poll())
            .catch((error) => status(error.message, true));
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          try {
            toggleCue(cue, checkbox.checked);
          } catch (error) {
            checkbox.checked = false;
            status(error.message, true);
          }
        });
        time.type = "button";
        time.addEventListener("click", (event) => {
          event.stopPropagation();
          seek();
        });
        row.addEventListener("click", (event) => {
          if (!event.target.matches("button,input")) seek();
        });
        row.addEventListener("keydown", (event) => {
          if (event.target.matches("button,input")) return;
          if (event.key === "Enter") {
            event.preventDefault();
            seek();
          } else if (event.key === " ") {
            event.preventDefault();
            try {
              toggleCue(cue);
            } catch (error) {
              status(error.message, true);
            }
          }
        });
        list.append(row);
      }
      if (!value.cues.length)
        list.append(
          node(
            "p",
            "当前尚无可读取字幕。开启原站字幕、原有双语字幕或 AI 转写后会自动显示。",
            "muted",
          ),
        );
      list.scrollTop = scroll;
      follow();
    }
    $("subtitle-help").textContent = value.cues.some((cue) => cue.translation)
      ? "点击字幕正文或时间可跳转；勾选左侧复选框后可记笔记或 AI 解释。"
      : "点击字幕正文或时间可跳转；勾选复选框后可操作。暂未读到译文。";
    controls();
  }
  async function detectTab() {
    if (pinned || !Number.isInteger(windowId)) return;
    const active = await chrome.tabs.query({ active: true, windowId });
    if (
      active[0]?.id &&
      active[0].id !== tabId &&
      !String(active[0].url || "").startsWith(chrome.runtime.getURL(""))
    ) {
      tabId = active[0].id;
      generation++;
      render(null);
      invalidatePreview();
    }
  }
  async function poll() {
    if (
      !initialized ||
      polling ||
      closed ||
      document.visibilityState === "hidden"
    )
      return;
    polling = true;
    let expected = generation,
      target = tabId;
    try {
      // New tabs activate while still about:blank, before their HTTP URL arrives.
      // Reconcile the active tab as well as listening for activation events.
      await detectTab();
      expected = generation;
      target = tabId;
      const value = await request("live", { tabId: target });
      if (expected !== generation || target !== tabId) return;
      render(value);
      if (Date.now() >= errorUntil)
        status(
          value.available
            ? "已连接原播放器 · 实时同步不调用 AI"
            : value.message,
        );
    } catch (error) {
      if (expected === generation) {
        render(null);
        status(error.message);
      }
    } finally {
      polling = false;
    }
  }
  const noteState = (text, error = false) => {
    $("save-state").textContent = text;
    $("save-state").classList.toggle("error", error);
  };
  const draftState = (text, error, value) => {
    if (draft === value) {
      noteState(text, error);
      renderNoteTarget();
    }
  };
  const persist = (value) => C.notes.save(value, draftState);
  const touch = (value) => C.notes.touch(value, draftState);
  $("note").addEventListener("input", () => {
    const value = draft;
    value.body = $("note").value;
    void touch(value).catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(() => {
      void persist(value).catch(() => {});
    }, 450);
  });
  async function recoverDrafts() {
    const { recovered, missing } = await C.notes.recover([draft.key]);
    if (!recovered && !missing.length) return;
    $("draft-recovery").textContent =
      `已恢复 ${recovered} 条未完成笔记。${missing.length ? `${missing.length} 条关联资料缺失，原草稿仍保留在本机。` : ""}`;
    if (missing.length) {
      const exportButton = node("button", "导出未恢复草稿");
      exportButton.onclick = () => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(missing, null, 2)], {
            type: "application/json",
          }),
        );
        const link = node("a");
        link.href = url;
        link.download = "Cheng-unsaved-notes.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      $("draft-recovery").after(exportButton);
    }
  }
  action("note-new", async () => {
    clearTimeout(timer);
    await persist(draft);
    draft = C.notes.create();
    $("note").value = "";
    $("note").focus();
    noteState("直接输入即可自动保存");
    renderNoteTarget();
  });
  async function attachChange(value, change, origin) {
    clearTimeout(timer);
    await persist(value);
    Object.assign(value, change);
    value.origin = origin;
    await touch(value);
    await persist(value);
    if (draft === value) {
      renderNoteTarget();
      $("note-sources").open = false;
      $("note").focus();
    }
  }
  action("note-page", async () => {
    const value = draft,
      target = tabId,
      expectedUrl = current?.pageUrl;
    const result = await request("page-context", {
      tabId: target,
      expectedUrl,
    });
    await attachChange(
      value,
      { materialId: "", clipId: "", source: result.source },
      { ...result.source, start: null, end: null, translation: "" },
    );
    status(
      result.truncated
        ? "已关联网页和选文前 16000 字符，笔记文字保持不变。"
        : result.source.quote
          ? "已关联选中文字和网页链接，笔记文字保持不变。"
          : "已关联网页链接，没有读取或复制表单内容。",
    );
  });
  action("note-detach", async () => {
    await attachChange(
      draft,
      { materialId: "", clipId: "", source: null },
      {
        kind: "none",
        title: "独立笔记",
        quote: "",
        url: "",
        start: null,
        end: null,
        translation: "",
      },
    );
    status("已取消出处关联，笔记文字仍保留。");
  });
  action("remember", async () => {
    const value = draft,
      cue = activeCue(),
      target = source(),
      anchor = cue
        ? { start: cue.start, end: cue.end, text: cue.text }
        : undefined;
    const anchors = selectionAnchors();
    const saved = await request("remember", {
      ...target,
      ...(anchors.length ? { anchors } : { anchor }),
    });
    const state = await C.store.readTables(["materials", "clips"]);
    const next = {
      materialId: saved.materialId,
      clipId: saved.clip.id,
      source: null,
    };
    await attachChange(value, next, C.noteOrigin(state, next));
    status(
      anchors.length
        ? `已把选中的 ${anchors.length} 句字幕作为笔记出处，原笔记文字保持不变。`
        : "已关联当前片段和时间点，原笔记文字保持不变。",
    );
  });
  $("selection-summary").addEventListener("click", () => {
    $("selection-review").hidden = false;
    if ($("selection-ai").open) closeAiDialog();
  });
  $("selection-review-close").addEventListener("click", () => {
    $("selection-review").hidden = true;
  });
  $("selection-ai-toggle").addEventListener("click", () => {
    $("selection-review").hidden = true;
    const dialog = $("selection-ai");
    if (dialog.open) {
      closeAiDialog();
      return;
    }
    dialog.showModal();
    dialog.scrollTop = 0;
    $("question").focus();
  });
  $("selection-ai-close").addEventListener("click", () => {
    if ($("selection-ai").open) closeAiDialog();
    $("selection-ai-toggle").focus();
  });
  $("selection-ai").addEventListener("click", (event) => {
    if (event.target !== $("selection-ai")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      closeAiDialog();
      $("selection-ai-toggle").focus();
    }
  });
  $("selection-ai").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAiDialog();
    $("selection-ai-toggle").focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($("selection-ai").open) {
      event.preventDefault();
      closeAiDialog();
      $("selection-ai-toggle").focus();
    } else if (!$("selection-review").hidden) {
      event.preventDefault();
      $("selection-review").hidden = true;
      $("selection-summary").focus();
    }
  });
  action("selection-clear", async () => clearSelection());
  action("selection-note", async () => {
    const anchors = selectionAnchors();
    C.assert(anchors.length, "请先选择字幕");
    const target = source(),
      saved = await request("remember", { ...target, anchors });
    const state = await C.store.readTables(["materials", "clips"]),
      next = {
        materialId: saved.materialId,
        clipId: saved.clip.id,
        source: null,
      };
    await attachChange(draft, next, C.noteOrigin(state, next));
    status(
      `已把选中的 ${anchors.length} 句字幕作为当前笔记出处，现在直接写你的理解。`,
    );
  });
  action("repeat-selection", async () => {
    const cues = selection();
    C.assert(cues.length, "请先选择字幕");
    return request("seek", {
      ...source(),
      start: cues[0].start,
      end: cues.at(-1).end,
    });
  });
  $("note-library").addEventListener("click", async (event) => {
    event.preventDefault();
    if (!draft) return;
    const selected = draft,
      url = $("note-library").href;
    try {
      await persist(selected);
      await chrome.tabs.create({ url });
    } catch (error) {
      status(error.message, true);
    }
  });
  action("repeat", () => {
    const cue = activeCue();
    C.assert(cue, "当前没有可重听的字幕");
    return request("seek", { ...source(), start: cue.start, end: cue.end });
  });
  action("follow", () => {
    quietUntil = 0;
    follow();
  });
  $("cues").addEventListener(
    "wheel",
    () => {
      quietUntil = Date.now() + 4000;
    },
    { passive: true },
  );
  $("cues").addEventListener(
    "touchstart",
    () => {
      quietUntil = Date.now() + 4000;
    },
    { passive: true },
  );
  action("enable-captions", () =>
    request("enable-captions", { ...source(), consent: true }).then(() => {
      $("caption-help").open = false;
      status("已请求原有双语字幕。字幕准备好后会自动出现在这里。");
    }),
  );
  function explainPayload() {
    const anchors = selectionAnchors();
    C.assert(anchors.length, "请先从实时对照中选择要解释的字幕");
    return {
      ...source(),
      anchors,
      question:
        $("question").value.trim() || "请解释当前片段的主要概念和含义。",
      engineId: $("engine").value,
    };
  }
  function invalidatePreview() {
    previewGeneration++;
    preview = null;
    $("preview-content").textContent =
      "展开后冻结所选字幕并预览发送范围，不调用模型。";
    $("explain").textContent = "解释选中字幕";
    controls();
  }
  $("preview").addEventListener("toggle", async () => {
    if (!$("preview").open) {
      invalidatePreview();
      return;
    }
    const previewVersion = ++previewGeneration;
    try {
      const payload = explainPayload();
      const planned = await request("preview", payload);
      if (!$("preview").open || previewVersion !== previewGeneration) return;
      preview = { payload, planned };
      $("preview-content").textContent =
        `${planned.title}\n${planned.engine.name} / ${planned.engine.model}\n发送到：${planned.engine.origin}\n${JSON.stringify(planned.data, null, 2)}`;
      $("explain").textContent = "解释预览中的字幕";
      controls();
    } catch (error) {
      if (previewVersion !== previewGeneration) return;
      preview = null;
      $("preview-content").textContent = error.message;
    }
  });
  for (const id of ["question", "engine"])
    $(id).addEventListener("input", () => {
      invalidatePreview();
      $("preview").open = false;
    });
  action("explain", async () => {
    const payload = preview
      ? { ...preview.payload, frozen: preview.planned.frozen }
      : explainPayload();
    status("正在解释这段内容；你可以继续观看，结果会绑定原时间点。");
    const result = await request("explain", { ...payload, consent: true });
    linkLibrary(result.record.materialId);
    $("answer").hidden = false;
    $("answer-title").textContent = result.record.question;
    $("answer-anchor").textContent =
      `${result.title} · ${C.timeLabel(result.start)} — ${C.timeLabel(result.end)}\n${result.text}`;
    $("answer-video").textContent = result.record.inVideo;
    $("answer-background").textContent = result.record.background || "无";
    $("answer-uncertainty").textContent = result.record.uncertainty || "无";
    status("解释和字幕引用已保存在本机资料库");
    invalidatePreview();
    $("preview").open = false;
  });
  async function loadEngines() {
    try {
      const choices = await request("engines"),
        previous = $("engine").value;
      $("engine").replaceChildren();
      for (const choice of choices)
        $("engine").add(
          new Option(`${choice.name} · ${choice.model}`, choice.id),
        );
      if (!choices.length)
        $("engine").add(new Option("请先配置 BYOK AI 引擎", ""));
      if (choices.some((choice) => choice.id === previous))
        $("engine").value = previous;
      controls();
    } catch (error) {
      status(error.message, true);
    }
  }
  chrome.tabs.onActivated.addListener((info) => {
    if (!pinned && info.windowId === windowId)
      void detectTab()
        .then(poll)
        .catch((error) => status(error.message));
  });
  chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (!pinned && change.url && tab.active && tab.windowId === windowId)
      void detectTab()
        .then(poll)
        .catch((error) => status(error.message));
    if (id === tabId && change.url) {
      generation++;
      render(null);
      invalidatePreview();
      void poll();
    }
  });
  chrome.tabs.onRemoved.addListener((id) => {
    if (id === tabId && !pinned) void detectTab().then(poll);
  });
  addEventListener("focus", () => {
    void loadEngines();
    void detectTab()
      .then(poll)
      .catch((error) => status(error.message));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(timer);
      void persist(draft).catch(() => {});
    } else {
      void detectTab()
        .then(poll)
        .catch((error) => status(error.message));
    }
  });
  addEventListener("pageshow", () => {
    closed = false;
    void poll();
  });
  addEventListener("pagehide", () => {
    closed = true;
    clearTimeout(timer);
    void persist(draft).catch(() => {});
  });
  addEventListener("beforeunload", (event) => {
    if (C.notes.dirty(draft)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  C.studyPanel = {
    request,
    poll,
    get current() {
      return current;
    },
    get draft() {
      return draft;
    },
    flush: () => persist(draft),
  };
  (async () => {
    windowId = (await chrome.windows.getCurrent()).id;
    C.notes.setOwner((await request("owner")).documentId);
    await Promise.all([recoverDrafts(), loadEngines()]);
    await detectTab();
    initialized = true;
    await poll();
    setInterval(() => {
      void poll();
    }, 400);
  })().catch((error) => status(error.message, true));
})();
