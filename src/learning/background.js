(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const PREFIX = "cheng:learning:";
  const trustedPage = (sender) => {
    if (sender.id !== chrome.runtime.id || !sender.url) return false;
    const url = new URL(sender.url);
    const own = new URL(chrome.runtime.getURL("/"));
    return (
      url.protocol === own.protocol &&
      url.host === own.host &&
      ["/workspace.html", "/popup.html"].includes(url.pathname)
    );
  };
  const pageSender = (sender) =>
    sender.id === chrome.runtime.id &&
    sender.tab?.id &&
    /^https?:\/\//.test(sender.url || "");
  const runBridge = async (tabId, frameId, command, argument) => {
    const target = Number.isInteger(frameId)
      ? { tabId, frameIds: [frameId] }
      : { tabId, allFrames: true };
    return chrome.scripting.executeScript({
      target,
      world: "MAIN",
      func: (operation, payload) =>
        globalThis.chengVideoBridge?.[operation]?.(payload) ?? null,
      args: [command, argument || null],
    });
  };
  async function capture(tabId, frameId) {
    C.assert(Number.isInteger(tabId) && tabId > 0, "请先选择一个视频标签页");
    const tab = await chrome.tabs.get(tabId);
    C.assert(
      /^https?:\/\//.test(tab.url || ""),
      "此页面不能读取视频，请选择普通网页",
    );
    const results = await runBridge(tabId, frameId, "snapshot");
    const candidates = results.filter(
      (item) => item.result?.sourceUrl && Array.isArray(item.result.cues),
    );
    candidates.sort(
      (a, b) => (Number(b.result.score) || 0) - (Number(a.result.score) || 0),
    );
    C.assert(
      candidates.length,
      "未检测到视频或音频，请刷新原页面并开启播放器后重试",
    );
    return { ...candidates[0].result, tabId, frameId: candidates[0].frameId };
  }
  async function openWorkspace(materialId = "", clipId = "") {
    const url = new URL(chrome.runtime.getURL("workspace.html"));
    if (materialId) url.searchParams.set("material", materialId);
    if (clipId) url.searchParams.set("clip", clipId);
    return chrome.tabs.create({ url: url.href });
  }
  const openTargets = new Map();
  async function seek(materialId, start, end) {
    C.number(start);
    if (end !== undefined) C.assert(C.number(end) > start, "片段时间范围无效");
    const state = await C.store.snapshot();
    const material = state.materials.find((row) => row.id === materialId);
    C.assert(material?.sourceUrl, "本地媒体请在工作台中重新关联文件");
    let targets = [];
    const remembered = openTargets.get(materialId);
    if (remembered) targets.push(remembered);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        if (
          C.safeUrl(tab.url) === material.sourceUrl &&
          !targets.some((item) => item.tabId === tab.id)
        )
          targets.push({ tabId: tab.id });
      } catch {}
    }
    for (const target of targets) {
      try {
        const results = await runBridge(target.tabId, target.frameId, "seek", {
          identity: material.identity,
          start,
          end,
        });
        if (results.some((item) => item.result?.ok)) {
          await chrome.tabs.update(target.tabId, { active: true });
          const tab = await chrome.tabs.get(target.tabId);
          await chrome.windows.update(tab.windowId, { focused: true });
          return { opened: true };
        }
      } catch {}
    }
    // Reopened pages load asynchronously. Poll with identity checks; never seek a different SPA item.
    const tab = await chrome.tabs.create({ url: material.sourceUrl });
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const results = await runBridge(tab.id, undefined, "seek", {
          identity: material.identity,
          start,
          end,
        });
        const matched = results.find((item) => item.result?.ok);
        if (matched) {
          openTargets.set(materialId, {
            tabId: tab.id,
            frameId: matched.frameId,
          });
          return { opened: true };
        }
      } catch {}
    }
    throw new Error(
      "已打开来源页面，但播放器尚未就绪。开始播放后可再次点击时间戳",
    );
  }
  async function handle(message, sender) {
    const action = message.type.slice(PREFIX.length);
    if (action === "record-progress" && pageSender(sender)) {
      const results = await runBridge(
        sender.tab.id,
        sender.frameId,
        "progress",
      );
      const info = results.find((item) => item.result?.sourceUrl)?.result;
      if (!info) return false;
      const key = C.identity(info.sourceUrl, info.platform, info.sourceId);
      const { materials } = await C.store.readTables(["materials"]);
      if (!materials.some((row) => row.identity === key)) return false;
      C.number(info.currentTime);
      return C.store.mutate((state) => {
        state.materials = state.materials.map((row) =>
          row.identity === key
            ? { ...row, currentTime: info.currentTime, updatedAt: Date.now() }
            : row,
        );
        return true;
      });
    }
    if (action === "open" && pageSender(sender)) {
      await openWorkspace();
      return true;
    }
    if (
      ["save-current", "clip-current"].includes(action) &&
      pageSender(sender)
    ) {
      const captured = await capture(sender.tab.id, sender.frameId);
      const saved = await C.store.saveCapture(
        captured,
        action === "clip-current",
      );
      openTargets.set(saved.materialId, {
        tabId: sender.tab.id,
        frameId: sender.frameId,
      });
      await openWorkspace(saved.materialId, saved.clipId);
      return saved;
    }
    C.assert(trustedPage(sender), "仅允许在澄的工作台中管理学习资料");
    switch (action) {
      case "owner":
        return { documentId: sender.documentId || "" };
      case "snapshot":
        return C.store.snapshot();
      case "open":
        await openWorkspace(message.materialId ? C.id(message.materialId) : "");
        return true;
      case "recent":
        return (await C.store.snapshot()).materials
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 3)
          .map(({ id, title }) => ({ id, title }));
      case "tabs":
        return (await chrome.tabs.query({}))
          .filter((tab) => /^https?:\/\//.test(tab.url || ""))
          .map((tab) => ({ id: tab.id, title: tab.title || tab.url }));
      case "capture": {
        const captured = await capture(message.tabId);
        const saved = await C.store.saveCapture(
          captured,
          Boolean(message.makeClip),
        );
        openTargets.set(saved.materialId, {
          tabId: captured.tabId,
          frameId: captured.frameId,
        });
        return saved;
      }
      case "clip":
        return C.store.mutate((state) =>
          C.store.createClip(
            state,
            C.id(message.materialId),
            message.transcriptId || "",
            message.cueIds || [],
            message.time || 0,
          ),
        );
      case "import-subtitles":
        return C.store.importTranscript(message.input);
      case "activate-transcript":
        return C.store.mutate((state) => {
          C.assert(
            state.transcripts.some(
              (row) =>
                row.id === message.transcriptId &&
                row.materialId === message.materialId,
            ),
            "字幕版本不存在",
          );
          state.materials = state.materials.map((row) =>
            row.id === message.materialId
              ? {
                  ...row,
                  activeTranscriptId: message.transcriptId,
                  updatedAt: Date.now(),
                }
              : row,
          );
          return true;
        });
      case "progress":
        return C.store.mutate((state) => {
          C.number(message.time);
          state.materials = state.materials.map((row) =>
            row.id === message.materialId
              ? { ...row, currentTime: message.time, updatedAt: Date.now() }
              : row,
          );
          return true;
        });
      case "delete-clip":
        return C.store.mutate((state) => {
          C.id(message.id);
          C.assert(
            !state.notes.some((row) => row.clipId === message.id) &&
              !state.attachments.some((row) => row.clipId === message.id),
            "片段仍被笔记或截图引用，不能删除",
          );
          state.clips = state.clips.filter((row) => row.id !== message.id);
          return true;
        });
      case "note":
        return C.store.saveNote(message.note);
      case "delete-note":
        return C.store.removeNote(message.id);
      case "delete-material":
        return C.store.removeMaterial(C.id(message.id));
      case "restore":
        return C.store.restore(message.data, message.mode);
      case "seek":
        return seek(message.materialId, message.start, message.end);
      default:
        if (C.handleLearningAction)
          return C.handleLearningAction(action, message, sender);
        throw new Error("未知的学习操作");
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (typeof message?.type !== "string" || !message.type.startsWith(PREFIX))
      return false;
    Promise.resolve()
      .then(() => handle(message, sender))
      .then(
        (data) => respond({ ok: true, data }),
        (error) =>
          respond({ ok: false, error: error?.message || String(error) }),
      );
    return true;
  });
  Object.assign(C, { trustedPage, runBridge, capture, openTargets });
})();
