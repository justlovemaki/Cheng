(() => {
  "use strict";
  const C = globalThis.ChengLearning,
    W = C.workspace;
  const { $, element: el, button, bind, request, notify } = W;
  let pending,
    pendingTranslation,
    lastMaterial = "",
    updateConceptButton = () => {};
  const invalidate = () => {
    pending = null;
    pendingTranslation = null;
    updateConceptButton();
    $("concept-preview-data").textContent = "";
    if ($("translation-send")) {
      $("translation-send").disabled = true;
      $("translation-preview-data").textContent = "";
    }
  };
  function build() {
    const section = $("concept-section");
    section.append(
      el("h2", "理解当前内容"),
      el(
        "p",
        "先在字幕区选择 1–10 行，再提出问题。解释只使用选中字幕及附近上下文，不会发送你的笔记。",
        "muted",
      ),
    );
    const form = el("div", undefined, "concept-form");
    const mode = el("select");
    mode.id = "concept-mode";
    mode.setAttribute("aria-label", "解释方式");
    for (const [value, label] of [
      ["concept", "解释概念"],
      ["logic", "拆解逻辑"],
      ["compare", "对比概念"],
    ])
      mode.add(new Option(label, value));
    const question = el("input");
    question.id = "concept-question";
    question.placeholder = "例如：这里的 backpressure 解决什么问题？";
    question.setAttribute("aria-label", "概念或问题");
    const engine = el("select");
    engine.id = "concept-engine";
    engine.setAttribute("aria-label", "AI 引擎");
    const conceptPayload = () => ({
      materialId: W.materialId,
      transcriptId: W.transcript?.id,
      cueIds: W.selected,
      mode: mode.value,
      question:
        question.value.trim() || "请解释所选字幕的主要概念、逻辑和含义。",
      engineId: engine.value,
    });
    const preview = button("预览发送内容", async () => {
      const payload = conceptPayload();
      invalidate();
      const planned = await request("concept-preview", payload);
      pending = { ...payload, previewHash: planned.previewHash };
      $("concept-preview-data").textContent =
        `${planned.engine.name} / ${planned.engine.model}\n发送到：${planned.engine.origin}\n\n${JSON.stringify(planned.data, null, 2)}`;
      $("concept-send").disabled = false;
      $("concept-preview-box").open = true;
      notify("请核对发送内容，确认后才会调用 AI；可能产生供应商费用");
    });
    preview.id = "concept-preview";
    const send = button(
      "解释选中字幕",
      async () => {
        const payload = conceptPayload();
        const planned = pending || (await request("concept-preview", payload));
        invalidate();
        notify("正在请求所选 AI 引擎…");
        await request("explain", {
          ...payload,
          previewHash: planned.previewHash,
          consent: true,
        });
        await W.refresh();
        notify("解释及字幕引用已保存到本机");
      },
      "primary",
    );
    send.id = "concept-send";
    updateConceptButton = () => {
      const selected = W.selected.length,
        ready = selected > 0 && selected <= 10 && Boolean(engine.value);
      send.disabled = !ready;
      send.title = !selected
        ? "请先在字幕区勾选 1–10 行"
        : !engine.value
          ? "请先配置并选择 BYOK AI 引擎"
          : selected > 10
            ? "一次最多解释 10 行字幕"
            : "直接解释；发送预览可选";
    };
    updateConceptButton();
    form.append(mode, question, engine, preview, send);
    const details = el("details");
    details.id = "concept-preview-box";
    details.append(el("summary", "发送范围与内容预览"));
    const data = el("pre");
    data.id = "concept-preview-data";
    details.append(data);
    const list = el("div");
    list.id = "concept-list";
    section.append(
      form,
      details,
      el(
        "p",
        "AI 解释不等于原论文证据。补充知识与报告内容分开保存，正式引用请回到原始资料核实。",
        "privacy",
      ),
      list,
    );
    for (const node of [mode, question, engine])
      node.addEventListener("input", invalidate);

    const translationTools = el("div", undefined, "toolbar reading-toolbar");
    const target = el("select");
    target.id = "learning-target-language";
    target.setAttribute("aria-label", "精读翻译目标语言");
    for (const [code, label] of [
      ["zh-CN", "简体中文"],
      ["zh-TW", "繁體中文"],
      ["en", "English"],
      ["ja", "日本語"],
      ["ko", "한국어"],
      ["de", "Deutsch"],
      ["fr", "Français"],
      ["es", "Español"],
    ])
      target.add(new Option(label, code));
    target.addEventListener("change", invalidate);
    const translatePreview = button("预览选中字幕翻译", async () => {
      const payload = {
        materialId: W.materialId,
        transcriptId: W.transcript?.id,
        cueIds: W.selected,
        engineId: engine.value,
        to: target.value,
      };
      invalidate();
      const planned = await request("translation-preview", payload);
      pendingTranslation = { ...payload, previewHash: planned.previewHash };
      $("translation-preview-data").textContent =
        `${planned.engine.name} / ${planned.engine.model}\n发送到：${planned.engine.origin}\n${JSON.stringify(planned.data, null, 2)}`;
      $("translation-preview-box").open = true;
      $("translation-send").disabled = false;
    });
    translatePreview.id = "translation-preview";
    const translateSend = button("确认发送并翻译", async () => {
      C.assert(pendingTranslation, "请先预览翻译请求");
      const payload = pendingTranslation;
      invalidate();
      notify("正在翻译所选字幕…");
      await request("translate-selected", { ...payload, consent: true });
      await W.refresh();
      notify("译文已保存为新版本，原字幕和已有笔记保持不变");
    });
    translateSend.id = "translation-send";
    translateSend.disabled = true;
    translationTools.append(target, translatePreview, translateSend);
    const translationDetails = el("details");
    translationDetails.id = "translation-preview-box";
    translationDetails.append(
      el("summary", "翻译发送预览（使用下方所选 AI 引擎，最多 20 行）"),
    );
    const translationData = el("pre");
    translationData.id = "translation-preview-data";
    translationDetails.append(translationData);
    $("reading-controls").append(translationTools, translationDetails);

    const glossary = $("glossary-section");
    glossary.append(
      el("h2", "专业术语表"),
      el(
        "p",
        "全局术语适用于所有视频；当前资料术语优先。同名原词再次保存会更新译法，影响后续 AI 翻译，不会改写已保存字幕。",
        "muted",
      ),
    );
    const terms = el("div", undefined, "concept-form");
    for (const [id, placeholder] of [
      ["glossary-source", "原词，如 backpressure"],
      ["glossary-target", "固定译法，如 背压"],
      ["glossary-aliases", "别名，用 | 分隔"],
      ["glossary-note", "备注（会随匹配术语发送给 AI）"],
    ]) {
      const input = el("input");
      input.id = id;
      input.placeholder = placeholder;
      input.setAttribute("aria-label", placeholder);
      terms.append(input);
    }
    const scope = el("select");
    scope.id = "glossary-scope";
    scope.setAttribute("aria-label", "术语保存及导入范围");
    scope.add(new Option("全局术语", "global"));
    scope.add(new Option("当前资料", "current"));
    terms.append(scope);
    const save = button(
      "保存术语",
      async () => {
        await request("save-glossary", {
          scope: scope.value === "current" ? W.materialId : "",
          rows: [
            {
              source: $("glossary-source").value.trim(),
              target: $("glossary-target").value.trim(),
              aliases: $("glossary-aliases")
                .value.split("|")
                .map((s) => s.trim())
                .filter(Boolean),
              note: $("glossary-note").value,
            },
          ],
        });
        for (const id of [
          "glossary-source",
          "glossary-target",
          "glossary-aliases",
          "glossary-note",
        ])
          $(id).value = "";
        invalidate();
        await W.refresh();
        notify("术语已保存，下一次 AI 翻译会使用新译法");
      },
      "primary",
    );
    save.id = "glossary-save";
    terms.append(save);
    glossary.append(terms);
    const tools = el("div", undefined, "toolbar");
    const input = el("input");
    input.type = "file";
    input.accept = ".csv,.json";
    input.hidden = true;
    input.id = "glossary-file";
    tools.append(
      button("导入 CSV / JSON 到所选范围", () => input.click()),
      button("导出当前范围 CSV", () => {
        const rows = W.state.glossary.filter(
          (row) =>
            row.scope === (scope.value === "current" ? W.materialId : ""),
        );
        W.download(
          C.exportGlossaryCsv(rows),
          "Cheng-glossary.csv",
          "text/csv;charset=utf-8",
        );
      }),
      button("导出当前范围 JSON", () => {
        const rows = W.state.glossary.filter(
          (row) =>
            row.scope === (scope.value === "current" ? W.materialId : ""),
        );
        W.download(
          JSON.stringify(rows, null, 2),
          "Cheng-glossary.json",
          "application/json",
        );
      }),
    );
    input.addEventListener("change", async () => {
      try {
        const file = input.files[0];
        if (!file) return;
        C.assert(file.size <= 4 * 1024 * 1024, "术语文件不能超过 4 MB");
        const rows = C.parseGlossary(
          await file.text(),
          file.name.toLowerCase().endsWith(".json") ? "json" : "csv",
        );
        const scopeId = scope.value === "current" ? W.materialId : "";
        if (
          !confirm(
            `将 ${rows.length} 条术语导入${scopeId ? "当前资料" : "全局"}，同名原词会更新译法。是否继续？`,
          )
        )
          return;
        await request("save-glossary", { rows, scope: scopeId });
        invalidate();
        await W.refresh();
        notify("术语已导入");
      } catch (error) {
        notify(error.message, true);
      } finally {
        input.value = "";
      }
    });
    const termList = el("div");
    termList.id = "glossary-list";
    glossary.append(tools, input, termList);
  }
  async function refreshEngines() {
    try {
      const engines = await request("engines"),
        selector = $("concept-engine"),
        previous = selector.value;
      selector.replaceChildren();
      for (const engine of engines)
        selector.add(new Option(`${engine.name} · ${engine.model}`, engine.id));
      if (!engines.length) selector.add(new Option("请先配置 BYOK 引擎", ""));
      if (engines.some((engine) => engine.id === previous))
        selector.value = previous;
      updateConceptButton();
    } catch (error) {
      notify(error.message, true);
    }
  }
  function render() {
    if (!W.material) return;
    $("concept-section").hidden = false;
    $("glossary-section").hidden = false;
    if (lastMaterial !== W.materialId) {
      invalidate();
      $("concept-question").value = "";
      lastMaterial = W.materialId;
    }
    const list = $("concept-list");
    list.replaceChildren();
    for (const record of W.state.concepts
      .filter((row) => row.materialId === W.materialId)
      .sort((a, b) => b.createdAt - a.createdAt)) {
      const card = el("article", undefined, "concept-card");
      card.append(el("h3", record.question));
      for (const [label, value] of [
        ["视频中的内容", record.inVideo],
        ["AI 补充背景", record.background],
        ["尚不能确认", record.uncertainty],
      ])
        card.append(el("strong", label), el("p", value || "无"));
      const source = W.state.transcripts.find(
        (row) => row.id === record.transcriptId,
      );
      const citations = el("div", undefined, "toolbar");
      for (const cueId of record.citations) {
        const cue = source?.cues.find((row) => row.id === cueId);
        if (!cue) continue;
        citations.append(
          button(`${C.timeLabel(cue.start)} · ${cue.text.slice(0, 55)}`, () =>
            W.seek(cue.start),
          ),
        );
      }
      card.append(
        citations,
        el(
          "small",
          `${record.engine} / ${record.model} · ${new Date(record.createdAt).toLocaleString()}${source?.id !== W.transcript?.id ? " · 来自旧字幕版本" : ""}`,
          "muted",
        ),
        button("删除解释", async () => {
          if (!confirm("删除此解释？")) return;
          await request("delete-concept", { id: record.id });
          await W.refresh();
        }),
      );
      list.append(card);
    }
    const glossaryList = $("glossary-list");
    glossaryList.replaceChildren();
    for (const row of W.state.glossary.filter(
      (row) => !row.scope || row.scope === W.materialId,
    )) {
      const line = el("div", undefined, "glossary-row");
      line.append(
        el("strong", row.source),
        el("span", `→ ${row.target}`),
        el(
          "small",
          `${row.scope ? "当前资料" : "全局"}${row.aliases.length ? ` · ${row.aliases.join(" / ")}` : ""}`,
          "muted",
        ),
        button("编辑", () => {
          $("glossary-source").value = row.source;
          $("glossary-target").value = row.target;
          $("glossary-aliases").value = row.aliases.join("|");
          $("glossary-note").value = row.note;
          $("glossary-scope").value = row.scope ? "current" : "global";
        }),
        button("删除", async () => {
          if (!confirm("删除此术语？")) return;
          await request("delete-glossary", { id: row.id });
          invalidate();
          await W.refresh();
        }),
      );
      glossaryList.append(line);
    }
  }
  build();
  refreshEngines();
  document.addEventListener("cheng:workspace-render", render);
  document.addEventListener("cheng:selection-change", invalidate);
  addEventListener("focus", () => {
    invalidate();
    refreshEngines();
  });
})();
