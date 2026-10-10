import type { Tables } from "@/kernel/data/supabase/database.types";
import type { PromoteResult } from "./lifecycle";
import type { NotSalesKind, Verdict } from "./inquiry-qualify";

// The inquiry-to-lead chain's shared vocabulary (Z.11): its routine, its
// steps, where it files an inquiry, and the store it reads and writes through.
// The store is an interface so the chain's rules (inquiry-chain-steps.ts) are
// tested against an in-memory one; inquiry-chain-store.ts is the database's.

/**
 * The chain's routine: its cron path, so one switch on Settings -> Agents
 * (Live, Shadow, Off) governs the intake, the driver and every step's run.
 */
export const INQUIRY_CHAIN_ROUTINE_ID = "/api/cron/inquiry-to-lead/";

/** Seconds one step may take: the cron's maxDuration (entities/crm/mounts.ts). */
export const INQUIRY_STEP_SECONDS = 300;

/** At most this many runs are advanced per tick: a bot wave spends at most twenty model calls per five minutes. */
export const DUE_PER_TICK = 20;

export const DRIVEN_STEPS = ["qualify", "file", "notify"] as const;
export type DrivenStep = (typeof DRIVEN_STEPS)[number];
export type TriageStep = DrivenStep | "done" | "stopped";
export const isDrivenStep = (s: string): s is DrivenStep => (DRIVEN_STEPS as readonly string[]).includes(s);

export type TriageMode = "live" | "shadow";
export type Routed = "queued" | "held_spam" | "kept_on_board" | "customer_owner" | "fallback";
export type TriageRow = Tables<{ schema: "company_os" }, "inquiry_triage">;
export type TriagePatch = Partial<Omit<TriageRow, "inquiry_id" | "created_at">>;

/** The inquiry and its sender, as the chain reads them. Name and email never reach the model. */
export type InquiryFacts = {
  id: string;
  personId: string;
  type: string | null;
  status: string;
  message: string | null;
  company: string | null;
  teamSize: string | null;
  utm: unknown;
  source: string | null;
  createdAt: string;
  email: string | null;
  /** The name typed on the form, for the spam gate. */
  typedName: string | null;
  /** Every name the sender goes by (record and form), only to mask them in the message. */
  names: string[];
  /** The person record's full name, for the duplicate search. */
  fullName: string | null;
  persona: string | null;
};

/** The open or won deal that makes the sender a current client. */
export type CustomerDeal = { id: string; title: string | null; ownerName: string | null; companyId: string | null; companyName: string | null };

/** What the qualify step reads besides the inquiry. */
export type QualifyContext = {
  priorInquiries: number;
  customerDeal: CustomerDeal | null;
  /** A live company by the sender's company domain, or, for a sender at a free mailbox only, a unique exact name match. */
  companyMatch: { id: string; name: string } | null;
  /** Other people who may be the sender: same full name, at the same company or domain. */
  duplicates: string[];
};

export type OpenOutcome = "opened" | "exists";

export interface LeadChainStore {
  triage(id: string): Promise<TriageRow | null>;
  /** Insert a run at qualify; "exists" when the inquiry has one. Throws on a failed write. */
  open(id: string, mode: TriageMode): Promise<OpenOutcome>;
  /** Patch a run only while it is still at `at.step` of the epoch `at.startedAt`; false when it moved. */
  move(id: string, at: { step: TriageStep; startedAt: string }, patch: TriagePatch): Promise<boolean>;
  /**
   * Runs at a driven step, oldest first, at most `limit`. `mode` keeps only
   * runs opened in that mode; `skipLiveNotify` leaves out a live run at notify,
   * which waits while the tick is in shadow.
   */
  due(limit: number, only?: { mode?: TriageMode; skipLiveNotify?: boolean }): Promise<Pick<TriageRow, "inquiry_id" | "started_at" | "step">[]>;
  inquiry(id: string): Promise<InquiryFacts | null>;
  context(facts: InquiryFacts): Promise<QualifyContext>;
  deal(id: string): Promise<CustomerDeal | null>;
  companyName(id: string): Promise<string | null>;
  /** find_or_create_company_by_host. Never called with a free mailbox's domain (companyForSender). */
  companyForHost(host: string, name: string | null, create: boolean): Promise<{ companyId: string; created: boolean } | null>;
  linkPersonCompany(personId: string, companyId: string): Promise<void>;
  /** Set people.persona only where it is empty. */
  fillPersona(personId: string, persona: "prospect" | "job_seeker" | "vendor"): Promise<void>;
  promote(personId: string, slaFrom: string): Promise<PromoteResult>;
  /** Move inquiries.status from `from` to `to`; false when a person moved it first. */
  moveInquiryStatus(id: string, from: string, to: string): Promise<boolean>;
  /** One system note on the client's record that a current client wrote in; a second call adds nothing. */
  logCustomerInquiry(facts: InquiryFacts, deal: CustomerDeal): Promise<void>;
}

/** Where an inquiry goes for a verdict: the one table of the spec's file step. */
export function routeOf(verdict: Verdict | string | null, customerDealId: string | null): Routed {
  switch (verdict) {
    case "spam":
      return "held_spam";
    case "not_sales":
      return "kept_on_board";
    case "sales":
      return customerDealId ? "customer_owner" : "queued";
    default:
      return "fallback";
  }
}

/** The persona a not-sales kind fills, when the person has none. */
export function personaForKind(kind: NotSalesKind | string | null): "job_seeker" | "vendor" | null {
  return kind === "job_seeker" ? "job_seeker" : kind === "vendor" ? "vendor" : null;
}
