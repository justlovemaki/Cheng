(() => {
  "use strict";
  const C = globalThis.ChengLearning,
    W = C.workspace;
  const { $, element: el, button, request, notify } = W;
  const files = new Map();
  let currentMediaId = "",
    lastProgress = 0,
    segment,
    segmentTimer;
  const source = el("input");
  source.type = "file";
  source.accept = "video/*,audio/*,.mkv,.mp4,.webm,.mp3,.m4a,.wav";
  source.hidden = true;
  source.id = "local-media-file";
  const useCurrent = el("input");
  useCurrent.type = "checkbox";
  useCurrent.id = "media-to-current";
  const importLabel = el("label", undefined, "check");
  importLabel.append(useCurrent, el("span", "媒体关联到当前资料"));
  const open = button("打开本地视频 / 音频", () => source.click());
  open.id = "open-local-media";
  $("import-subtitles").before(open, importLabel, source);

  const search = el("input");
  search.id = "cue-search";
  search.type = "search";
  search.placeholder = "全文搜索原文或译文";
  search.setAttribute("aria-label", "字幕全文搜索");
  const display = el("select");
  display.id = "translation-display";
  display.setAttribute("aria-label", "译文显示方式");
  display.add(new Option("原文与译文", "both"));
  display.add(new Option("只看原文", "source"));
  display.add(new Option("按需揭示译文", "reveal"));
  const raw = el("input");
  raw.type = "checkbox";
  raw.id = "show-raw-subtitles";
  const rawLabel = el("label", undefined, "check");
  rawLabel.append(raw, el("span", "对照原始字幕"));
  const controls = el("div", undefined, "toolbar reading-toolbar");
  controls.append(search, display, rawLabel);
  $("reading-controls").append(controls);
  C.filterLearningCues = (cues) => {
    const query = search.value.trim().toLocaleLowerCase();
    return query
      ? cues.filter((cue) =>
          `${cue.text}\n${cue.repaired}\n${cue.translation}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : cues;
  };
  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => W.resetPage(), 120);
  });
  function readingPreferences() {
    applyDisplay();
    renderCaption();
    chrome.storage.local
      .set({
        cheng_reading_preferences: { display: display.value, raw: raw.checked },
      })
      .catch((error) => notify(error.message, true));
  }
  display.addEventListener("change", readingPreferences);
  raw.addEventListener("change", readingPreferences);
  chrome.storage.local
    .get("cheng_reading_preferences")
    .then((stored) => {
      const value = stored.cheng_reading_preferences;
      if (["both", "source", "reveal"].includes(value?.display))
        display.value = value.display;
      raw.checked = value?.raw === true;
      applyDisplay();
    })
    .catch(() => {});
  function applyDisplay() {
    for (const row of $("cues").querySelectorAll(".cue")) {
      const translated = row.querySelector(".translation");
      if (translated) translated.hidden = display.value !== "both";
      row.querySelector(".reveal-translation")?.remove();
      row.querySelector(".raw-source")?.remove();
      if (translated && display.value === "reveal") {
        const reveal = button("显示译文", () => {
          translated.hidden = !translated.hidden;
          reveal.textContent = translated.hidden ? "显示译文" : "隐藏译文";
        });
        reveal.className = "reveal-translation";
        translated.after(reveal);
      }
      const cue = W.transcript?.cues.find(
        (item) => item.id === row.dataset.cueId,
      );
      if (raw.checked && cue?.repaired && cue.repaired !== cue.text)
        row.lastElementChild.append(
          el("p", `原始：${cue.text}`, "raw-source muted"),
        );
    }
  }

  const mediaSection = $("media-section");
  mediaSection.className = "panel";
  mediaSection.append(
    el("h2", "本地播放"),
    el(
      "p",
      "文件只由浏览器读取，不上传、不复制进资料库。重开工作台后需要重新选择文件；字幕、进度与笔记仍保存在本机。",
      "muted",
    ),
  );
  const localStatus = el("p", "尚未关联本地媒体", "muted");
  localStatus.id = "local-media-status";
  const localTools = el("div", undefined, "toolbar"),
    linkLocal = button("连接本地文件", () => {
      useCurrent.checked = true;
      source.click();
    }),
    unlinkLocal = button("清除文件关联", async () => {
      const id = W.materialId,
        item = files.get(id),
        connected = Boolean(item);
      if (
        !confirm(
          `${connected ? "断开当前文件并清除关联记录" : "清除上次文件的关联记录"}。字幕版本、片段、笔记和电脑上的原文件都会保留。是否继续？`,
        )
      )
        return;
      media.pause();
      stopSegment();
      await saveProgress(true);
      await request("unbind-local", { materialId: id });
      if (item) URL.revokeObjectURL(item.url);
      files.delete(id);
      media.removeAttribute("src");
      media.load();
      wrap.hidden = true;
      await W.refresh();
      notify("已清除本地文件关联记录；字幕和笔记均保留");
    });
  unlinkLocal.id = "unlink-local-media";
  localTools.append(linkLocal, unlinkLocal);
  const wrap = el("div", undefined, "local-video-wrap");
  const media = el("video");
  media.id = "local-player";
  media.controls = true;
  media.preload = "metadata";
  const caption = el("div", undefined, "local-caption");
  caption.setAttribute("aria-live", "off");
  wrap.append(media, caption);
  wrap.hidden = true;
  mediaSection.append(localTools, localStatus, wrap);
  function stopSegment() {
    segment = undefined;
    clearInterval(segmentTimer);
  }
  async function saveProgress(force = false) {
    if (
      !currentMediaId ||
      media.readyState < 1 ||
      !Number.isFinite(media.currentTime) ||
      (!force && Date.now() - lastProgress < 5000)
    )
      return;
    lastProgress = Date.now();
    const id = currentMediaId,
      time = media.currentTime;
    try {
      await request("progress", { materialId: id, time });
      if (W.materialId === id && W.material) {
        W.material.currentTime = time;
        $("resume").textContent = `继续学习 · ${C.timeLabel(time)}`;
      }
    } catch (error) {
      notify(error.message, true);
    }
  }
  function renderCaption() {
    caption.replaceChildren();
    if (currentMediaId !== W.materialId) return;
    const cues =
      W.transcript?.cues.filter(
        (cue) => cue.start <= media.currentTime && cue.end > media.currentTime,
      ) || [];
    for (const cue of cues.slice(0, 3)) {
      caption.append(el("div", cue.repaired || cue.text));
      if (display.value === "both" && cue.translation)
        caption.append(el("div", cue.translation, "local-translation"));
    }
    for (const row of $("cues").querySelectorAll(".cue"))
      row.classList.toggle(
        "active-cue",
        cues.some((cue) => cue.id === row.dataset.cueId),
      );
  }
  function checkSegment() {
    if (!segment) return;
    if (W.materialId !== currentMediaId || media.currentTime >= segment.end) {
      stopSegment();
      media.pause();
    }
  }
  media.addEventListener("timeupdate", () => {
    renderCaption();
    checkSegment();
    void saveProgress();
  });
  media.addEventListener("pause", () => {
    stopSegment();
    void saveProgress(true);
  });
  media.addEventListener("ended", () => {
    stopSegment();
    void saveProgress(true);
  });
  media.addEventListener("seeking", () => {
    if (
      segment &&
      (media.currentTime < segment.start - 0.5 ||
        media.currentTime > segment.end + 0.5)
    )
      stopSegment();
  });
  media.addEventListener("seeked", () => {
    renderCaption();
    void saveProgress(true);
  });
  media.addEventListener("error", () => {
    if (media.getAttribute("src"))
      notify(
        "浏览器无法解码此媒体格式，请转换为常见 MP4/WebM/MP3，或仅使用字幕精读",
        true,
      );
  });
  media.addEventListener("loadedmetadata", () => {
    if (W.material?.id === currentMediaId)
      media.currentTime = Math.min(
        W.material.currentTime || 0,
        Number.isFinite(media.duration) ? Math.max(0, media.duration - 0.1) : 0,
      );
    media.classList.toggle("audio-only", !media.videoWidth);
    renderCaption();
  });
  C.seekLocal = async (id, start, end) => {
    if (id !== W.materialId || !files.has(id)) return false;
    if (media.readyState < 1)
      await new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(timer);
          media.removeEventListener("loadedmetadata", onReady);
          error ? reject(error) : resolve();
        };
        const onReady = () => finish();
        const timer = setTimeout(
          () => finish(new Error("本地媒体尚未就绪，请稍后重试")),
          8000,
        );
        media.addEventListener("loadedmetadata", onReady, { once: true });
      });
    C.assert(
      id === currentMediaId && id === W.materialId,
      "学习资料已切换，请重新定位",
    );
    C.assert(
      !Number.isFinite(media.duration) || start < media.duration,
      "字幕时间超出本地媒体时长，请核对关联文件",
    );
    stopSegment();
    media.currentTime = start;
    if (end !== undefined) {
      segment = { start, end };
      segmentTimer = setInterval(checkSegment, 40);
      try {
        await media.play();
      } catch (error) {
        stopSegment();
        throw error;
      }
    }
    renderCaption();
    return true;
  };
  async function fileFingerprint(file) {
    const first = new Uint8Array(
      await file.slice(0, 1024 * 1024).arrayBuffer(),
    );
    const last = new Uint8Array(
      await file.slice(Math.max(0, file.size - 1024 * 1024)).arrayBuffer(),
    );
    const length = new TextEncoder().encode(String(file.size));
    const bytes = new Uint8Array(length.length + first.length + last.length);
    bytes.set(length);
    bytes.set(first, length.length);
    bytes.set(last, length.length + first.length);
    return C.hashBytes(bytes); // Sampling fingerprint, not a claim of full-file integrity.
  }
  source.addEventListener("change", async () => {
    try {
      const file = source.files[0];
      if (!file) return;
      const fingerprint = await fileFingerprint(file);
      const target = useCurrent.checked ? W.material : null;
      const replaceConfirmed = Boolean(
        target?.localFingerprint &&
          target.localFingerprint !== fingerprint &&
          confirm(
            "此文件与原关联文件不同，字幕时间可能不匹配。仍要替换关联吗？",
          ),
      );
      if (
        target?.localFingerprint &&
        target.localFingerprint !== fingerprint &&
        !replaceConfirmed
      )
        return;
      const saved = await request("bind-local", {
        materialId: target?.id,
        filename: file.name,
        fingerprint,
        replaceConfirmed,
      });
      const previous = files.get(saved.materialId);
      if (previous) URL.revokeObjectURL(previous.url);
      files.set(saved.materialId, {
        url: URL.createObjectURL(file),
        name: file.name,
      });
      await W.refresh();
      await W.selectMaterial(saved.materialId);
      notify(
        "当前页面已连接本地媒体；文件没有上传。刷新后浏览器会要求重新选择文件",
      );
    } catch (error) {
      notify(error.message, true);
    } finally {
      source.value = "";
    }
  });

  const attachments = $("attachments-section");
  attachments.append(
    el("h2", "画面与截图"),
    el(
      "p",
      "截图可关联当前笔记编辑器选中的片段。图片只保存在本机，不会自动发送给 AI。",
      "muted",
    ),
  );
  const shotCaption = el("input");
  shotCaption.id = "shot-caption";
  shotCaption.placeholder = "截图说明（可选）";
  shotCaption.setAttribute("aria-label", "截图说明");
  const shotTools = el("div", undefined, "toolbar");
  shotTools.append(shotCaption);
  const captureLocal = button("截取本地视频画面", async () => {
    C.assert(
      files.has(W.materialId) && media.readyState >= 2 && media.videoWidth > 0,
      "请先播放有关联画面的本地视频；音频不能截取视频画面",
    );
    const id = W.materialId,
      clipId = $("note-clip").value,
      time = media.currentTime;
    const canvas = document.createElement("canvas");
    const ratio = Math.min(
      1,
      1920 / media.videoWidth,
      1080 / media.videoHeight,
    );
    canvas.width = Math.round(media.videoWidth * ratio);
    canvas.height = Math.round(media.videoHeight * ratio);
    canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
    await saveImage(canvas.toDataURL("image/png"), id, clipId, time);
  });
  captureLocal.id = "capture-local-frame";
  const captureOnline = button("截取来源播放器", async () => {
    const id = W.materialId,
      clipId = $("note-clip").value;
    if (
      !confirm(
        "将切换到来源标签页并截取播放器当前可见画面，仅在本机保存裁剪结果，不发送给 AI。请确保播放器可见。是否继续？",
      )
    )
      return;
    const result = await request("screenshot", {
      materialId: id,
      consent: true,
    });
    const image = await createImageBitmap(
      await (await fetch(result.dataUrl)).blob(),
    );
    try {
      const bounds = result.bounds,
        scaleX = image.width / bounds.viewportWidth,
        scaleY = image.height / bounds.viewportHeight;
      const x = Math.max(0, bounds.x) * scaleX,
        y = Math.max(0, bounds.y) * scaleY;
      const width =
        (Math.min(bounds.viewportWidth, bounds.x + bounds.width) -
          Math.max(0, bounds.x)) *
        scaleX;
      const height =
        (Math.min(bounds.viewportHeight, bounds.y + bounds.height) -
          Math.max(0, bounds.y)) *
        scaleY;
      C.assert(width > 0 && height > 0, "播放器当前不可见");
      const ratio = Math.min(1, 1920 / width, 1080 / height),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas
        .getContext("2d")
        .drawImage(
          image,
          x,
          y,
          width,
          height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      await saveImage(canvas.toDataURL("image/png"), id, clipId, result.time);
    } finally {
      image.close();
    }
  });
  captureOnline.id = "capture-online-frame";
  const imageFile = el("input");
  imageFile.type = "file";
  imageFile.accept = "image/png,image/jpeg,image/webp";
  imageFile.hidden = true;
  imageFile.id = "screenshot-file";
  shotTools.append(
    captureLocal,
    captureOnline,
    button("导入截图", () => imageFile.click()),
  );
  const gallery = el("div", undefined, "image-grid");
  gallery.id = "attachments";
  attachments.append(shotTools, imageFile, gallery);
  imageFile.addEventListener("change", async () => {
    try {
      const file = imageFile.files[0];
      if (!file) return;
      C.assert(
        file.size <= 9 * 1024 * 1024 &&
          ["image/png", "image/jpeg", "image/webp"].includes(file.type),
        "仅支持 9 MB 以下 PNG/JPEG/WebP 图片",
      );
      const id = W.materialId,
        clipId = $("note-clip").value,
        time =
          currentMediaId === id ? media.currentTime : W.material.currentTime;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await saveImage(
        C.encodeImage(bytes, file.type.split("/")[1]),
        id,
        clipId,
        time,
      );
    } catch (error) {
      notify(error.message, true);
    } finally {
      imageFile.value = "";
    }
  });
  async function saveImage(dataUrl, materialId, clipId, time) {
    await request("save-attachment", {
      materialId,
      clipId,
      time,
      caption: shotCaption.value,
      dataUrl,
    });
    shotCaption.value = "";
    await W.refresh();
    notify("截图已保存到本机；完整备份和 Markdown 图片包会包含它");
  }
  function render() {
    if (!W.material) {
      media.pause();
      stopSegment();
      currentMediaId = "";
      unlinkLocal.disabled = true;
      return;
    }
    mediaSection.hidden = false;
    attachments.hidden = false;
    const linked = files.get(W.materialId);
    unlinkLocal.disabled = !(
      linked ||
      W.material.localFileName ||
      W.material.localFingerprint
    );
    if (
      currentMediaId !== W.materialId ||
      (linked && media.getAttribute("src") !== linked.url)
    ) {
      void saveProgress(true);
      media.pause();
      stopSegment();
      currentMediaId = W.materialId;
      lastProgress = 0;
      if (linked) media.src = linked.url;
      else {
        media.removeAttribute("src");
        media.load();
      }
    }
    wrap.hidden = !linked;
    const remembered = Boolean(
      W.material.localFileName || W.material.localFingerprint,
    );
    localStatus.dataset.state = linked
      ? "connected"
      : remembered
        ? "reconnect"
        : "empty";
    localStatus.textContent = linked
      ? `当前已连接：${linked.name}`
      : remembered
        ? `需要重新连接：${W.material.localFileName || "上次的本地文件"}。刷新后浏览器不会保留文件读取权限。`
        : "尚未连接本地媒体。可选择电脑上的视频或音频，仅在当前页面读取。";
    linkLocal.textContent = linked
      ? "更换本地文件"
      : remembered
        ? "重新连接本地文件"
        : "连接本地文件";
    unlinkLocal.textContent = linked ? "断开并清除关联" : "清除历史关联";
    $("capture-online-frame").disabled = !W.material.sourceUrl;
    renderCaption();
    applyDisplay();
    gallery.replaceChildren();
    for (const row of W.state.attachments
      .filter((row) => row.materialId === W.materialId)
      .sort((a, b) => a.time - b.time)) {
      const card = el("article"),
        image = el("img");
      image.src = row.dataUrl;
      image.alt = row.caption || `视频画面 ${C.timeLabel(row.time)}`;
      image.loading = "lazy";
      card.append(
        image,
        el("p", row.caption || "视频画面", "muted"),
        button(C.timeLabel(row.time), () => W.seek(row.time)),
        button("删除", async () => {
          if (!confirm("删除这张截图？")) return;
          await request("delete-attachment", { id: row.id });
          await W.refresh();
        }),
      );
      gallery.append(card);
    }
  }
  document.addEventListener("cheng:workspace-render", render);
  document.addEventListener("cheng:cues-render", () => {
    applyDisplay();
    renderCaption();
  });
  addEventListener("beforeunload", () => {
    stopSegment();
    for (const item of files.values()) URL.revokeObjectURL(item.url);
  });
  C.reading = {
    fileFingerprint,
    get media() {
      return media;
    },
  };
})();
