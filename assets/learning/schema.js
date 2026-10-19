/* Cheng learning domain. Loaded only in extension-owned pages/service worker. */
(() => {
  "use strict";
  const C = (globalThis.ChengLearning ||= {});
  const TABLES = [
    "materials",
    "transcripts",
    "clips",
    "notes",
    "concepts",
    "glossary",
    "attachments",
  ];
  const VERSION = 3;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const text = (value, max = 2000) => {
    assert(
      typeof value === "string" &&
        value.length <= max &&
        !value.includes("\u0000"),
      "文字内容无效或过长",
    );
    return value;
  };
  const id = (value) => {
    assert(
      typeof value === "string" && /^[\w.-]{1,160}$/.test(value),
      "数据标识无效",
    );
    return value;
  };
  const number = (value, max = 31536000) => {
    assert(
      typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= max,
      "时间或数值无效",
    );
    return value;
  };
  const newId = () => crypto.randomUUID();
  const empty = () => Object.fromEntries(TABLES.map((name) => [name, []]));
  const safeUrl = (value) => {
    if (!value) return "";
    const url = new URL(text(value, 12000));
    assert(
      ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password,
      "仅支持无凭据的 HTTP(S) 来源链接",
    );
    url.hash = "";
    // Never persist temporary media credentials, OAuth tokens, or tracking data.
    for (const key of [...url.searchParams.keys()]) {
      if (
        ![
          "v",
          "p",
          "id",
          "bvid",
          "episode",
          "lesson",
          "lecture",
          "course",
        ].includes(key)
      )
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  };
  const identity = (sourceUrl, platform = "web", sourceId = "") => {
    const url = safeUrl(sourceUrl);
    const parsed = url ? new URL(url) : null;
    if (parsed && /(^|\.)youtu(be\.com|\.be)$/.test(parsed.hostname)) {
      const videoId =
        parsed.searchParams.get("v") ||
        parsed.pathname.match(
          /\/(?:shorts\/|embed\/|live\/)?([\w-]{11})(?:\/|$)/,
        )?.[1];
      if (videoId) return `youtube:${videoId}`;
    }
    if (platform && sourceId && !/[/?#=&]/.test(sourceId))
      return `${platform}:${sourceId}`;
    assert(url, "资料缺少来源标识");
    return `url:${url}`;
  };
  async function sourceIdentifier(info) {
    const raw = String(info?.sourceId || "");
    let value = raw;
    if (info?.itemIdentity) value = text(info.itemIdentity, 2000);
    else if (
      ["web", "html5", "generic"].includes(info?.platform) &&
      info?.mediaPath
    ) {
      const media = new URL(info.mediaPath);
      assert(["http:", "https:"].includes(media.protocol), "媒体标识协议无效");
      value = `${safeUrl(info.sourceUrl)}|${media.origin}${media.pathname}`;
    } else if (/^[\w.-]{1,160}$/.test(raw)) return raw;
    else if (/^https?:\/\//.test(raw)) value = safeUrl(raw);
    if (!value) return "";
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  function limitedArray(value, max) {
    assert(
      Array.isArray(value) && value.length <= max,
      `列表最多允许 ${max} 项`,
    );
    return value;
  }
  function safeNoteUrl(value) {
    if (!value) return "";
    const url = new URL(text(value, 12000));
    assert(
      ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password,
      "笔记来源仅支持无凭据的 HTTP(S) 链接",
    );
    for (const key of [...url.searchParams.keys()])
      if (
        /^(?:utm_.+|fbclid|gclid|access[_-]?token|token|auth(?:orization)?|api[_-]?key|key|sig(?:nature)?|code|ticket|session(?:id)?|password|passwd)$/i.test(
          key,
        )
      )
        url.searchParams.delete(key);
    url.searchParams.sort();
    if (
      /(?:^|[?&#])(?:access[_-]?token|id[_-]?token|token|authorization|api[_-]?key|session|password)=/i.test(
        url.hash.slice(1),
      )
    )
      url.hash = "";
    return url.href;
  }
  function noteSource(value) {
    if (value == null) return null;
    assert(
      value && typeof value === "object" && value.kind === "web",
      "笔记出处格式无效",
    );
    const url = safeNoteUrl(value.url);
    assert(url, "网页出处缺少链接");
    return {
      kind: "web",
      url,
      title: text(value.title || "网页", 500),
      quote: text(value.quote || "", 16000),
    };
  }
  function noteOrigin(state, note) {
    if (note.materialId) {
      const material = state.materials.find(
          (row) => row.id === note.materialId,
        ),
        clip = state.clips.find(
          (row) => row.id === note.clipId && row.materialId === note.materialId,
        );
      return {
        kind: "material",
        title: material?.title || "关联资料暂不可用",
        url: material?.sourceUrl || "",
        quote: clip?.text || "",
        translation: clip?.translation || "",
        start: clip?.start ?? null,
        end: clip?.end ?? null,
        identity: material?.identity || "",
      };
    }
    return note.source
      ? { ...note.source, start: null, end: null, translation: "" }
      : {
          kind: "none",
          title: "独立笔记",
          url: "",
          quote: "",
          translation: "",
          start: null,
          end: null,
        };
  }
  function record(table, input) {
    assert(
      input && typeof input === "object" && !Array.isArray(input),
      "记录格式无效",
    );
    const base = {
      id: id(input.id),
      createdAt: number(input.createdAt, 1e15),
      updatedAt: number(input.updatedAt, 1e15),
    };
    switch (table) {
      case "materials":
        return {
          ...base,
          identity: text(input.identity, 2000),
          title: text(input.title, 500),
          sourceUrl: safeUrl(input.sourceUrl),
          platform: text(input.platform || "web", 80),
          sourceId: text(input.sourceId || "", 160),
          language: text(input.language || "auto", 40),
          currentTime: number(input.currentTime || 0),
          activeTranscriptId: input.activeTranscriptId
            ? id(input.activeTranscriptId)
            : "",
          localFileName: text(input.localFileName || "", 500),
          localFingerprint: text(input.localFingerprint || "", 64),
        };
      case "transcripts": {
        assert(
          Array.isArray(input.cues) && input.cues.length <= 30000,
          "字幕不能超过 30000 行",
        );
        const cueIds = new Set();
        const cues = input.cues.map((cue) => {
          const cueId = id(cue.id);
          assert(!cueIds.has(cueId), "字幕行标识重复");
          cueIds.add(cueId);
          const start = number(cue.start),
            end = number(cue.end);
          assert(end > start, "字幕结束时间必须大于开始时间");
          return {
            id: cueId,
            start,
            end,
            text: text(cue.text, 8000),
            repaired: text(cue.repaired || "", 8000),
            translation: text(cue.translation || "", 12000),
          };
        });
        return {
          ...base,
          materialId: id(input.materialId),
          language: text(input.language || "auto", 40),
          origin: text(input.origin || "import", 80),
          fingerprint: text(input.fingerprint || "", 160),
          cues,
        };
      }
      case "clips": {
        assert(number(input.end) > number(input.start), "片段时间范围无效");
        const purpose = input.purpose || "bookmark";
        assert(["bookmark", "note"].includes(purpose), "片段用途无效");
        return {
          ...base,
          materialId: id(input.materialId),
          purpose,
          transcriptId: input.transcriptId ? id(input.transcriptId) : "",
          start: input.start,
          end: input.end,
          text: text(input.text || "", 40000),
          translation: text(input.translation || "", 40000),
          cueIds: limitedArray(input.cueIds || [], 100).map(id),
        };
      }
      case "notes": {
        const materialId = input.materialId ? id(input.materialId) : "",
          source = noteSource(input.source);
        assert(!input.clipId || materialId, "片段笔记必须关联资料");
        assert(!(materialId && source), "一条笔记不能同时拥有两种出处");
        return {
          ...base,
          materialId,
          source,
          clipId: input.clipId ? id(input.clipId) : "",
          body: text(input.body, 100000),
          tags: limitedArray(input.tags || [], 30).map((tag) => text(tag, 80)),
        };
      }
      case "concepts":
        return {
          ...base,
          materialId: id(input.materialId),
          transcriptId: id(input.transcriptId),
          question: text(input.question, 2000),
          mode: text(input.mode, 40),
          inVideo: text(input.inVideo, 20000),
          background: text(input.background, 20000),
          uncertainty: text(input.uncertainty, 10000),
          citations: limitedArray(input.citations, 20).map(id),
          contextCueIds: limitedArray(input.contextCueIds, 20).map(id),
          engine: text(input.engine, 200),
          model: text(input.model, 200),
        };
      case "glossary":
        return {
          ...base,
          source: text(input.source, 200),
          target: text(input.target, 500),
          aliases: limitedArray(input.aliases || [], 20).map((alias) =>
            text(alias, 200),
          ),
          scope: input.scope ? id(input.scope) : "",
          note: text(input.note || "", 1000),
        };
      case "attachments":
        assert(
          /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
            input.dataUrl,
          ) && input.dataUrl.length <= 12 * 1024 * 1024,
          "只支持 9 MB 以下的 PNG/JPEG/WebP 图片",
        );
        return {
          ...base,
          materialId: id(input.materialId),
          clipId: input.clipId ? id(input.clipId) : "",
          time: number(input.time || 0),
          caption: text(input.caption || "", 500),
          dataUrl: input.dataUrl,
        };
      default:
        throw new Error("未知数据类型");
    }
  }
  function validateSnapshot(input) {
    assert(input && typeof input === "object", "备份数据无效");
    const state = empty();
    const ids = {};
    for (const table of TABLES) {
      assert(
        Array.isArray(input[table]) && input[table].length <= 50000,
        `缺少或过大的数据表：${table}`,
      );
      state[table] = input[table].map((row) => record(table, row));
      ids[table] = new Set(state[table].map((row) => row.id));
      assert(
        ids[table].size === state[table].length,
        `数据表存在重复标识：${table}`,
      );
    }
    assert(
      new Set(state.materials.map((m) => m.identity)).size ===
        state.materials.length,
      "资料来源标识重复",
    );
    const lookup = Object.fromEntries(
      TABLES.map((t) => [t, new Map(state[t].map((r) => [r.id, r]))]),
    );
    for (const table of TABLES.filter(
      (t) => !["materials", "glossary"].includes(t),
    )) {
      for (const row of state[table]) {
        if (table === "notes" && !row.materialId) continue;
        assert(
          ids.materials.has(row.materialId),
          `${table} 引用了不存在的资料`,
        );
        if (row.transcriptId)
          assert(
            lookup.transcripts.get(row.transcriptId)?.materialId ===
              row.materialId,
            "字幕版本关联无效",
          );
        if (row.clipId)
          assert(
            lookup.clips.get(row.clipId)?.materialId === row.materialId,
            "片段关联无效",
          );
        if (table === "clips" || table === "concepts") {
          const cues = new Set(
            lookup.transcripts
              .get(row.transcriptId)
              ?.cues.map((cue) => cue.id) || [],
          );
          for (const cueId of [
            ...(row.cueIds || []),
            ...(row.contextCueIds || []),
            ...(row.citations || []),
          ])
            assert(cues.has(cueId), "引用了不存在的字幕行");
          if (table === "concepts")
            assert(
              row.citations.every((value) => row.contextCueIds.includes(value)),
              "概念引用超出发送的上下文",
            );
        }
      }
    }
    for (const row of state.materials)
      if (row.activeTranscriptId)
        assert(
          lookup.transcripts.get(row.activeTranscriptId)?.materialId === row.id,
          "当前字幕版本无效",
        );
    for (const row of state.glossary)
      if (row.scope) assert(ids.materials.has(row.scope), "术语表范围无效");
    return state;
  }
  const stamp = () => ({
    id: newId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const timeLabel = (seconds) => {
    const value = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  };
  Object.assign(C, {
    TABLES,
    VERSION,
    assert,
    text,
    id,
    number,
    newId,
    empty,
    safeUrl,
    safeNoteUrl,
    noteSource,
    noteOrigin,
    identity,
    record,
    validateSnapshot,
    stamp,
    timeLabel,
    sourceIdentifier,
  });
})();
