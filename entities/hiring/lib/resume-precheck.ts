import { screenUntrusted } from "@/kernel/ai/screen";
import type { ScreenFlag } from "./chain/proposal";

// The deterministic pre-check that runs before the resume screen's model call
// (Z.9, spec section 5). The résumé, the cover letter and the screening
// answers are written by the candidate, and the screen is a model reading
// them, so a candidate can write to the screener instead of to us.
//
// The general rules are the kernel's (kernel/ai/screen.ts, review finding 3):
// zero-width and bidirectional characters stripped and flagged, "ignore
// previous instructions" and its kin, role tags (a tag closing the fence
// included), tool-call syntax. Two of its rules are left out. Its foreign-link
// rule: a résumé links to the candidate's own work, and holding every one would
// hold everyone. And its flag on C0/C1 control characters, which are still
// stripped: a PDF reader emits them for icon fonts and bullets, and on the
// 9 October 2026 go-live eval they held 10 of 43 real résumés, none of which
// hid anything. What only a résumé needs stays here: a request to rate the
// candidate, "you are an AI", a note to the screener, [INST] tags, the
// invisible characters the kernel does not flag (a byte-order mark inside the
// text, Unicode tag characters), and the PDF's text a person cannot see.
//
// A flag never blocks the screen and never declines anyone. It is stored on
// applications.ai_screen_flags, it puts the application in the shortlist's
// hold lane (decision 15), and a person reads the résumé. Pure apart from the
// kernel's nonce, so the planted-instruction fixtures run without a model.

const QUOTE_MAX = 120;
const SCREEN_MAX = 100_000;

type Rule = { kind: string; pattern: RegExp };

// Résumé-specific, on the text as the kernel cleaned it. Each pattern is
// narrow on purpose: "you are" alone appears in every cover letter ("you are
// looking for"), so only "you are an AI" and its kin count.
const RESUME_RULES: Rule[] = [
  { kind: "instruction", pattern: /\byou\s+are\s+(?:now\s+)?(?:an?\s+|the\s+)?(?:ai|a\.i\.|assistant|language\s+model|llm|chatbot|screener|screening\s+(?:tool|model|bot)|recruit(?:ing|er)\s+(?:bot|ai|assistant)|gpt|claude)\b/i },
  { kind: "instruction", pattern: /\b(?:rate|score|rank|grade|mark)\s+(?:this|the|my)\s+(?:candidate|application|applicant|resume|résumé|cv|profile)\b[^.\n]{0,40}?\b(?:5|five|10|ten|highest|top|perfect|maximum|excellent)\b/i },
  { kind: "instruction", pattern: /\b(?:give|assign)\s+(?:this\s+candidate|me|them|the\s+candidate)\s+(?:a\s+|the\s+)?(?:5|five|10|ten|perfect|maximum|top|highest)\b[^.\n]{0,20}?\b(?:rating|score|mark)/i },
  { kind: "instruction", pattern: /\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+)?(?:ai|a\.i\.|llm|model|screener|assistant|chatbot|recruiting\s+(?:ai|bot|tool))\b/i },
  { kind: "role-tag", pattern: /\[\/?\s*(?:system|inst|assistant)\s*\]/i },
];

/** What a candidate wrote, by where it came from: resume, cover_letter or answers. */
export type CandidateText = { source: string; text: string };

/** What the PDF reader could tell about text a person cannot see. */
export type LayoutFacts = { pages: number | null; hiddenChars: number };

/** Characters of text drawn at no visible size before it counts as hidden on purpose. */
export const HIDDEN_CHARS_AT = 20;
/** Extracted characters per page beyond which a page holds far more than it shows. */
export const DENSE_CHARS_PER_PAGE = 9000;

// Invisible characters the kernel lets through unflagged. It strips a
// byte-order mark but counts it as whitespace, and it leaves Unicode tag
// characters (U+E0000 to U+E007F), which spell ASCII no reader can see, in the
// text. One leading byte-order mark is an encoding artefact, not a hiding place.
const UNFLAGGED_INVISIBLE = /[\uFEFF\u{E0000}-\u{E007F}]/u;
const UNFLAGGED_INVISIBLE_ALL = /[\uFEFF\u{E0000}-\u{E007F}]/gu;

/** The line as a person should read it: tag characters spelled out as the ASCII they encode, the rest dropped. */
const revealed = (line: string) =>
  line.replace(UNFLAGGED_INVISIBLE_ALL, (ch) => {
    const ascii = (ch.codePointAt(0) ?? 0) - 0xe0000;
    return ascii >= 0x20 && ascii < 0x7f ? String.fromCharCode(ascii) : "";
  });

const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, QUOTE_MAX);

/** The kernel's cleaned text back out of its fence: the wrapping tag and the [Ln] numbers removed. */
function cleanedLines(fenced: string): string {
  return fenced
    .split("\n")
    .slice(1, -1)
    .map((line) => line.replace(/^\[L\d+\] ?/, ""))
    .join("\n");
}

/** Every flag in the candidate's own documents; empty when nothing reads as written to a screener. */
export function precheck(texts: CandidateText[], layout: LayoutFacts | null = null): ScreenFlag[] {
  const flags: ScreenFlag[] = [];
  const seen = new Set<string>();
  const add = (source: string, kind: string, quote: string) => {
    const key = `${source}:${kind}:${quote.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    flags.push({ source, kind, quote });
  };
  for (const { source, text } of texts) {
    if (!text) continue;
    const screened = screenUntrusted(text, { maxChars: SCREEN_MAX, flagControlCharacters: false });
    for (const f of screened.flags) {
      if (f.kind === "foreign-link") continue;
      add(source, f.kind, short(f.excerpt));
    }
    const hiding = text
      .replace(/^\uFEFF/, "")
      .split("\n")
      .find((line) => UNFLAGGED_INVISIBLE.test(line));
    if (hiding !== undefined) add(source, "hidden-characters", short(revealed(hiding)));
    const cleaned = cleanedLines(screened.text);
    for (const rule of RESUME_RULES) {
      const m = rule.pattern.exec(cleaned);
      if (m) add(source, rule.kind, short(cleaned.slice(m.index, m.index + m[0].length)));
    }
  }
  if (layout && layout.hiddenChars >= HIDDEN_CHARS_AT) {
    add("resume", "hidden-text", `${layout.hiddenChars} characters drawn at a size no reader can see`);
  }
  const resume = texts.find((t) => t.source === "resume");
  if (layout?.pages && resume && resume.text.length / layout.pages > DENSE_CHARS_PER_PAGE) {
    add("resume", "dense-text", `${resume.text.length} characters extracted from ${layout.pages} page${layout.pages === 1 ? "" : "s"}`);
  }
  return flags;
}

/** The model's own report (prompt v2), as a flag when it found anything. */
export function modelFlag(found: boolean, quote: string): ScreenFlag[] {
  if (!found) return [];
  return [{ source: "screen", kind: "model-found-instructions", quote: short(quote) }];
}
