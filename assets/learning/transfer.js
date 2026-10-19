(() => {
  "use strict";
  const C = globalThis.ChengLearning;
  const MAX_ARCHIVE = 128 * 1024 * 1024;
  const encoder = new TextEncoder(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  const hashBytes = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  function parseSubtitles(value) {
    C.assert(
      typeof value === "string" && value.length <= 16 * 1024 * 1024,
      "字幕文件不能超过 16 MB",
    );
    const blocks = value
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split(/\n[ \t]*\n/);
    const cues = [];
    const toSeconds = (value) => {
      const pieces = value.replace(",", ".").split(":").map(Number);
      C.assert(
        pieces.at(-1) < 60 && pieces.at(-2) < 60,
        "字幕时间中的分、秒必须小于 60",
      );
      return pieces.length === 3
        ? pieces[0] * 3600 + pieces[1] * 60 + pieces[2]
        : pieces[0] * 60 + pieces[1];
    };
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;
      const position = lines.findIndex((line) => line.includes("-->"));
      if (position < 0) continue;
      const match = lines[position].match(
        /^\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})(?:\s.*)?$/,
      );
      C.assert(match, `第 ${cues.length + 1} 条字幕时间格式无效`);
      const start = toSeconds(match[1]),
        end = toSeconds(match[2]);
      const text = lines
        .slice(position + 1)
        .join("\n")
        .replace(/<br\s*\/?>/gi, "\n")
        // Remove known subtitle markup only; never erase generic types such as List<T>.
        .replace(
          /<\/?(?:b|i|u|s|font|c|v|lang|ruby|rt)(?:[\s.][^<>]*)?\s*>/gi,
          "",
        )
        .replace(/<(?:\d{2}:)?\d{2}:\d{2}\.\d{3}>/g, "")
        .replace(
          /&(?:amp|lt|gt|nbsp|quot);/g,
          (entity) =>
            ({
              "&amp;": "&",
              "&lt;": "<",
              "&gt;": ">",
              "&nbsp;": " ",
              "&quot;": '"',
            })[entity],
        )
        .trim();
      C.assert(
        end > start && text,
        `第 ${cues.length + 1} 条字幕内容或时间无效`,
      );
      cues.push({
        id: `cue-${cues.length}`,
        start,
        end,
        text,
        repaired: "",
        translation: "",
      });
    }
    C.assert(
      cues.length && cues.length <= 30000,
      "未找到可用字幕，或字幕超过 30000 行",
    );
    return cues.sort((a, b) => a.start - b.start);
  }
  const subtitleTime = (seconds, comma = false) => {
    const total = Math.round(seconds * 1000);
    return `${C.timeLabel(Math.floor(total / 1000))}${comma ? "," : "."}${String(total % 1000).padStart(3, "0")}`;
  };
  function exportSubtitles(transcript, format = "srt", bilingual = true) {
    C.assert(["srt", "vtt"].includes(format), "不支持的字幕格式");
    const body = transcript.cues
      .map((cue, index) => {
        const value = [
          cue.repaired || cue.text,
          bilingual ? cue.translation : "",
        ]
          .filter(Boolean)
          .join("\n")
          .replace(/\n\s*\n/g, "\n")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        return `${format === "srt" ? `${index + 1}\n` : ""}${subtitleTime(cue.start, format === "srt")} --> ${subtitleTime(cue.end, format === "srt")}\n${value}`;
      })
      .join("\n\n");
    return `${format === "vtt" ? "WEBVTT\n\n" : ""}${body}\n`;
  }
  const markdownText = (value) =>
    String(value).replace(/[\\`*_{}\[\]<>#!|]/g, "\\$&");
  const sourceLink = (material, seconds) => {
    if (!material.sourceUrl) return C.timeLabel(seconds);
    const url = new URL(material.sourceUrl);
    if (/(^|\.)youtube\.com$/.test(url.hostname) || url.hostname === "youtu.be")
      url.searchParams.set("t", `${Math.floor(seconds)}s`);
    else url.hash = `t=${Math.floor(seconds)}`;
    return `[${C.timeLabel(seconds)}](${url.href})`;
  };
  function exportLearningNotes(state, selectedIds = null) {
    const notes = state.notes.filter(
      (note) => !selectedIds || selectedIds.includes(note.id),
    );
    const lines = ["# 学习笔记", ""];
    for (const note of notes) {
      const origin = C.noteOrigin(state, note);
      lines.push(
        `## ${markdownText(note.body.split("\n")[0].slice(0, 80) || origin.title)}`,
        "",
        `更新时间：${new Date(note.updatedAt).toISOString()}`,
        "",
      );
      if (origin.kind !== "none") {
        lines.push(
          `出处：${markdownText(origin.title)}`,
          origin.url ? `链接：${origin.url}` : "",
          origin.start !== null
            ? `时间：${sourceLink({ sourceUrl: origin.url }, origin.start)}`
            : "",
          "",
        );
        if (origin.quote)
          lines.push(
            ...origin.quote
              .split("\n")
              .map((line) => `> ${markdownText(line)}`),
            "",
          );
      } else lines.push("出处：无（独立笔记）", "");
      lines.push(
        note.body || "（仅记录出处，暂无补充文字）",
        note.tags.length
          ? `标签：${note.tags.map(markdownText).join("、")}`
          : "",
        "",
      );
    }
    return lines.join("\n");
  }
  function exportMarkdown(state, materialId) {
    const material = state.materials.find((row) => row.id === materialId);
    C.assert(material, "资料不存在");
    const lines = [
      `# ${markdownText(material.title)}`,
      "",
      material.sourceUrl
        ? `来源：${material.sourceUrl}`
        : `本地文件：${markdownText(material.localFileName || "尚未关联")}`,
      "",
      "## 笔记与片段",
      "",
    ];
    const notes = state.notes.filter((row) => row.materialId === materialId);
    for (const clip of state.clips
      .filter((row) => row.materialId === materialId)
      .sort((a, b) => a.start - b.start)) {
      lines.push(
        `### ${sourceLink(material, clip.start)} — ${C.timeLabel(clip.end)}`,
        "",
        ...clip.text.split("\n").map((line) => `> ${markdownText(line)}`),
        "",
        markdownText(clip.translation),
        "",
      );
      for (const note of notes.filter((row) => row.clipId === clip.id))
        lines.push(
          note.body,
          note.tags.length
            ? `标签：${note.tags.map(markdownText).join("、")}`
            : "",
          "",
        );
    }
    for (const note of notes.filter((row) => !row.clipId))
      lines.push(note.body, "");
    for (const explanation of state.concepts.filter(
      (row) => row.materialId === materialId,
    )) {
      const transcript = state.transcripts.find(
        (row) => row.id === explanation.transcriptId,
      );
      lines.push(
        `## ${markdownText(explanation.question)}`,
        "",
        "### 视频中的内容",
        markdownText(explanation.inVideo),
        "",
        "### AI 补充背景",
        markdownText(explanation.background),
        "",
        "### 尚不能确认",
        markdownText(explanation.uncertainty),
        "",
        `模型：${markdownText(explanation.engine)} / ${markdownText(explanation.model)}`,
        "",
      );
      for (const cueId of explanation.citations) {
        const cue = transcript?.cues.find((item) => item.id === cueId);
        if (cue)
          lines.push(
            `- ${sourceLink(material, cue.start)} ${markdownText(cue.text)}`,
          );
      }
      lines.push("");
    }
    const files = {};
    for (const attachment of state.attachments.filter(
      (row) => row.materialId === materialId,
    )) {
      const image = decodeImage(attachment.dataUrl),
        name = `attachments/${attachment.id}.${image.extension}`;
      files[name] = image.bytes;
      lines.push(
        `![${markdownText(attachment.caption || C.timeLabel(attachment.time))}](${name})`,
        "",
      );
    }
    return { markdown: lines.join("\n"), files };
  }
  function decodeImage(dataUrl) {
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    C.assert(match, "图片格式无效");
    const binary = atob(match[2]);
    return {
      extension: match[1],
      bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    };
  }
  function encodeImage(bytes, extension) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return `data:image/${extension};base64,${btoa(binary)}`;
  }
  async function exportArchive(input) {
    const state = C.validateSnapshot(input),
      files = {},
      checksums = {};
    for (const table of C.TABLES) {
      const data =
        table === "attachments"
          ? state.attachments.map(({ dataUrl, ...row }) => {
              const image = decodeImage(dataUrl),
                file = `attachments/${row.id}.${image.extension}`;
              files[file] = image.bytes;
              return { ...row, file };
            })
          : state[table];
      files[`${table}.json`] = encoder.encode(JSON.stringify(data));
    }
    C.assert(
      Object.values(files).reduce((total, bytes) => total + bytes.length, 0) <=
        MAX_ARCHIVE,
      "备份超过 128 MB，请先导出部分笔记并整理附件",
    );
    for (const [name, bytes] of Object.entries(files))
      checksums[name] = await hashBytes(bytes);
    files["manifest.json"] = encoder.encode(
      JSON.stringify({
        format: "cheng-learning",
        version: C.VERSION,
        exportedAt: new Date().toISOString(),
        checksums,
        secretsIncluded: false,
        videoFilesIncluded: false,
      }),
    );
    // Stored ZIP entries make size limits enforceable before extraction (no decompression bombs).
    const archive = globalThis.fflate.zipSync(files, { level: 0 });
    C.assert(
      archive.length <= MAX_ARCHIVE,
      "项目包连同清单超过 128 MB，请整理附件后重试",
    );
    return archive;
  }
  async function importArchive(bytes) {
    C.assert(
      bytes instanceof Uint8Array && bytes.length <= MAX_ARCHIVE,
      "项目包不能超过 128 MB",
    );
    let total = 0;
    const seen = new Set();
    const files = globalThis.fflate.unzipSync(bytes, {
      filter(file) {
        C.assert(
          !seen.has(file.name) &&
            (file.name === "manifest.json" ||
              C.TABLES.some((table) => file.name === `${table}.json`) ||
              /^attachments\/[\w:.-]+\.(png|jpeg|webp)$/.test(file.name)),
          "项目包包含重复或不允许的文件",
        );
        seen.add(file.name);
        total += file.originalSize;
        C.assert(
          file.compression === 0 &&
            file.size === file.originalSize &&
            total <= MAX_ARCHIVE &&
            seen.size <= 50010,
          "只支持澄导出的无压缩项目包，或项目包大小超限",
        );
        return true;
      },
    });
    const manifest = JSON.parse(decoder.decode(files["manifest.json"]));
    C.assert(
      manifest.format === "cheng-learning" &&
        [1, 2, C.VERSION].includes(manifest.version) &&
        manifest.checksums &&
        typeof manifest.checksums === "object",
      "项目包版本不受支持",
    );
    C.assert(
      Object.keys(manifest.checksums).length === Object.keys(files).length - 1,
      "项目包文件清单不完整",
    );
    for (const [name, content] of Object.entries(files)) {
      if (name === "manifest.json") continue;
      C.assert(
        manifest.checksums[name] === (await hashBytes(content)),
        `项目包文件损坏：${name}`,
      );
    }
    const state = C.empty();
    for (const table of C.TABLES) {
      C.assert(files[`${table}.json`], `项目包缺少 ${table}`);
      state[table] = JSON.parse(decoder.decode(files[`${table}.json`]));
    }
    C.assert(Array.isArray(state.attachments), "图片附件表无效");
    state.attachments = state.attachments.map(({ file, ...row }) => {
      C.assert(
        typeof file === "string" &&
          /^attachments\/[\w:.-]+\.(png|jpeg|webp)$/.test(file) &&
          files[file]?.length <= 9 * 1024 * 1024,
        "附件丢失或大小超限",
      );
      return {
        ...row,
        dataUrl: encodeImage(files[file], file.split(".").pop()),
      };
    });
    return C.validateSnapshot(state);
  }
  function parseGlossary(value, format) {
    C.assert(
      typeof value === "string" && value.length <= 4 * 1024 * 1024,
      "术语文件不能超过 4 MB",
    );
    let rows;
    if (format === "json") {
      rows = JSON.parse(value);
      C.assert(Array.isArray(rows), "JSON 顶层必须是术语数组");
    } else {
      const matrix = [];
      let row = [],
        field = "",
        quoted = false;
      const input = value.replace(/^\uFEFF/, "");
      for (let index = 0; index <= input.length; index++) {
        const char = input[index];
        if (quoted) {
          if (char === '"' && input[index + 1] === '"') {
            field += '"';
            index++;
          } else if (char === '"') quoted = false;
          else if (char === undefined) throw new Error("CSV 引号未闭合");
          else field += char;
        } else if (char === '"' && !field) quoted = true;
        else if (char === "," || char === "\n" || char === undefined) {
          row.push(field.replace(/^'(?=\s*[=+@-]|[\t\r])/, ""));
          field = "";
          if (char !== ",") {
            if (row.some((cell) => cell.trim())) matrix.push(row);
            row = [];
          }
        } else if (char !== "\r") field += char;
      }
      const headers = matrix.shift()?.map((cell) => cell.trim());
      C.assert(
        headers?.includes("source") && headers.includes("target"),
        "CSV 必须包含 source,target 列，可选 aliases,note 列",
      );
      rows = matrix.map((cells) =>
        Object.fromEntries(
          headers.map((header, index) => [header, cells[index] || ""]),
        ),
      );
    }
    C.assert(rows.length > 0 && rows.length <= 5000, "每次导入 1–5000 条术语");
    return rows.map((row) => ({
      source: C.text(row.source, 200).trim(),
      target: C.text(row.target, 500).trim(),
      aliases: Array.isArray(row.aliases)
        ? row.aliases.map((value) => C.text(value, 200))
        : String(row.aliases || "")
            .split("|")
            .map((value) => value.trim())
            .filter(Boolean),
      note: C.text(row.note || "", 1000),
    }));
  }
  function exportGlossaryCsv(rows) {
    const cell = (value) => {
      let text = String(value);
      if (/^(?:\s*[=+@-]|[\t\r])/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    return (
      "\uFEFF" +
      [
        ["source", "target", "aliases", "note"],
        ...rows.map((row) => [
          row.source,
          row.target,
          row.aliases.join("|"),
          row.note,
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n")
    );
  }
  Object.assign(C, {
    parseSubtitles,
    exportSubtitles,
    exportMarkdown,
    exportLearningNotes,
    exportArchive,
    importArchive,
    hashBytes,
    encodeImage,
    parseGlossary,
    exportGlossaryCsv,
  });
})();
