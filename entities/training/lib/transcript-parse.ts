// Transcripts as text (English Program PR 6): a pasted or uploaded .txt, .vtt
// or .srt becomes plain "Name: text" lines, the shape Lark's Minutes export
// already has, so attendance and the recap read every transcript the same way.
// Pure, tested on its own.

const TIME_LINE = /^\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s+-->\s+\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}/;

/** Whether the text is WebVTT or SubRip: a WEBVTT header or cue timing lines. */
export function looksLikeCues(text: string): boolean {
  return /^﻿?WEBVTT/.test(text) || TIME_LINE.test(text.split("\n").find((l) => l.includes("-->")) ?? "");
}

/**
 * Cue files to lines: timings, cue numbers, headers and tags are dropped; a
 * cue of "<v Name>text" or "Name: text" keeps its speaker; consecutive cues of
 * one speaker are joined so a long turn is one line.
 */
export function cuesToLines(text: string): string {
  const out: { speaker: string | null; text: string }[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || /^﻿?WEBVTT/.test(line) || /^\d+$/.test(line) || TIME_LINE.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    const voice = line.match(/^<v\s+([^>]+)>\s*(.*)$/);
    const labelled = line.match(/^([^:<>]{1,60}):\s+(.*)$/);
    const speaker = voice ? voice[1]!.trim() : labelled ? labelled[1]!.trim() : null;
    const body = (voice ? voice[2] : labelled ? labelled[2] : line)!.replace(/<[^>]+>/g, "").trim();
    if (!body) continue;
    const last = out[out.length - 1];
    if (last && speaker && last.speaker === speaker) last.text += ` ${body}`;
    else if (last && !speaker && last.speaker !== null) last.text += ` ${body}`;
    else out.push({ speaker, text: body });
  }
  return out.map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text)).join("\n");
}

/** Any transcript text, by its shape or its file name, as "Name: text" lines. */
export function parseTranscript(text: string, filename?: string | null): string {
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  const cues = ext === "vtt" || ext === "srt" || looksLikeCues(text);
  const plain = cues ? cuesToLines(text) : text.replace(/\r/g, "");
  return plain
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l.trim() !== "" || (i > 0 && arr[i - 1]!.trim() !== ""))
    .join("\n")
    .trim();
}
