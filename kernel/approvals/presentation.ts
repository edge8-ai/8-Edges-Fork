// How each approval subject is shown wherever a pending one is listed (Z.2.1):
// its tier, the word on its tier chip, where it is decided, what its link says,
// who asked when no person did, and the facts its metadata carries. Browser-safe
// and pure, beside ./vocabulary, so the Team view's approvals inbox and the
// admin home's "Waiting on you" name the same pages instead of each keeping a
// copy that drifts.
//
// The table is keyed by every word in APPROVAL_SUBJECTS, so a new subject does
// not compile until it says how it is shown. A subject that is decided nowhere a
// list can link to (the assistant's action, decided inside the chat turn) has no
// pages, and a list shows it without a link rather than with a guessed one.
//
// The paths are candidates, best first. The caller keeps the first one the
// viewer may open (kernel/identity/may-open), so a page the viewer's access, or
// this deployment, does not reach is never offered.
import { formatCents } from "@/kernel/ui/format";
import type { ApprovalSubject } from "./vocabulary";

/**
 * 2: anything public, to many people, or a commitment. 1: a message to one
 * outside person. 0: internal.
 */
export type ApprovalTier = 0 | 1 | 2;

/** The surface a list is on; its own pages come first. */
export type ApprovalSurface = "team" | "admin";

export type ApprovalFact = { label: string; value: string };

/** What the presentation reads of a pending approval. */
export type PresentedApproval = { subjectType: ApprovalSubject; subjectId: string; metadata: Record<string, unknown> };

type Pages = { team: string[]; admin: string[] };

type Presentation = {
  tier: ApprovalTier;
  /** The chip's second word, after the tier: who or what the decision reaches. */
  reach: (meta: Record<string, unknown>) => string;
  /** What the link to the deciding page says. */
  cta: string;
  /** Who asked, when the row names no person: the routine or agent that opened it. */
  asker: string | null;
  pages: (a: PresentedApproval) => Pages;
  /** The facts only this subject knows how to read from its metadata. */
  facts?: (meta: Record<string, unknown>) => ApprovalFact[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
// A path segment from a stored id: an id that would change the path's shape
// (a slash, a query) is no id this table can link to.
const seg = (v: unknown): string | null => {
  const s = str(v);
  return s && /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
};
const none: Pages = { team: [], admin: [] };

const PRESENTATION: Record<ApprovalSubject, Presentation> = {
  // Leave is decided in the inbox row itself by the manager it names; the admin
  // board is where anyone else decides it.
  time_off: {
    tier: 0,
    reach: () => "",
    cta: "Open the leave requests",
    asker: null,
    pages: () => ({ team: [], admin: ["/admin/operations/time-off/requests"] }),
  },
  contractor_estimate: {
    tier: 2,
    reach: () => "commitment",
    cta: "Review the estimate",
    asker: "A contractor",
    pages: () => ({ team: [], admin: ["/admin/operations/contractor-requests"] }),
    facts: (m) => (num(m.hours) !== null ? [{ label: "Hours", value: String(m.hours) }] : []),
  },
  contractor_work: {
    tier: 2,
    reach: () => "commitment",
    cta: "Review the work",
    asker: "A contractor",
    pages: () => ({ team: [], admin: ["/admin/operations/contractor-requests"] }),
    facts: (m) => (num(m.hours) !== null ? [{ label: "Hours", value: String(m.hours) }] : []),
  },
  // Decided inside the chat turn that asked; never pending, so never linked.
  assistant_action: {
    tier: 0,
    reach: () => "",
    cta: "",
    asker: null,
    pages: () => none,
  },
  // Read and signed for Edge8 on its deal, which the Team view serves too.
  agreement_edge8_signature: {
    tier: 2,
    reach: () => "commitment",
    cta: "Open the agreement",
    asker: null,
    pages: (a) => {
      const deal = seg(a.metadata.dealId);
      return deal ? { team: [`/team/revenue/deals/${deal}`], admin: [`/admin/revenue/deals/${deal}`] } : none;
    },
    facts: (m) => {
      const out: ApprovalFact[] = [{ label: "Signs for", value: "Edge8" }];
      if (str(m.companyName)) out.push({ label: "Client", value: String(m.companyName) });
      const fee = (m.fee ?? null) as { cents?: unknown; currency?: unknown } | null;
      if (fee && num(fee.cents) !== null) out.push({ label: "Value", value: formatCents(fee.cents as number, str(fee.currency) ?? "usd") });
      return out;
    },
  },
  // The client's signer signs in the portal.
  agreement_client_signature: {
    tier: 2,
    reach: () => "commitment",
    cta: "Open the agreement",
    asker: null,
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [], admin: [`/portal/agreements/${id}`] } : none;
    },
  },
  // A claim is checked on the checker's page (Team) or Admin's page for it, and
  // approved on Admin's page or its To approve list (RB.4).
  reimbursement_check: {
    tier: 0,
    reach: () => "",
    cta: "Check the claim",
    asker: null,
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [`/team/finance/claims/${id}`], admin: [`/admin/finance/reimbursements/${id}`] } : none;
    },
    facts: () => [
      { label: "Next", value: "Approval by whoever approves checked claims" },
      { label: "Never decided by", value: "The person who claimed it" },
    ],
  },
  reimbursement_approval: {
    tier: 0,
    reach: () => "",
    cta: "Open the claim",
    asker: null,
    pages: (a) => {
      const id = seg(a.subjectId);
      return { team: [], admin: [...(id ? [`/admin/finance/reimbursements/${id}`] : []), "/admin/finance/reimbursements/to-approve"] };
    },
    facts: () => [{ label: "Never decided by", value: "The person who claimed it" }],
  },
  campaign_publish: {
    tier: 2,
    reach: () => "public",
    cta: "Review the draft",
    asker: "The writer agent",
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [`/team/revenue/marketing/campaigns/${id}`], admin: [`/admin/revenue/marketing/campaigns/${id}`] } : none;
    },
  },
  letter_send: {
    tier: 2,
    reach: (m) => {
      const n = num(m.recipients);
      return n === null ? "many people" : `${n} ${n === 1 ? "recipient" : "recipients"}`;
    },
    cta: "Read the letter",
    asker: "The letter agent",
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [`/team/revenue/marketing/broadcasts/${id}`], admin: [`/admin/revenue/marketing/broadcasts/${id}`] } : none;
    },
  },
  // The hiring chain (Z.9). A requisition commits headcount and a band, and
  // reaches the public when it is posted; a shortlist moves nobody outside;
  // each message, and a rejection, reaches one candidate; a hire commits.
  hiring_requisition: {
    tier: 2,
    reach: (m) => (str(m.reach) === "public" ? "public" : "commitment"),
    cta: "Review the requisition",
    asker: "The hiring chain",
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [], admin: [`/admin/talent/jobs/${id}`] } : none;
    },
  },
  hiring_shortlist: {
    tier: 0,
    reach: () => "",
    cta: "Review the shortlist",
    asker: "The hiring chain",
    pages: (a) => {
      const req = seg(a.metadata.requisitionId);
      return req ? { team: [], admin: [`/admin/talent/jobs/${req}#shortlist`] } : none;
    },
    facts: (m) => {
      const out: ApprovalFact[] = [];
      if (num(m.round) !== null) out.push({ label: "Round", value: String(m.round) });
      if (num(m.advance) !== null && num(m.decline) !== null && num(m.hold) !== null) {
        out.push({ label: "Lanes", value: `${m.advance} to advance, ${m.decline} to decline, ${m.hold} held` });
      }
      out.push({ label: "Nothing leaves", value: "Each invitation and decline it leads to is its own approval" });
      return out;
    },
  },
  hiring_message: {
    tier: 1,
    reach: () => "one candidate",
    cta: "Read the message",
    asker: "The hiring chain",
    pages: (a) => {
      const app = seg(a.metadata.applicationId);
      return app ? { team: [], admin: [`/admin/talent/applications/${app}`] } : none;
    },
  },
  hiring_reject: {
    tier: 1,
    reach: () => "one candidate",
    cta: "Review the decision",
    asker: null,
    pages: (a) => {
      const app = seg(a.subjectId);
      return app ? { team: [], admin: [`/admin/talent/applications/${app}`] } : none;
    },
    facts: () => [{ label: "With it", value: "The rejection message, sent once when this is approved" }],
  },
  hiring_hire: {
    tier: 2,
    reach: () => "commitment",
    cta: "Review the decision",
    asker: null,
    pages: (a) => {
      const app = seg(a.subjectId);
      return app ? { team: [], admin: [`/admin/talent/applications/${app}`] } : none;
    },
    facts: () => [
      { label: "With it", value: "The hire message, sent once when this is approved" },
      { label: "Never decided by", value: "The person who proposed it" },
    ],
  },
  // A priced proposal is a commitment (plan B6): Tier 2, never escalated and
  // never approved on a timeout. The facts name the client, the value and the
  // call it came from; the Lark DM that points here names no amount.
  proposal_publish: {
    tier: 2,
    reach: () => "commitment",
    cta: "Review the proposal",
    asker: "The proposal chain",
    pages: (a) => {
      const id = seg(a.subjectId);
      return id ? { team: [`/team/revenue/proposals/${id}`], admin: [`/admin/revenue/proposals/${id}`] } : none;
    },
    facts: (m) => {
      const out: ApprovalFact[] = [];
      const client = str(m.companyName);
      if (client) out.push({ label: "Client", value: client });
      const cents = num(m.amountCents);
      if (cents !== null) out.push({ label: "Value", value: formatCents(cents, str(m.currency) ?? "usd") });
      const call = str(m.meetingTitle);
      if (call) out.push({ label: "Call", value: call });
      return out;
    },
  },
  // A follow-up email to the people at one client who were in a meeting
  // (Z.13): one outside party, so Tier 1 however many of its people it names.
  // It is decided on the meeting's page, which the subject id (the run's row)
  // does not name, so the page comes from the meeting id the run stored.
  meeting_followup: {
    tier: 1,
    reach: (m) => {
      const n = num(m.recipients);
      if (n === null) return "one client";
      return n === 1 ? "one person at one client" : `${n} people at one client`;
    },
    cta: "Read the follow-up",
    asker: "The meeting follow-up chain",
    pages: (a) => {
      const meeting = seg(a.metadata.meetingId);
      return meeting ? { team: [`/team/revenue/meetings/${meeting}`], admin: [`/admin/revenue/meetings/${meeting}`] } : none;
    },
    facts: (m) => {
      const out: ApprovalFact[] = [];
      if (str(m.companyName)) out.push({ label: "Client", value: String(m.companyName) });
      if (str(m.meetingDate)) out.push({ label: "Meeting date", value: String(m.meetingDate) });
      const cards = num(m.cardsFiled);
      if (cards !== null) out.push({ label: "Cards filed", value: String(cards) });
      return out;
    },
  },
};

export function tierOf(subject: ApprovalSubject): ApprovalTier {
  return PRESENTATION[subject].tier;
}

/** The tier chip's words: "Tier 2 · public", "Tier 1 · one client", "Internal". */
export function tierChip(a: Pick<PresentedApproval, "subjectType" | "metadata">): string {
  const p = PRESENTATION[a.subjectType];
  if (p.tier === 0) return "Internal";
  const reach = p.reach(a.metadata);
  return reach ? `Tier ${p.tier} · ${reach}` : `Tier ${p.tier}`;
}

/**
 * The pages a pending approval is decided on, best first: the list's own
 * surface, then the other one. Empty when the subject is decided nowhere a list
 * can link to, or its metadata lacks the id its page needs.
 */
export function decideHrefs(a: PresentedApproval, surface: ApprovalSurface): string[] {
  const pages = PRESENTATION[a.subjectType].pages(a);
  return surface === "team" ? [...pages.team, ...pages.admin] : [...pages.admin, ...pages.team];
}

export function ctaFor(subject: ApprovalSubject): string {
  return PRESENTATION[subject].cta || "Open";
}

/** Who asked, for a row that names no person: the agent or routine behind it, or null. */
export function askerFor(subject: ApprovalSubject): string | null {
  return PRESENTATION[subject].asker;
}

/**
 * What the Details toggle shows: the facts every agent draft may carry (the
 * version the approver would approve, where it goes, the run behind it), the
 * ones only this subject reads, and what happens if nobody decides. A fact the
 * metadata does not carry is left out, never filled with a guess.
 */
export function approvalFacts(a: Pick<PresentedApproval, "subjectType" | "metadata">): ApprovalFact[] {
  const m = a.metadata;
  const p = PRESENTATION[a.subjectType];
  const out: ApprovalFact[] = [];
  const version = str(m.version);
  if (version) out.push({ label: "Version you would approve", value: `${version} (an edit needs a new approval)` });
  const reach = str(m.reach);
  if (reach) out.push({ label: "Where it goes", value: reach });
  const recipients = num(m.recipients);
  if (recipients !== null) out.push({ label: "Recipients", value: String(recipients) });
  const window = str(m.sendWindow);
  if (window) out.push({ label: "Send window", value: window });
  const run = str(m.run);
  if (run) out.push({ label: "Run", value: run });
  out.push(...(p.facts?.(m) ?? []));
  // Nothing on any list is approved on a timeout today; a flow that escalates
  // (a backup asked at the morning brief) says so in its own metadata.
  out.push({ label: "If nobody decides", value: str(m.ifNobodyDecides) ?? "It waits. Nothing here is approved on a timeout." });
  return out;
}
