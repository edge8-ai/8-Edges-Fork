export { readerQuestionError } from "../campaign-plan-shared";
import type { WordRange } from "./profile-rules";

// The house guardrails the pipeline enforces on a post body, as pure functions
// over markdown so every one of them can be proved to block in a test. They
// sit beside validateBlogForPublish (which owns the publish-time presence
// checks) and cover what that gate cannot see: process, not presence.
//
// Two kinds of rule live here. The brand's own rules come from brand_profiles
// and reach the model through the prompts; the checks below are the
// cross-brand house rules (no em dashes, no audit or staffing language, the
// brand name spelled "Edge8", links only to our own sites) that hold whatever
// a profile says.

export const EM_DASH = "—";

// Text the reader sees: the body without figures, FAQ markup, raw HTML and
// markdown syntax. Used for word counts and phrase checks.
export function readerText(md: string): string {
  return md
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(/<details[\s\S]*?<\/details>/gi, " ")
    // An anchor is inline: the reader sees its text joined to the punctuation
    // around it, so the tags vanish without leaving a space. Every other tag
    // is a block boundary and still separates words.
    .replace(/<\/?a\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The post as a reader counts it: the body above the FAQ, prose only.
export function wordCount(md: string): number {
  const text = readerText(md.split(/^## FAQ\s*$/im)[0]);
  // A token with no letter or digit (a lone dash, a bullet) is punctuation, not a word.
  return text ? text.split(" ").filter((t) => /[\p{L}\p{N}]/u.test(t)).length : 0;
}

export function wordRangeError(md: string, range: WordRange): string | null {
  const n = wordCount(md);
  if (n < range.min) return `Body is ${n} words; the brand profile asks for ${range.min} to ${range.max}.`;
  if (n > range.max) return `Body is ${n} words; the brand profile asks for ${range.min} to ${range.max}.`;
  return null;
}

export function emDashError(text: string): string | null {
  return text.includes(EM_DASH) ? "Contains an em dash. Rewrite the sentence with a comma, colon, period or parentheses." : null;
}

// Edge8 discontinued the AI audit and a post is not a staffing or hiring pitch.
// Whole words, case-insensitive; "hire" on its own is allowed because it is
// ordinary English ("your first AI hire" is a page on the site).
const BANNED = [/\baudits?\b/i, /\baudited\b/i, /\bstaffing\b/i, /\bhiring\b/i, /\brecruit(?:er|ers|ing|ment)?\b/i];

export function bannedLanguageError(md: string): string | null {
  const text = readerText(md);
  const hits = BANNED.map((re) => text.match(re)?.[0]).filter((h): h is string => Boolean(h));
  return hits.length ? `Uses audit, staffing or hiring language (${Array.from(new Set(hits.map((h) => h.toLowerCase()))).join(", ")}). Remove it.` : null;
}

// "Edge8", never all caps, never split. The domain edge8.ai and addresses
// at edge8 are left alone.
export function brandNameError(text: string): string | null {
  return /\bEDGE8\b|\bEdge 8\b|\bedge8\b(?![.@])/.test(text) ? 'The brand name is written "Edge8" exactly; fix the casing.' : null;
}

// Where a link is allowed to point. Our own sites are internal; anything else
// is an external source. An audit page is never linked, on any host.
// Configuration, not a literal: this was a hardcoded list of the upstream's own
// properties, so on a fork every link to its OWN site counted as an external
// source while links to the previous owner's counted as internal — the check
// inverted. NEXT_PUBLIC_SITE_URL is always ours; INTERNAL_LINK_HOSTS adds any
// sibling sites. Both bare and www. forms are accepted for each.
const INTERNAL_HOSTS = new Set(
  [process.env.NEXT_PUBLIC_SITE_URL ?? "", ...(process.env.INTERNAL_LINK_HOSTS ?? "").split(",")]
    .map((v) => v.trim())
    .filter(Boolean)
    .flatMap((v) => {
      const host = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
      return host ? [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`] : [];
    }),
);

export function isInternalUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    return INTERNAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function linkTargets(md: string): string[] {
  const urls: string[] = [];
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) urls.push(m[1]);
  for (const m of md.matchAll(/<a\s[^>]*href="([^"]+)"/gi)) urls.push(m[1]);
  return urls;
}

export function auditLinkError(md: string): string | null {
  const hit = linkTargets(md).find((u) => /audit/i.test(u));
  return hit ? `Links to an audit page (${hit}). Edge8 has no audit offer; remove the link.` : null;
}

// The internal-link floor counts markdown links to /post/<slug>/ in the body
// above the FAQ, the same count validateBlogForPublish makes.
export function internalPostLinks(md: string): string[] {
  const body = md.split(/^## FAQ\s*$/im)[0];
  return Array.from(body.matchAll(/\]\(\/post\/([a-z0-9-]+)\/?\)/g)).map((m) => m[1]);
}

// FAQ: five items, the first a How or What question that carries the primary
// keyword, because that is the question an AI overview extracts.
export function faqQuestions(md: string): string[] {
  return Array.from(md.matchAll(/<details[^>]*class="faq-item"[^>]*>\s*<summary>([\s\S]*?)<\/summary>/gi)).map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
}

// A figure is a number the reader can cite, whether the post writes it in
// digits or in words: "four layers" and "six months" are figures as much as
// "37%" is. The body follows house style and spells small numbers out, so a
// check that read only digits found nothing to cite in a post built on "four
// layers, two rules, one named person" and stopped the run twice (Day 2 of the
// 8 Edges season, 2026-09-22). Number words are rewritten to digits before any
// figure is read, on the answer and on the body alike, so "four" and "4" match.
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16",
  seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50",
  sixty: "60", seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000", million: "1000000",
  billion: "1000000000",
};
const NUMBER_WORD_RE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

function digitsForWords(text: string): string {
  return text.replace(/,/g, "").replace(NUMBER_WORD_RE, (w) => NUMBER_WORDS[w.toLowerCase()]);
}

export function figuresIn(text: string): string[] {
  return Array.from(digitsForWords(text).matchAll(/\d+(?:\.\d+)?/g)).map((m) => m[0]);
}

export function hasFigure(text: string): boolean {
  return figuresIn(text).length > 0;
}

// Every FAQ answer carries at least one figure the post itself states: AI
// answer engines quote specific numbers, and an answer without one gives them
// nothing to cite. The figure has to be in the body or the idea, so the FAQ
// can never introduce a number the post does not stand behind.
export function faqDataError(faq: { question: string; answer: string }[], sourceText: string): string | null {
  const known = digitsForWords(sourceText);
  for (const f of faq) {
    const numbers = figuresIn(f.answer);
    if (!numbers.length) return `The FAQ answer to "${f.question}" has no figure; back it with a number the post states.`;
    if (!numbers.some((n) => known.includes(n))) {
      return `The FAQ answer to "${f.question}" cites ${numbers.join(", ")}, which the post never states; use a figure from the body.`;
    }
  }
  return null;
}

export function faqError(md: string, primaryKeyword: string | null, count = 5): string | null {
  const qs = faqQuestions(md);
  if (qs.length !== count) return `The FAQ has ${qs.length} item(s); the process asks for ${count}.`;
  if (!/^(how|what)\b/i.test(qs[0])) return `The first FAQ question must start with How or What; it reads "${qs[0]}".`;
  if (primaryKeyword && !qs[0].toLowerCase().includes(primaryKeyword.toLowerCase())) {
    return `The first FAQ question must carry the primary keyword "${primaryKeyword}"; it reads "${qs[0]}".`;
  }
  return null;
}

// Data points the reader can scan: bold runs that contain a digit.
export function boldDataPoints(md: string): string[] {
  return Array.from(readerBody(md).matchAll(/\*\*([^*\n]+)\*\*/g))
    .map((m) => m[1])
    .filter((s) => /\d/.test(s));
}

function readerBody(md: string): string {
  return md.split(/^## FAQ\s*$/im)[0].replace(/<figure[\s\S]*?<\/figure>/gi, " ").replace(/<div class="idea-in-brief">[\s\S]*?<\/div>\s*<\/div>/i, " ");
}

// Every number an exhibit shows must already be in the body: an exhibit
// illustrates the argument, it never introduces a fact. Numbers are read from
// the SVG's text nodes only, so coordinates and sizes are ignored.
export function exhibitNumbers(svg: string): string[] {
  const text = Array.from(svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>|<tspan[^>]*>([\s\S]*?)<\/tspan>/gi))
    .map((m) => (m[1] ?? m[2] ?? "").replace(/<[^>]+>/g, " "))
    .join(" ");
  return Array.from(new Set(Array.from(text.matchAll(/\d[\d,.]*\d|\d/g)).map((m) => m[0].replace(/[,.]$/, ""))));
}

export function exhibitNumbersError(svg: string, bodyMd: string, label: string): string | null {
  const body = readerText(bodyMd).replace(/,/g, "");
  const missing = exhibitNumbers(svg).filter((n) => !body.includes(n.replace(/,/g, "")));
  return missing.length ? `${label} shows ${missing.join(", ")}, which the body never states.` : null;
}

export function countBlocks(md: string, className: string): number {
  return (md.match(new RegExp(`class="${className}"`, "g")) ?? []).length;
}

// The quality rules a finished post has to meet on top of validateBlogForPublish.
export function qualityErrors(md: string, opts: { primaryKeyword: string | null; range: WordRange | null }): string[] {
  const errors: string[] = [];
  for (const e of [emDashError(md), bannedLanguageError(md), brandNameError(md), auditLinkError(md)]) if (e) errors.push(e);
  if (opts.range) {
    const e = wordRangeError(md, opts.range);
    if (e) errors.push(e);
  }
  if (countBlocks(md, "idea-in-brief") !== 1) errors.push("The post needs exactly one Idea in Brief box.");
  if (countBlocks(md, "post-figure") < 2) errors.push(`The post has ${countBlocks(md, "post-figure")} exhibit(s); the process asks for at least two.`);
  if (!/^>\s*\S/m.test(md)) errors.push("The post has no pull quote (a blockquote taken verbatim from a source).");
  if (boldDataPoints(md).length < 2) errors.push("Fewer than two bolded data points in the body.");
  const faq = faqError(md, opts.primaryKeyword);
  if (faq) errors.push(faq);
  return errors;
}
