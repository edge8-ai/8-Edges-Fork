// The proposal chain's shapes (Z.10), browser-safe: no data access, so the
// review page's client components and the server modules read one definition.

/** The eleven sections every proposal has, in the order the client reads them. */
export const PROPOSAL_SECTIONS = [
  { id: "heard", title: "What we heard" },
  { id: "idea", title: "The idea" },
  { id: "opportunity", title: "The opportunity" },
  { id: "plan", title: "The plan" },
  { id: "box", title: "What's in the box" },
  { id: "investment", title: "The investment" },
  { id: "roles", title: "Roles and responsibilities" },
  { id: "risks", title: "Risks and assumptions" },
  { id: "retreat", title: "Build it with us" },
  { id: "next", title: "Next step" },
  { id: "footer", title: "Footer" },
] as const;

export type SectionId = (typeof PROPOSAL_SECTIONS)[number]["id"];
export const SECTION_IDS = PROPOSAL_SECTIONS.map((s) => s.id) as readonly SectionId[];

/**
 * One section as the client reads it. `body` is plain text: paragraphs
 * separated by a blank line, a line starting "- " is a bullet. `evidence`
 * names what each claim rests on: a transcript line ("L12"), an extracted
 * fact ("fact:budget") or a reference band ("band:foundation").
 */
export type ProposalSection = { id: SectionId; heading: string; body: string; evidence: string[] };

/** The proposal's words: what the model drafted, or what a person edited it to. */
export type ProposalDoc = { headline: string; sub: string; sections: ProposalSection[] };

/** One priced line of the investment, in minor units of the proposal's currency. */
export type LineItem = { label: string; note: string; band: string | null; amountCents: number };

/** Where a chain run is (proposal_drafts.step). */
export const PROPOSAL_STEPS = ["gather", "extract", "draft", "ask", "ready", "publish", "record", "done", "rejected", "stopped", "shadow-done"] as const;
export type ProposalStep = (typeof PROPOSAL_STEPS)[number];

/** The steps the tick driver advances; `ready` waits on a person. */
export const DRIVEN_STEPS = ["gather", "extract", "draft", "ask", "publish", "record"] as const satisfies readonly ProposalStep[];
export type DrivenStep = (typeof DRIVEN_STEPS)[number];
/** The driven steps that act outward (an approval, a page going live, a DM); never run in shadow. */
export const OUTWARD_STEPS: readonly DrivenStep[] = ["ask", "publish", "record"];

export function isDrivenStep(step: string): step is DrivenStep {
  return (DRIVEN_STEPS as readonly string[]).includes(step);
}

/** A finding shown to the approver: never corrected silently. */
export type LintFinding = { rule: "house-style" | "price-band" | "total" | "evidence" | "sections" | "prior-proposal"; tone: "warn" | "info"; text: string };

/** One proposed CRM change, ticked by a person before it is written. */
export type CrmPatchPart = {
  id: string;
  /** What the change touches, in words ("Deal \"Acme - proposal\""). */
  what: string;
  /** The change, in words. */
  change: string;
  /** Ticked when the review page opens. */
  defaultOn: boolean;
  /** False for a change the chain only reports (a contact not in the CRM): a person adds it by hand. */
  applicable: boolean;
};

/** What the review page needs to show a run's state. */
export const STEP_WORDS: Record<ProposalStep, string> = {
  gather: "Reading the call",
  extract: "Reading what the call said",
  draft: "Drafting the proposal",
  ask: "Asking for approval",
  ready: "Waiting on the Revenue approver",
  publish: "Publishing",
  record: "Recording the send",
  done: "Published",
  rejected: "Rejected",
  stopped: "Stopped",
  "shadow-done": "Shadow draft",
};

/** The steps a run passes through, for the panel's progress line. */
export const PROGRESS_STEPS: readonly { step: ProposalStep; label: string }[] = [
  { step: "gather", label: "Gather" },
  { step: "extract", label: "Extract" },
  { step: "draft", label: "Draft" },
  { step: "ready", label: "Approval" },
  { step: "done", label: "Published" },
];

/**
 * Where every step of the chain is recorded (Settings -> Agents): the driver
 * cron's own path, so its one switch (live, shadow, off) governs the steps too.
 */
export const PROPOSAL_ROUTINE_ID = "/api/cron/proposal-chain/";

/** Who may approve or reject publishing a drafted proposal (decision 7). */
export const PROPOSAL_APPROVER = "crm.proposal-approve";
