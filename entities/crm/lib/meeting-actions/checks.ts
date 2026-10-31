import { foldDiacritics } from "@/kernel/config/people-name";
import { escapeHtml } from "@/kernel/config/html";
import { CARDS_ONLY_TYPE, CHAIN_START } from "./steps";

// The chain's deterministic checks (Z.13, spec sections 2 and 5). Pure, so each
// is tested on its own and the steps only call them. A transcript holds the
// words of people outside Edge8 and a notes upload is any file, so nothing the
// model returns is trusted on its word: an action must quote a line that is in
// the transcript, an owner must be a name the chain supplied, a recipient is
// only ever a CRM contact, and a draft may not carry an address or a link the
// meeting and the CRM do not.

// ── Which meetings start a run from the tick (decisions 2 and 3) ─────────────

export type ScopeFacts = {
  companyId: string | null;
  archivedAt: string | null;
  summary: string | null;
  aiStatus: string | null;
  lifecycleStage: string | null;
  meetingType: string | null;
  createdAt: string;
};

/**
 * Whether the tick opens a run for this meeting: a client meeting at a
 * customer company, not a Sales meeting (Z.10's), with a summary that is
 * ready or written outside the app (ai_status null), written after the chain
 * started. Answers why not, for the tests and the logs.
 */
export function tickScope(m: ScopeFacts): { open: true } | { open: false; why: string } {
  if (!m.companyId) return { open: false, why: "not a client meeting" };
  if (m.archivedAt) return { open: false, why: "archived" };
  if (!m.summary?.trim()) return { open: false, why: "no summary yet" };
  if (m.aiStatus !== null && m.aiStatus !== "ready") return { open: false, why: `summary ${m.aiStatus}` };
  if (m.lifecycleStage !== "customer") return { open: false, why: `the company is at ${m.lifecycleStage ?? "no"} stage` };
  if (m.meetingType === "Sales") return { open: false, why: "a Sales meeting belongs to the proposal chain" };
  if (m.createdAt < CHAIN_START) return { open: false, why: "written before the chain started" };
  return { open: true };
}

/** Whether a meeting of this type gets a follow-up email, not only cards (decision 2). */
export function wantsFollowupEmail(meetingType: string | null): boolean {
  return meetingType !== CARDS_ONLY_TYPE;
}

// ── Names ────────────────────────────────────────────────────────────────────

/** A name as the chain compares names: accents and case folded, spaces collapsed. */
export function foldName(name: string): string {
  return foldDiacritics(name.replace(/\s+/g, " ").trim());
}

/**
 * The supplied name an owner the model named matches, exactly after folding,
 * or null. The model is told the lists are the only source of owner names; a
 * name it made up, or one a speaker planted, matches nothing.
 */
export function suppliedName(said: string | null | undefined, supplied: readonly string[]): string | null {
  if (!said?.trim()) return null;
  const want = foldName(said);
  return supplied.find((n) => foldName(n) === want) ?? null;
}

export type ContactCandidate = { personId: string; names: string[] };

/**
 * The company's contacts whose name equals an attendee's name after folding,
 * exactly (spec section 3, "Recipients"). Never fuzzy: emailing the wrong
 * person is the worst thing this chain can do.
 */
export function matchRecipients(attendees: readonly string[], contacts: readonly ContactCandidate[]): string[] {
  const present = new Set(attendees.map(foldName).filter(Boolean));
  return contacts.filter((c) => c.names.some((n) => present.has(foldName(n)))).map((c) => c.personId);
}

// ── Evidence (spec section 5, point 4) ───────────────────────────────────────

// Quotes the model may straighten or curl, and the marks it may wrap a quote in.
const QUOTES = /[‘’‚‛]/g;
const DOUBLE_QUOTES = /[“”„‟]/g;
const WRAPPERS = /^["'\s.…-]+|["'\s.…-]+$/g;

/** Text as the evidence check compares it: case and whitespace folded, quotes straightened. */
export function foldEvidence(text: string): string {
  return text.replace(QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

// A quote this short could be found in any transcript ("yes", "we will").
const MIN_EVIDENCE = 12;

/** Whether `evidence` is a line of the transcript (`foldedTranscript` is foldEvidence of it). */
export function evidenceHolds(evidence: string | null | undefined, foldedTranscript: string): boolean {
  // The screened transcript numbers its lines "[L12]"; a quote that kept the number is still the line.
  const quote = foldEvidence(evidence ?? "").replace(/^\s*\[l\d+\]\s*/, "").replace(WRAPPERS, "");
  return quote.length >= MIN_EVIDENCE && foldedTranscript.includes(quote);
}

// ── The draft (spec section 5, point 5) ──────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EMAILS = new RegExp(EMAIL.source, "g");
// A link with a scheme or a protocol-relative "//", or one starting "www.".
const SCHEMED = /(?:\b[a-z][a-z0-9+.-]*:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const WWW = /\bwww\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
// A bare hostname: one followed by a path ("acme-billing.io/invoice"), or one
// whose last label is a common top-level domain ("acme-billing.io"). Not every
// "word.word": "Node.js" or "v2.5" in a sentence is no link, and a draft that
// failed on them would stop the run for nothing.
const BARE_WITH_PATH = /(?<![@\w/.-])([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\/[^\s<>()"']*/gi;
const BARE = /(?<![@\w/.-])([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ai|app|dev|info|biz|xyz|me|link|ly|to|us|uk|vn|au|sg|de|fr|page|site|online|store|shop|cloud|tech|so|gg|tv))\b(?![\w-])/gi;

/** Every host a text links to, in any of the forms a reader's mail client would make a link of. */
export function linkedHosts(text: string): string[] {
  const plain = text.replace(EMAILS, " ");
  const hosts = new Set<string>();
  for (const re of [SCHEMED, WWW, BARE_WITH_PATH, BARE]) {
    for (const m of plain.matchAll(re)) hosts.add(m[1].toLowerCase().replace(/^www\./, "").replace(/\.$/, ""));
  }
  return [...hosts];
}

/** The host of a company's website, without www., or null. */
export function companyDomain(websiteUrl: string | null | undefined): string | null {
  const raw = websiteUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** This deployment's own site, from its configuration rather than a name in the code. */
export function ownDomain(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  return companyDomain(siteUrl);
}

/**
 * Why a draft may not go out as it is, or an empty list. An email address is
 * never allowed in the body or subject (recipients and the sender come from
 * the CRM, never from the text), and a link only to the client's own domain or
 * this deployment's. The approver still reads every word before it goes.
 */
export function draftProblems(
  draft: { subject: string; bodyMd: string },
  clientDomain: string | null,
  // This deployment's own site, from its configuration rather than a name in
  // the code, so a fork links to its own domain and not to Edge8's.
  own: string | null = ownDomain(),
): string[] {
  const problems: string[] = [];
  const text = `${draft.subject}\n${draft.bodyMd}`;
  if (!draft.subject.trim()) problems.push("The subject is empty.");
  if (!draft.bodyMd.trim()) problems.push("The message is empty.");
  if (EMAIL.test(text)) problems.push("The draft carries an email address; recipients come only from the CRM.");
  const allowed = [own, clientDomain].filter((d): d is string => Boolean(d));
  for (const host of linkedHosts(text)) {
    const ok = allowed.some((d) => host === d || host.endsWith(`.${d}`));
    if (!ok) problems.push(`The draft links outside the client's domain and this deployment's: ${host}.`);
  }
  return problems;
}

/**
 * The follow-up as an email body: the Markdown the approver read, escaped, as
 * paragraphs, with "- " lines as a list. Deliberately small: the draft is
 * plain prose and bullets, and anything richer is text the approver did not
 * see rendered.
 */
export function followupHtml(bodyMd: string): string {
  const blocks = bodyMd.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length === 0) return "";
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      const head = lines.findIndex((l) => /^\s*[-*]\s+/.test(l));
      if (head > 0 && lines.slice(head).every((l) => /^\s*[-*]\s+/.test(l))) {
        const text = lines.slice(0, head).map(escapeHtml).join("<br>");
        const items = lines.slice(head).map((l) => `<li>${escapeHtml(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("");
        return `<p>${text}</p><ul>${items}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}
