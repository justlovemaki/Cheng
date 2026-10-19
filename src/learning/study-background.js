/* Live study is an extension-owned native side panel, never a page-readable iframe. */
(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const PREFIX = "cheng:study:";
  const isPanel = (sender) => {
    if (sender.id !== chrome.runtime.id || !sender.url) return false;
    const own = new URL(chrome.runtime.getURL("study.html")),
      url = new URL(sender.url);
    return (
      url.protocol === own.protocol &&
      url.host === own.host &&
      url.pathname === own.pathname
    );
  };
  const isPage = (sender) =>
    sender.id === chrome.runtime.id &&
    Number.isInteger(sender.tab?.id) &&
    /^(?:https?|file):\/\//.test(sender.url || "");
  async function live(message) {
    const idle = {
      available: false,
      tabId: message.tabId || 0,
      title: "学习笔记",
      pageUrl: "",
      message: "可以直接写笔记；关联出处是可选的。",
    };
    if (!Number.isInteger(message.tabId) || message.tabId <= 0) return idle;
    let tab;
    try {
      tab = await chrome.tabs.get(message.tabId);
    } catch {
      return idle;
    }
    if (!/^https?:\/\//.test(tab.url || ""))
      return {
        ...idle,
        title: tab.title || "学习笔记",
        message: "此页面暂不支持关联出处，但可以正常记录独立笔记。",
      };
    let results;
    try {
      results = await C.runBridge(tab.id, undefined, "live");
    } catch {
      results = [];
    }
    const pageUrl = C.safeNoteUrl(tab.url);
    const candidates = results.filter(
      (row) => row.result?.sourceUrl && Array.isArray(row.result.cues),
    );
    candidates.sort(
      (a, b) => (Number(b.result.score) || 0) - (Number(a.result.score) || 0),
    );
    if (!candidates.length)
      return {
        available: false,
        tabId: tab.id,
        title: tab.title || "当前页面",
        pageUrl,
        message: "当前网页可直接记笔记，也可以选中文字后关联出处。",
      };
    const frame = candidates[0],
      value = frame.result;
    const sourceUrl = C.safeUrl(value.sourceUrl),
      platform = C.text(value.platform || "web", 80),
      sourceId = C.text(value.sourceId || "", 160);
    C.assert(value.cues.length <= 10, "实时字幕窗口过大");
    const cues = value.cues.map(
      (cue, index) =>
        C.record("transcripts", {
          ...C.stamp(),
          materialId: "live",
          language: "auto",
          origin: "live",
          cues: [
            {
              id: `live-${index}`,
              start: cue.start,
              end: cue.end,
              text: cue.text,
              repaired: cue.repaired || "",
              translation: cue.translation || "",
            },
          ],
        }).cues[0],
    );
    const time = C.number(value.currentTime);
    return {
      available: true,
      pageUrl,
      tabId: tab.id,
      frameId: frame.frameId,
      sourceUrl,
      platform,
      sourceId,
      identity: C.identity(sourceUrl, platform, sourceId),
      title: C.text(value.title || tab.title || "当前视频", 500),
      currentTime: time,
      paused: value.paused === true,
      total: Math.min(30000, Math.max(0, Number(value.total) || 0)),
      cues: cues.map((cue) => ({
        ...cue,
        active: cue.start <= time && cue.end > time,
      })),
    };
  }
  async function pageContext(message) {
    C.assert(Number.isInteger(message.tabId), "请先切换到要关联的网页");
    const tab = await chrome.tabs.get(message.tabId);
    C.assert(/^https?:\/\//.test(tab.url || ""), "仅能关联普通 HTTP(S) 网页");
    if (message.expectedUrl)
      C.assert(
        C.safeNoteUrl(tab.url) === message.expectedUrl,
        "网页已切换，请重新关联",
      );
    let frames = [];
    try {
      frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "ISOLATED",
        func: () => {
          const active = document.activeElement,
            selection = window.getSelection();
          let container = selection?.rangeCount
            ? selection.getRangeAt(0).commonAncestorContainer
            : null;
          if (container?.nodeType !== 1) container = container?.parentElement;
          const editable =
            !!active?.matches?.(
              'input,textarea,[contenteditable]:not([contenteditable="false"])',
            ) ||
            !!container?.closest?.(
              'input,textarea,[contenteditable]:not([contenteditable="false"])',
            );
          const value = editable ? "" : String(selection || "").trim();
          return {
            url: location.href,
            title: document.title.slice(0, 500),
            quote: value.slice(0, 16000),
            truncated: value.length > 16000,
            editable,
            activeFrame: active?.tagName === "IFRAME",
          };
        },
      });
    } catch {}
    const main = frames.find((frame) => frame.frameId === 0),
      quoted = frames.filter(
        (frame) => frame.result?.quote && !frame.result.editable,
      );
    const chosen = main?.result?.editable
      ? main
      : (main?.result?.activeFrame
          ? quoted.find((frame) => frame.frameId !== 0)
          : quoted.find((frame) => frame.frameId === 0)) ||
        quoted[0] ||
        main;
    const value = chosen?.result;
    if (message.expectedUrl)
      C.assert(
        C.safeNoteUrl((await chrome.tabs.get(tab.id)).url) ===
          message.expectedUrl,
        "网页已切换，请重新关联",
      );
    return {
      source: C.noteSource({
        kind: "web",
        url: /^https?:\/\//.test(value?.url || "") ? value.url : tab.url,
        title: value?.title || tab.title || "网页",
        quote: value?.quote || "",
      }),
      truncated: value?.truncated === true,
    };
  }
  async function freeze(message) {
    C.text(message.identity, 2000);
    C.assert(
      Number.isInteger(message.tabId) && Number.isInteger(message.frameId),
      "视频连接已变化，请稍后重试",
    );
    const captured = await C.capture(message.tabId, message.frameId);
    C.assert(
      C.identity(captured.sourceUrl, captured.platform, captured.sourceId) ===
        message.identity,
      "视频已切换，本次操作未应用到其他视频",
    );
    const saved = await C.store.saveCapture(captured);
    const { transcripts } = await C.store.readTables(["transcripts"]);
    const transcript = transcripts.find((row) => row.id === saved.transcriptId);
    let cues = [];
    const anchors = Array.isArray(message.anchors)
      ? message.anchors
      : message.anchor
        ? [message.anchor]
        : [];
    C.assert(anchors.length <= 10, "一次最多处理 10 句字幕");
    for (const anchor of anchors) {
      C.text(anchor.text, 8000);
      C.number(anchor.start);
      C.number(anchor.end);
      const cue = transcript?.cues.find(
        (row) =>
          row.start === anchor.start &&
          row.end === anchor.end &&
          row.text === anchor.text,
      );
      C.assert(cue, "所选字幕已经更新，请重新选择");
      cues.push(cue);
    }
    C.assert(
      new Set(cues.map((cue) => cue.id)).size === cues.length,
      "不能重复选择同一句字幕",
    );
    if (!cues.length) {
      const cue = transcript?.cues.find(
        (row) =>
          row.start <= captured.currentTime && row.end > captured.currentTime,
      );
      if (cue) cues = [cue];
    }
    C.openTargets.set(saved.materialId, {
      tabId: message.tabId,
      frameId: message.frameId,
    });
    return { saved, transcript, cue: cues[0], cues, captured };
  }
  async function handle(action, message, sender) {
    C.assert(isPanel(sender), "实时学习操作仅允许来自澄的侧边学习面板");
    switch (action) {
      case "owner":
        return { documentId: sender.documentId || "" };
      case "live":
        return live(message);
      case "page-context":
        return pageContext(message);
      case "engines":
        return C.handleLearningAction("engines", {}, sender);
      case "remember": {
        const { saved, cue, cues, captured } = await freeze(message);
        const clip = await C.store.mutate((state) => {
          // Repeated clicks on the same snapshot reuse the clip rather than cluttering the library.
          const start = cues.length
              ? Math.min(...cues.map((cue) => cue.start))
              : captured.currentTime,
            end = cues.length
              ? Math.max(...cues.map((cue) => cue.end))
              : start + 5;
          return (
            state.clips.find(
              (row) =>
                row.materialId === saved.materialId &&
                row.transcriptId === saved.transcriptId &&
                row.start === start &&
                row.end === end &&
                row.cueIds.length === cues.length &&
                row.cueIds.every((id, index) => id === cues[index]?.id),
            ) ||
            C.store.createClip(
              state,
              saved.materialId,
              saved.transcriptId,
              cues.map((cue) => cue.id),
              captured.currentTime,
              "note",
            )
          );
        });
        return { materialId: saved.materialId, clip, title: captured.title };
      }
      case "preview":
      case "explain": {
        C.assert(
          action !== "explain" || message.consent === true,
          "请确认将当前字幕和附近上下文发送给所选 AI",
        );
        let frozen;
        if (message.frozen) {
          const selection = message.frozen;
          C.id(selection.materialId);
          C.id(selection.transcriptId);
          const cueIds =
            selection.cueIds || (selection.cueId ? [selection.cueId] : []);
          C.assert(
            Array.isArray(cueIds) && cueIds.length > 0 && cueIds.length <= 10,
            "预览字幕范围无效",
          );
          cueIds.forEach(C.id);
          const state = await C.store.readTables(["materials", "transcripts"]);
          const material = state.materials.find(
            (row) => row.id === selection.materialId,
          );
          const transcript = state.transcripts.find(
            (row) =>
              row.id === selection.transcriptId &&
              row.materialId === selection.materialId,
          );
          const cues = cueIds.map((id) =>
            transcript?.cues.find((row) => row.id === id),
          );
          C.assert(
            material?.identity === message.identity && cues.every(Boolean),
            "预览关联的字幕已不存在，请重新预览",
          );
          frozen = {
            saved: { materialId: material.id, transcriptId: transcript.id },
            cue: cues[0],
            cues,
            captured: { title: material.title },
          };
        } else frozen = await freeze(message);
        const { saved, cue, cues, captured } = frozen;
        C.assert(cue, "当前没有可解释的字幕。请先开启原视频字幕或生成 AI 字幕");
        const request = {
          materialId: saved.materialId,
          transcriptId: saved.transcriptId,
          cueIds: cues.map((cue) => cue.id),
          mode: "concept",
          question: C.text(
            message.question || "请解释当前片段的主要概念和含义。",
            2000,
          ),
          engineId: message.engineId,
        };
        const planned = await C.learningAi.preview(request);
        if (message.frozen)
          C.assert(
            message.frozen.previewHash === planned.previewHash,
            "预览、问题或引擎已变化，请重新展开预览",
          );
        if (action === "preview")
          return {
            ...planned,
            title: captured.title,
            frozen: {
              materialId: saved.materialId,
              transcriptId: saved.transcriptId,
              cueIds: cues.map((cue) => cue.id),
              previewHash: planned.previewHash,
            },
          };
        const record = await C.learningAi.explain({
          ...request,
          consent: true,
          previewHash: planned.previewHash,
        });
        return {
          record,
          title: captured.title,
          start: Math.min(...cues.map((cue) => cue.start)),
          end: Math.max(...cues.map((cue) => cue.end)),
          text: cues.map((cue) => cue.text).join("\n"),
          source: {
            tabId: message.tabId,
            frameId: message.frameId,
            identity: message.identity,
          },
        };
      }
      case "seek": {
        C.number(message.start);
        if (message.end !== undefined)
          C.assert(C.number(message.end) > message.start, "片段范围无效");
        const results = await C.runBridge(
          message.tabId,
          message.frameId,
          "seek",
          {
            identity: C.text(message.identity, 2000),
            start: message.start,
            end: message.end,
          },
        );
        C.assert(
          results.some((row) => row.result?.ok),
          "播放器未就绪或视频已切换，无法跳转",
        );
        return true;
      }
      case "enable-captions": {
        C.assert(message.consent === true, "请确认按原引擎启用双语字幕");
        const results = await C.runBridge(
          message.tabId,
          message.frameId,
          "enableCaptions",
          { identity: C.text(message.identity, 2000) },
        );
        C.assert(
          results.some((row) => row.result?.ok),
          "当前播放器尚未就绪，请在原视频中开启字幕",
        );
        return true;
      }
      default:
        throw new Error("未知实时学习操作");
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (typeof message?.type !== "string" || !message.type.startsWith(PREFIX))
      return false;
    const action = message.type.slice(PREFIX.length);
    if (action === "open") {
      // Call open immediately in the original user-gesture task; do not await storage/tab lookups first.
      try {
        C.assert(isPage(sender), "请从原网页的右侧吸附栏打开学习面板");
        C.assert(
          chrome.sidePanel?.open,
          "当前浏览器不支持侧边学习面板，请使用 Chrome / Edge 116 或更高版本",
        );
        Promise.resolve(
          chrome.sidePanel.open({ windowId: sender.tab.windowId }),
        ).then(
          () => respond({ ok: true, data: { opened: true } }),
          (error) => respond({ ok: false, error: error.message }),
        );
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
      return true;
    }
    Promise.resolve()
      .then(() => handle(action, message, sender))
      .then(
        (data) => respond({ ok: true, data }),
        (error) =>
          respond({ ok: false, error: error?.message || String(error) }),
      );
    return true;
  });
  C.study = { isPanel, live, pageContext, freeze, handle };
})();
