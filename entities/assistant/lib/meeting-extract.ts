import mammoth from "mammoth";
import { MEETING_MAX_BYTES } from "./meeting-upload";

// Turn an uploaded meeting-notes file into plain transcript text. Unlike the
// resume flow (which hands PDFs to Claude natively), meeting notes must end up
// as readable TEXT: it is stored in call_transcripts.transcript and shown verbatim
// as the admin "Full transcript". So we only accept formats that extract to
// clean text — .txt / .vtt / .srt / .md / .markdown as UTF-8, and .docx via
// mammoth. PDFs are intentionally unsupported (paste the text instead).

// The cap and the accept list live in ./meeting-upload so the client door can
// hand MEETING_ACCEPT to the upload form without this file's .docx parser; the
// server callers keep taking the cap from here through the index.
export { MEETING_MAX_BYTES } from "./meeting-upload";

const TEXT_EXTS = [".txt", ".vtt", ".srt", ".md", ".markdown"];

type Extracted = { ok: true; text: string } | { ok: false; error: string };

// Strip WebVTT/SRT cue metadata (timestamps, indices, the WEBVTT header) so the
// transcript and the AI both see just spoken lines, not "00:00:12.000 --> ...".
function cleanCaptions(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^WEBVTT/i.test(t)) return false;
      if (/^\d+$/.test(t)) return false; // SRT cue index
      if (/-->/.test(t)) return false; // timestamp line
      return true;
    })
    .join("\n")
    .trim();
}

export async function extractTranscript(file: File): Promise<Extracted> {
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > MEETING_MAX_BYTES) return { ok: false, error: "File is too large (max 10 MB)." };

  const name = (file.name || "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) return { ok: false, error: "That .docx contained no extractable text." };
    return { ok: true, text };
  }

  if (TEXT_EXTS.some((ext) => name.endsWith(ext))) {
    // Decode UTF-8 and drop a leading byte-order mark if present.
    const decoded = buffer.toString("utf8").replace(/^﻿/, "").trim();
    if (!decoded) return { ok: false, error: "That file contained no readable text." };
    const isCaptions = name.endsWith(".vtt") || name.endsWith(".srt");
    return { ok: true, text: isCaptions ? cleanCaptions(decoded) : decoded };
  }

  return {
    ok: false,
    error: "Unsupported file type. Upload .txt, .vtt, .srt, .md, or .docx - or paste the text.",
  };
}
