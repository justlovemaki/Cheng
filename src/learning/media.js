/* Privileged media actions are callable only from the learning workbench. */
(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const previousAction = C.handleLearningAction;
  async function screenshot(message, sender) {
    C.assert(message.consent === true, "请先确认截图操作");
    const { materials } = await C.store.readTables(["materials"]);
    const material = materials.find((row) => row.id === message.materialId);
    C.assert(material?.sourceUrl, "本地视频请使用本地画面截图");
    const remembered = C.openTargets.get(material.id);
    const tabs = await chrome.tabs.query({});
    const candidates = tabs.filter((tab) => {
      try {
        return (
          C.safeUrl(tab.url) === material.sourceUrl ||
          tab.id === remembered?.tabId
        );
      } catch {
        return false;
      }
    });
    for (const tab of candidates) {
      let captured;
      try {
        captured = await C.capture(
          tab.id,
          tab.id === remembered?.tabId ? remembered.frameId : undefined,
        );
      } catch {
        continue;
      }
      if (
        C.identity(captured.sourceUrl, captured.platform, captured.sourceId) !==
        material.identity
      )
        continue;
      C.assert(
        captured.frameId === 0,
        "嵌入式播放器暂不支持自动裁剪，请导入手动截图",
      );
      const bounds = captured.bounds;
      C.assert(
        bounds?.width > 24 &&
          bounds?.height > 24 &&
          bounds.x < bounds.viewportWidth &&
          bounds.y < bounds.viewportHeight &&
          bounds.x + bounds.width > 0 &&
          bounds.y + bounds.height > 0,
        "播放器不在可见区域，请先滚动到播放器",
      );
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const [active] = await chrome.tabs.query({
        active: true,
        windowId: tab.windowId,
      });
      C.assert(active?.id === tab.id, "活动标签页已变化，已取消截图");
      const current = await C.capture(tab.id, 0);
      C.assert(
        C.identity(current.sourceUrl, current.platform, current.sourceId) ===
          material.identity,
        "播放内容已变化，已取消截图",
      );
      let dataUrl;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
        });
        const [after] = await chrome.tabs.query({
          active: true,
          windowId: tab.windowId,
        });
        C.assert(after?.id === tab.id, "截图期间活动标签页已变化，画面已丢弃");
      } finally {
        if (sender.tab?.id)
          await chrome.tabs
            .update(sender.tab.id, { active: true })
            .catch(() => {});
      }
      return { dataUrl, bounds: current.bounds, time: current.currentTime };
    }
    throw new Error(
      "未找到正在打开的对应播放器。请先打开原视频，或导入手动截图",
    );
  }
  C.handleLearningAction = async (action, message, sender) => {
    switch (action) {
      case "bind-local": {
        C.assert(
          /^[a-f0-9]{64}$/.test(message.fingerprint),
          "本地文件指纹无效",
        );
        C.text(message.filename, 500);
        return C.store.mutate((state) => {
          let material = message.materialId
            ? state.materials.find((row) => row.id === message.materialId)
            : state.materials.find(
                (row) => row.identity === `local:${message.fingerprint}`,
              );
          if (message.materialId) C.assert(material, "资料不存在");
          if (!material) {
            material = C.record("materials", {
              ...C.stamp(),
              identity: `local:${message.fingerprint}`,
              title: message.filename.replace(/\.[^.]+$/, ""),
              sourceUrl: "",
              platform: "local",
              localFileName: message.filename,
              localFingerprint: message.fingerprint,
            });
            state.materials.push(material);
          } else {
            C.assert(
              !material.localFingerprint ||
                material.localFingerprint === message.fingerprint ||
                message.replaceConfirmed === true,
              "文件与原关联不一致，请确认是否重新关联",
            );
            state.materials = state.materials.map((row) =>
              row.id === material.id
                ? {
                    ...row,
                    localFileName: message.filename,
                    localFingerprint: message.fingerprint,
                    updatedAt: Date.now(),
                  }
                : row,
            );
          }
          return { materialId: material.id };
        });
      }
      case "unbind-local":
        return C.store.mutate((state) => {
          C.id(message.materialId);
          const material = state.materials.find(
            (row) => row.id === message.materialId,
          );
          C.assert(material, "资料不存在");
          state.materials = state.materials.map((row) =>
            row.id === material.id
              ? {
                  ...row,
                  localFileName: "",
                  localFingerprint: "",
                  updatedAt: Date.now(),
                }
              : row,
          );
          return { materialId: material.id };
        });
      case "screenshot":
        return screenshot(message, sender);
      case "save-attachment":
        return C.store.put("attachments", {
          ...C.stamp(),
          materialId: message.materialId,
          clipId: message.clipId || "",
          time: message.time || 0,
          caption: message.caption || "",
          dataUrl: message.dataUrl,
        });
      case "delete-attachment":
        return C.store.mutate((state) => {
          state.attachments = state.attachments.filter(
            (row) => row.id !== message.id,
          );
          C.store.pruneNoteClips(state);
          return true;
        });
      default:
        if (previousAction) return previousAction(action, message, sender);
        throw new Error("未知的学习操作");
    }
  };
})();
