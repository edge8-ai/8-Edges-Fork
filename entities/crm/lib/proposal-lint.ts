import { formatCents } from "@/kernel/ui/format";
import type { ProposalHouse } from "./proposal-pricing";
import { PROPOSAL_SECTIONS, type LineItem, type LintFinding, type ProposalDoc } from "./proposal-types";

// What the approver is told before deciding (Z.10): the house rules a page
// must keep, the price sanity check against the reference bands, and every
// claim that names nothing it rests on. Deterministic, and it never corrects:
// a finding is shown beside the section it is about and the approver decides.
// The rules are the skill's (.claude/skills/crm-call-to-proposal, section 4):
// the eleven sections in their fixed order, no em dashes, the brand never in
// capitals, robots noindex and the fixed share image.

export type LintInput = {
  doc: ProposalDoc;
  lineItems: LineItem[];
  amountCents: number;
  currency: string;
  house: ProposalHouse;
  /** The rendered page, when there is one, for the head rules. */
  html?: string | null;
};

const EM_DASH = /—/;

function allText(doc: ProposalDoc): { where: string; text: string }[] {
  return [
    { where: "the headline", text: doc.headline },
    { where: "the subtitle", text: doc.sub },
    ...doc.sections.map((s) => ({ where: `"${PROPOSAL_SECTIONS.find((d) => d.id === s.id)?.title ?? s.id}"`, text: `${s.heading}\n${s.body}` })),
  ];
}

/** The section rule: each of the eleven, once, in order. Null when it holds. */
export function sectionsError(doc: ProposalDoc): string | null {
  const ids = doc.sections.map((s) => s.id);
  const want = PROPOSAL_SECTIONS.map((s) => s.id);
  if (ids.length !== want.length || ids.some((id, i) => id !== want[i])) {
    return `The proposal must have its eleven sections in the fixed order (${PROPOSAL_SECTIONS.map((s) => s.title).join(", ")}).`;
  }
  return null;
}

/** Each line against its reference band, and the total against the lines. Exported for the price test. */
export function priceFindings(lineItems: LineItem[], amountCents: number, currency: string, house: ProposalHouse): LintFinding[] {
  const out: LintFinding[] = [];
  for (const li of lineItems) {
    const band = li.band ? house.bands.find((b) => b.key === li.band) : undefined;
    if (!band) {
      out.push({ rule: "price-band", tone: "warn", text: `"${li.label}" (${formatCents(li.amountCents, currency)}) names no reference band; check its price by hand.` });
      continue;
    }
    if (band.currency !== currency) {
      out.push({ rule: "price-band", tone: "warn", text: `"${li.label}" is priced in ${currency.toUpperCase()}, but its band "${band.label}" is in ${band.currency.toUpperCase()}.` });
      continue;
    }
    if (li.amountCents < band.minCents || li.amountCents > band.maxCents) {
      const range = band.minCents === band.maxCents ? formatCents(band.minCents, currency) : `${formatCents(band.minCents, currency)} to ${formatCents(band.maxCents, currency)}`;
      out.push({ rule: "price-band", tone: "warn", text: `"${li.label}" is ${formatCents(li.amountCents, currency)}, outside the reference band for ${band.label} (${range}).` });
    }
  }
  const sum = lineItems.reduce((n, li) => n + li.amountCents, 0);
  if (sum !== amountCents) {
    out.push({ rule: "total", tone: "warn", text: `The total ${formatCents(amountCents, currency)} is not the sum of its lines (${formatCents(sum, currency)}).` });
  }
  return out;
}

export function lintProposal(input: LintInput): LintFinding[] {
  const { doc, house } = input;
  const out: LintFinding[] = [];

  const order = sectionsError(doc);
  if (order) out.push({ rule: "sections", tone: "warn", text: order });
  for (const s of doc.sections) {
    if (s.id !== "footer" && !s.heading.trim()) out.push({ rule: "sections", tone: "warn", text: `"${PROPOSAL_SECTIONS.find((d) => d.id === s.id)?.title}" has no heading.` });
  }

  const capitals = house.brandName.toUpperCase();
  const brandInCapitals = capitals !== house.brandName ? new RegExp(`\\b${capitals.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : null;
  for (const { where, text } of allText(doc)) {
    if (EM_DASH.test(text)) out.push({ rule: "house-style", tone: "warn", text: `${where} has an em dash; the house style has none.` });
    if (brandInCapitals?.test(text)) out.push({ rule: "house-style", tone: "warn", text: `${where} writes ${capitals}; it is always ${house.brandName}.` });
  }

  if (input.html) {
    if (!/<meta name="robots" content="noindex/.test(input.html)) out.push({ rule: "house-style", tone: "warn", text: "The page is missing robots noindex." });
    if (!input.html.includes(`<meta property="og:image" content="${house.ogImageUrl}">`)) out.push({ rule: "house-style", tone: "warn", text: "The page's share image is not the fixed proposal image." });
  }

  for (const s of doc.sections) {
    if (s.id === "footer") continue;
    if (s.evidence.length === 0) {
      const title = PROPOSAL_SECTIONS.find((d) => d.id === s.id)?.title;
      out.push({ rule: "evidence", tone: "warn", text: `"${title}" names no line of the call, fact or reference band it rests on; check it before you approve.` });
    }
  }
  const risks = doc.sections.find((s) => s.id === "risks");
  if (risks) {
    const bullets = risks.body.split("\n").filter((l) => l.trim().startsWith("- ")).length;
    if (bullets !== 3) out.push({ rule: "sections", tone: "info", text: `Risks names ${bullets} risks; the house shape is exactly three.` });
  }

  out.push(...priceFindings(input.lineItems, input.amountCents, input.currency, house));
  return out;
}
