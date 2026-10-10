import { STATUS_SECTIONS, type StatusFacts } from "./facts";
import type { StatusNarrative } from "./draft";
import { summaryOf, visibleText } from "./render";

// The check every draft, every plain report and every edit by the account
// owner passes before it is saved as the week's draft (Z.12, spec §5; Z.12.1).
// Deterministic: the same page gives the same answer, so a refusal can be shown
// to the account owner and fed back to the model as a rule. A page fails when
// it carries a token, hour or money figure, names another active client, links
// anywhere or gives an email address, cites a fact that is not in the facts,
// leaves a section empty that has facts, or runs past the template's caps.

export type CheckInput = {
  bodyHtml: string;
  narrative: StatusNarrative | null;
  facts: StatusFacts;
  /** The other active clients' names: none may appear on this client's page. */
  otherClients: string[];
};

export type CheckResult = { ok: true } | { ok: false; rule: CheckRule; detail: string };

export type CheckRule = "token-figure" | "hours-or-money" | "other-client" | "link-or-email" | "ungrounded" | "empty-section" | "too-long";

/** What the review page says each passed rule guarantees. */
export const CHECK_PROMISES: Record<CheckRule, string> = {
  "token-figure": "No token figure",
  "hours-or-money": "No hour or money figure",
  "other-client": "No other client named",
  "link-or-email": "No link and no email address",
  ungrounded: "Every line traced to a card, a roadmap item or a document",
  "empty-section": "No section left empty while it has facts",
  "too-long": "Within the page's length",
};

export const SUMMARY_MAX_SENTENCES = 3;
export const SUMMARY_MAX_CHARS = 600;
export const LINE_MAX_CHARS = 280;
export const SECTION_MAX_LINES = 8;
export const PAGE_MAX_CHARS = 20_000;

const TOKEN = /\btokens?\b|\bHTs?\b|human[\s-]+tokens?/i;
const HOURS = /\b\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|days?)\b/i;
const MONEY = /[$€£₫]\s*\d|\d\s*[$€£₫]|\b(?:USD|VND|AUD|SGD|EUR|GBP)\b|\d+(?:[.,]\d+)?\s*%\s*of\s+(?:the\s+|your\s+)?budget/i;
const LINK = /https?:\/\/|\bwww\.|<a\b|href\s*=/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentences(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
}

/** The first rule the page breaks, or ok. */
export function checkStatusPage(input: CheckInput): CheckResult {
  const { bodyHtml, narrative, facts } = input;
  const text = visibleText(bodyHtml);

  if (TOKEN.test(text)) return { ok: false, rule: "token-figure", detail: "it mentions tokens. Token figures are never on a client page; the client sees them on their Tokens page." };
  if (HOURS.test(text)) return { ok: false, rule: "hours-or-money", detail: "it gives a number of hours or days." };
  if (MONEY.test(text)) return { ok: false, rule: "hours-or-money", detail: "it names an amount of money or a share of a budget." };

  for (const name of input.otherClients) {
    const n = name.trim();
    if (n.length < 3 || n.toLowerCase() === facts.company.toLowerCase()) continue;
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(n)}($|[^\\p{L}\\p{N}])`, "iu").test(text)) {
      return { ok: false, rule: "other-client", detail: `it names another client, ${n}.` };
    }
  }

  if (LINK.test(bodyHtml) || LINK.test(text)) return { ok: false, rule: "link-or-email", detail: "it carries a link. A client page links nowhere." };
  if (EMAIL.test(text)) return { ok: false, rule: "link-or-email", detail: "it gives an email address." };

  if (narrative) {
    const ids = new Set(facts.items.map((f) => f.id));
    for (const key of STATUS_SECTIONS) {
      const stray = narrative[key].find((l) => !ids.has(l.factId));
      if (stray) return { ok: false, rule: "ungrounded", detail: `a line cites ${stray.factId || "no fact"}, which is not one of this week's facts.` };
    }
    for (const key of STATUS_SECTIONS) {
      if (narrative[key].length === 0 && facts.items.some((f) => f.section === key)) {
        return { ok: false, rule: "empty-section", detail: `the section "${key}" is empty though the facts have something for it.` };
      }
    }
    for (const key of STATUS_SECTIONS) {
      if (narrative[key].length > SECTION_MAX_LINES) return { ok: false, rule: "too-long", detail: `the section "${key}" has more than ${SECTION_MAX_LINES} lines.` };
      if (narrative[key].some((l) => l.line.length > LINE_MAX_CHARS)) return { ok: false, rule: "too-long", detail: `a line in "${key}" runs past ${LINE_MAX_CHARS} characters.` };
    }
  }
  const summary = summaryOf(bodyHtml);
  if (summary.length > SUMMARY_MAX_CHARS || sentences(summary) > SUMMARY_MAX_SENTENCES) {
    return { ok: false, rule: "too-long", detail: `the summary runs past ${SUMMARY_MAX_SENTENCES} sentences or ${SUMMARY_MAX_CHARS} characters.` };
  }
  if (bodyHtml.length > PAGE_MAX_CHARS) return { ok: false, rule: "too-long", detail: "the page is longer than the template allows." };
  return { ok: true };
}

/** "check: <rule>: <detail>", the form a refusal is kept in on the row and fed back to the model. */
export function refusalText(result: Extract<CheckResult, { ok: false }>): string {
  return `${result.rule}: ${result.detail}`;
}
