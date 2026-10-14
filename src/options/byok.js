(() => {
  "use strict";

  const STORAGE_KEY = "trancy_byok_engines";
  const requestedProvider = new URLSearchParams(location.search).get(
    "provider",
  );
  const presets = {
    OpenAI: {
      runtimeProvider: "OpenAI",
      name: "OpenAI",
      model: "gpt-4o-mini",
      endpoint: "https://api.openai.com/v1/chat/completions",
      transcriptionModel: "whisper-1",
      transcriptionEndpoint: "https://api.openai.com/v1/audio/transcriptions",
      supportsTranscription: true,
    },
    OpenRouter: {
      runtimeProvider: "OpenAI",
      name: "OpenRouter",
      model: "openai/gpt-4o-mini",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
    },
    DeepSeek: {
      runtimeProvider: "DeepSeek",
      name: "DeepSeek",
      model: "deepseek-chat",
      endpoint: "https://api.deepseek.com/chat/completions",
    },
    Google: {
      runtimeProvider: "Google",
      name: "Gemini",
      model: "gemini-2.0-flash",
      endpoint:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    },
    Anthropic: {
      runtimeProvider: "Anthropic",
      name: "Claude",
      model: "claude-3-5-haiku-latest",
      endpoint: "https://api.anthropic.com/v1/messages",
    },
    Microsoft: {
      runtimeProvider: "MicrosoftTranslator",
      name: "Microsoft Translator (Azure)",
      model: "microsoft-translate",
      endpoint: "https://api.cognitive.microsofttranslator.com/translate",
      supportsRegion: true,
    },
    DeepL: {
      runtimeProvider: "DeepL",
      name: "DeepL API",
      model: "deepl-translate",
      endpoint: "https://api-free.deepl.com/v2/translate",
    },
    Custom: {
      runtimeProvider: "OpenAI",
      name: "Custom AI",
      model: "",
      endpoint: "",
      transcriptionModel: "whisper-1",
      transcriptionEndpoint: "",
      supportsTranscription: true,
    },
  };

  const $ = (id) => document.getElementById(id);
  const form = $("engine-form");
  const provider = $("provider");
  const nameInput = $("name");
  const modelInput = $("model");
  const endpointInput = $("endpoint");
  const keyInput = $("key");
  const regionInput = $("region");
  const regionLabel = $("region-label");
  const transcriptionModelInput = $("transcription-model");
  const transcriptionEndpointInput = $("transcription-endpoint");
  const transcriptionModelLabel = $("transcription-model-label");
  const transcriptionEndpointLabel = $("transcription-endpoint-label");
  const transcriptionLanguageInput = $("transcription-language");
  const transcriptionPromptInput = $("transcription-prompt");
  const transcriptionLanguageLabel = $("transcription-language-label");
  const transcriptionPromptLabel = $("transcription-prompt-label");
  const transcriptionNote = $("transcription-note");
  const idInput = $("engine-id");
  const list = $("engine-list");
  const empty = $("empty");
  const status = $("status");
  const cancelEdit = $("cancel-edit");
  const helperStatus = $("helper-status");
  const helperExtensionId = $("helper-extension-id");
  const helperCommand = $("helper-command");
  const refreshHelper = $("refresh-helper");
  const diagnosticsOutput = $("diagnostics-output");
  const diagnosticsStatus = $("diagnostics-status");
  const refreshDiagnostics = $("refresh-diagnostics");
  const copyDiagnostics = $("copy-diagnostics");
  const clearDiagnostics = $("clear-diagnostics");
  let engines = [];
  let diagnostics = [];

  const requestSubtitleAi = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: "lexihalo-subtitle-ai" });
      const requestId = crypto.randomUUID();
      let settled = false;
      const timeout = window.setTimeout(
        () => reject(new Error("诊断请求超时")),
        10000,
      );
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          port.disconnect();
        } catch {}
        error ? reject(error) : resolve(value);
      };
      port.onMessage.addListener((message) => {
        if (message?.requestId !== requestId) return;
        message.response?.ok
          ? finish(null, message.response.data)
          : finish(new Error(message.response?.error || "诊断请求失败"));
      });
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          finish(new Error(chrome.runtime.lastError.message));
        }
      });
      port.postMessage({ requestId, type, ...payload });
    });

  const renderHelperStatus = async () => {
    helperExtensionId.textContent = chrome.runtime.id;
    helperCommand.textContent = `python native/install.py ${chrome.runtime.id}`;
    helperStatus.textContent = "正在检查…";
    try {
      const result = await requestSubtitleAi("lexihalo:subtitle-ai:helper-status");
      const missing = Object.entries(result?.tools || {}).filter(([, found]) => !found).map(([name]) => name);
      helperStatus.textContent = result?.installed
        ? result.ready
          ? `已就绪（协议 v${result.version || 1}）`
          : `已连接，缺少 ${missing.join("、") || "所需工具"}`
        : "未连接";
      helperStatus.title = result?.error || "";
    } catch (error) {
      helperStatus.textContent = "检查失败";
      helperStatus.title = error?.message || String(error);
    }
  };

  const renderDiagnostics = async () => {
    try {
      const result = await requestSubtitleAi(
        "lexihalo:subtitle-ai:get-diagnostics",
      );
      diagnostics = Array.isArray(result?.entries) ? result.entries : [];
      diagnosticsOutput.textContent = diagnostics.length
        ? JSON.stringify(diagnostics, null, 2)
        : "尚无诊断记录。请播放视频并等待 AI 字幕请求后刷新。";
      diagnosticsStatus.textContent = `${diagnostics.length} 条记录`;
    } catch (error) {
      diagnosticsStatus.textContent = error?.message || String(error);
    }
  };

  const getStored = async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  };

  const persist = async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: engines });
    status.textContent = "已保存，重新打开翻译引擎列表即可选择";
    window.setTimeout(() => {
      status.textContent = "";
    }, 3000);
  };

  const maskKey = (value) => {
    if (!value) return "未设置";
    if (value.length <= 8) return "••••••••";
    return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
  };

  const resetForm = () => {
    form.reset();
    idInput.value = "";
    $("form-title").textContent = "添加翻译引擎";
    cancelEdit.hidden = true;
    applyPreset(true);
  };

  const applyPreset = (force) => {
    const preset = presets[provider.value];
    if (!preset) return;
    if (force || !nameInput.value) nameInput.value = preset.name;
    if (force || !modelInput.value) modelInput.value = preset.model;
    if (force || !endpointInput.value) endpointInput.value = preset.endpoint;
    regionLabel.hidden = !preset.supportsRegion;
    if (!preset.supportsRegion) regionInput.value = "";
    const supportsTranscription = preset.supportsTranscription === true;
    transcriptionModelInput.disabled = !supportsTranscription;
    transcriptionEndpointInput.disabled = !supportsTranscription;
    transcriptionLanguageInput.disabled = !supportsTranscription;
    transcriptionPromptInput.disabled = !supportsTranscription;
    for (const label of [
      transcriptionModelLabel,
      transcriptionEndpointLabel,
      transcriptionLanguageLabel,
      transcriptionPromptLabel,
    ]) {
      label.classList.toggle("field-disabled", !supportsTranscription);
    }
    transcriptionNote.textContent = supportsTranscription
      ? "用于无字幕视频。LexiHalo 会获取视频音频并以 multipart/form-data 直接上传到该接口；建议使用 whisper-1 以获得分段时间戳。"
      : "当前服务商不支持此配置。请选择 OpenAI 或 OpenAI 兼容接口后填写。";
    if (supportsTranscription) {
      if (force || !transcriptionModelInput.value) {
        transcriptionModelInput.value = preset.transcriptionModel || "whisper-1";
      }
      if (force || !transcriptionEndpointInput.value) {
        transcriptionEndpointInput.value = preset.transcriptionEndpoint || "";
      }
    } else {
      transcriptionModelInput.value = "";
      transcriptionEndpointInput.value = "";
      transcriptionLanguageInput.value = "";
      transcriptionPromptInput.value = "";
    }
  };

  const createButton = (text, className, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (className) button.className = className;
    button.addEventListener("click", handler);
    return button;
  };

  const render = () => {
    list.replaceChildren();
    empty.hidden = engines.length > 0;

    for (const engine of engines) {
      const row = document.createElement("div");
      row.className = "engine";

      const info = document.createElement("div");
      const title = document.createElement("div");
      title.className = "engine-name";
      title.textContent = engine.name;
      const meta = document.createElement("div");
      meta.className = "engine-meta";
      const transcriptionMeta = engine.transcriptionModel
        ? ` · 音频识别 ${engine.transcriptionModel}`
        : "";
      meta.textContent = `${engine.providerLabel || engine.provider} · ${engine.model}${transcriptionMeta} · ${maskKey(engine.key)}${engine.region ? ` · ${engine.region}` : ""} · ${engine.endpoint}`;
      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "engine-actions";
      actions.append(
        createButton("编辑", "", () => editEngine(engine._id)),
        createButton("删除", "danger", () => removeEngine(engine._id)),
      );

      row.append(info, actions);
      list.append(row);
    }
  };

  const editEngine = (id) => {
    const engine = engines.find((item) => item._id === id);
    if (!engine) return;
    idInput.value = engine._id;
    provider.value = engine.providerId || "Custom";
    nameInput.value = engine.name;
    modelInput.value = engine.model;
    endpointInput.value = engine.endpoint;
    keyInput.value = engine.key;
    regionInput.value = engine.region || "";
    transcriptionModelInput.value = engine.transcriptionModel || "";
    transcriptionEndpointInput.value = engine.transcriptionEndpoint || "";
    transcriptionLanguageInput.value = engine.transcriptionLanguage || "";
    transcriptionPromptInput.value = engine.transcriptionPrompt || "";
    applyPreset(false);
    $("form-title").textContent = "编辑翻译引擎";
    cancelEdit.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeEngine = async (id) => {
    const engine = engines.find((item) => item._id === id);
    if (!engine || !window.confirm(`删除“${engine.name}”？`)) return;
    engines = engines.filter((item) => item._id !== id);
    await persist();
    render();
    if (idInput.value === id) resetForm();
  };

  provider.addEventListener("change", () => applyPreset(true));
  cancelEdit.addEventListener("click", resetForm);

  refreshHelper.addEventListener("click", renderHelperStatus);
  refreshDiagnostics.addEventListener("click", renderDiagnostics);
  copyDiagnostics.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      diagnosticsStatus.textContent = "已复制";
    } catch (error) {
      diagnosticsStatus.textContent = `复制失败：${error?.message || error}`;
    }
  });
  clearDiagnostics.addEventListener("click", async () => {
    try {
      await requestSubtitleAi("lexihalo:subtitle-ai:clear-diagnostics");
      diagnostics = [];
      diagnosticsOutput.textContent = "尚无诊断记录。";
      diagnosticsStatus.textContent = "已清空";
    } catch (error) {
      diagnosticsStatus.textContent = error?.message || String(error);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const preset = presets[provider.value];
    const key = keyInput.value.trim();
    const transcriptionEndpoint = transcriptionEndpointInput.value.trim();
    const usesLocalCookieAuth = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(
      transcriptionEndpoint,
    );
    if (!key && !usesLocalCookieAuth) {
      status.textContent = "请填写 API Key；只有本地 Cookie 认证的音频接口可以留空";
      keyInput.focus();
      return;
    }
    const id = idInput.value || `byok-${crypto.randomUUID()}`;
    const engine = {
      _id: id,
      name: nameInput.value.trim(),
      provider: preset.runtimeProvider,
      providerId: provider.value,
      providerLabel: preset.name,
      model: modelInput.value.trim(),
      endpoint: endpointInput.value.trim(),
      key,
      region: regionInput.value.trim(),
      transcriptionModel: transcriptionModelInput.value.trim(),
      transcriptionEndpoint,
      transcriptionLanguage: transcriptionLanguageInput.value.trim(),
      transcriptionPrompt: transcriptionPromptInput.value.trim(),
      type: "user",
      role: 2,
      enabled: true,
      available: true,
      icon: preset.runtimeProvider,
    };

    const index = engines.findIndex((item) => item._id === id);
    if (index >= 0) engines[index] = engine;
    else engines.push(engine);

    await persist();
    render();
    resetForm();
  });

  renderHelperStatus();
  renderDiagnostics();
  getStored()
    .then((stored) => {
      engines = stored;
      render();
      resetForm();
      if (requestedProvider && presets[requestedProvider]) {
        provider.value = requestedProvider;
        applyPreset(true);
      }
    })
    .catch((error) => {
      status.textContent = `读取配置失败：${error.message || error}`;
    });
})();

document.documentElement.setAttribute("data-lexihalo-byok-runtime", "semantic");
