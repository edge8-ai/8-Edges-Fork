import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import type { SubjectApproval } from "@/kernel/approvals/waiting";
import type { Result } from "@/kernel/data/result";
import type { RunMode } from "@/kernel/audit/run-context";
import type { ScreenFlag, ShortlistItem } from "./proposal";
import type { ApplicationStep, DecisionOutcome, MessageKind, RequisitionStep } from "./steps";
import type { MessageFacts } from "./templates";

// The hiring chain's shapes and the ports its two machines act through (Z.9).
// The machines (./application, ./requisition) and the approver's actions
// (./approvals) take a ChainDeps, so the tests drive them on an in-memory
// store with a fake sender, a fake screen and a fake approvals table, and
// production wires the real ones in ./deps. Every write the machines make is
// fenced on the state they read, so two runs of one step (a button and the
// driver, or a retry after a lost reply) cannot both act.

/** A recruiter's proposed decision, held on applications.chain_proposal until the approver decides. */
export type Proposal = {
  outcome: DecisionOutcome;
  reason: string;
  proposedBy: string | null;
  proposedAt: string;
  /** The wait the application goes back to if the proposal is rejected or withdrawn. */
  from: ApplicationStep;
};

export type ChainApplication = {
  id: string;
  jobRequisitionId: string;
  personId: string | null;
  candidateName: string;
  step: ApplicationStep | null;
  epoch: string | null;
  error: string | null;
  proposal: Proposal | null;
  status: string;
  archived: boolean;
  currentStageId: string | null;
  aiScreenStatus: string | null;
  aiRating: number | null;
  flags: ScreenFlag[];
};

export type ApplicationPatch = {
  step?: ApplicationStep | null;
  epoch?: string | null;
  error?: string | null;
  proposal?: Proposal | null;
  flags?: ScreenFlag[];
};

export type ChainRequisition = {
  id: string;
  title: string;
  status: string;
  step: RequisitionStep | null;
  epoch: string | null;
  error: string | null;
  isPublic: boolean;
  /** Everything opening the requisition commits to, for its approval's version (spec section 6). */
  content: Record<string, unknown>;
};

export type RequisitionPatch = { step?: RequisitionStep | null; epoch?: string | null; error?: string | null };

export type MessageStatus = "pending" | "approved" | "sending" | "sent" | "withdrawn" | "failed";

export type CandidateMessage = {
  id: string;
  applicationId: string;
  personId: string | null;
  kind: MessageKind;
  stageId: string | null;
  mode: RunMode;
  status: MessageStatus;
  toEmail: string;
  subject: string;
  body: string;
  draftedBody: string;
  version: string;
  sendKey: string;
  runTick: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

export type NewMessage = Omit<CandidateMessage, "id" | "approvedBy" | "approvedAt" | "claimedAt" | "sentAt" | "error" | "createdAt" | "status"> & {
  status: "pending";
};

export type MessagePatch = Partial<Pick<CandidateMessage, "status" | "subject" | "body" | "version" | "approvedBy" | "approvedAt" | "claimedAt" | "sentAt" | "error">> & {
  providerRef?: string | null;
};

export type ShortlistStatus = "proposed" | "approved" | "rejected" | "withdrawn" | "applied";

export type Shortlist = {
  id: string;
  requisitionId: string;
  round: number;
  mode: RunMode;
  status: ShortlistStatus;
  items: ShortlistItem[];
  version: string;
  createdAt: string;
  decidedAt: string | null;
};

/** What a message to one candidate may say, and where replies go. */
export type MessageContext = {
  toEmail: string | null;
  replyTo: string | null;
  facts: MessageFacts;
};

/** The chain's data, behind the fences its steps rely on. */
export type ChainStore = {
  application(id: string): Promise<ChainApplication | null>;
  /** Writes the patch only while the application is at `fence` (when given); answers whether it did. */
  setApplication(id: string, patch: ApplicationPatch, fence?: { step: ApplicationStep | null }): Promise<boolean>;
  requisition(id: string): Promise<ChainRequisition | null>;
  setRequisition(id: string, patch: RequisitionPatch, fence?: { step: RequisitionStep | null }): Promise<boolean>;
  /** status = open and opened_at, only while the requisition is a draft. Answers whether it did. */
  openRequisition(id: string): Promise<boolean>;
  /** The requisition's applications at triage whose screen has finished, not archived. */
  triageApplications(requisitionId: string): Promise<ChainApplication[]>;
  /** The requisition's applications in a chain run (any step but closed), not archived. */
  chainApplications(requisitionId: string): Promise<ChainApplication[]>;
  shortlists(requisitionId: string): Promise<Shortlist[]>;
  shortlist(id: string): Promise<Shortlist | null>;
  /** Inserts the round; a round already there (a retried step) is returned instead. */
  insertShortlist(row: Omit<Shortlist, "id" | "createdAt" | "decidedAt">): Promise<Shortlist>;
  updateShortlist(id: string, patch: Partial<Pick<Shortlist, "status" | "items" | "version" | "decidedAt">>, fence?: { status: ShortlistStatus[] }): Promise<boolean>;
  /** The requisition's first interview stage, where an advanced application goes. */
  firstInterviewStage(requisitionId: string): Promise<{ id: string; name: string } | null>;
  /** Moves the application to a stage and logs the move. */
  moveToStage(applicationId: string, fromStageId: string | null, toStageId: string): Promise<void>;
  messageContext(applicationId: string, stageId: string | null): Promise<MessageContext>;
  message(id: string): Promise<CandidateMessage | null>;
  messages(applicationId: string): Promise<CandidateMessage[]>;
  /** The live message on this key that is pending, approved, sending or sent; at most one exists. */
  activeMessage(sendKey: string): Promise<CandidateMessage | null>;
  /** Inserts a draft; a live draft already on the key (a retried step) is returned instead. */
  insertMessage(row: NewMessage): Promise<CandidateMessage>;
  /** Fenced on the status, and on the version when given (an edit in between makes it miss). */
  updateMessage(id: string, patch: MessagePatch, fence?: { status: MessageStatus[]; version?: string }): Promise<boolean>;
  /**
   * approved -> sending, or a sending claim older than `staleBefore` but newer
   * than `expiredBefore`: past Resend's 24-hour key window a resend could
   * deliver twice, so such a claim is a person's to settle. Answers whether
   * this call holds the claim.
   */
  claimMessage(id: string, staleBefore: string, expiredBefore: string): Promise<boolean>;
  /** Applications in a run (any step but send, decide, closed) whose status a person already made final. */
  decidedByHand(): Promise<ChainApplication[]>;
};

/** Statuses after which the chain has nothing left to say to a candidate. */
export const FINAL_STATUSES = ["hired", "rejected", "withdrawn"] as const;
export function isFinalStatus(status: string): boolean {
  return (FINAL_STATUSES as readonly string[]).includes(status);
}

export type ApprovalOpen = {
  subjectType: ApprovalSubject;
  subjectId: string;
  requestedBy: string | null;
  label: string;
  metadata: Record<string, unknown>;
};

export type ApprovalsPort = {
  open(ref: ApprovalOpen): Promise<Result>;
  decide(ref: {
    subjectType: ApprovalSubject;
    subjectId: string;
    state: "approved" | "rejected";
    decidedBy: string | null;
    reason?: string | null;
    expect?: { id: string; version: string };
  }): Promise<{ ok: true; decided: boolean } | { ok: false; error: string }>;
  withdraw(ref: { subjectType: ApprovalSubject; subjectId: string; cancelledBy: string | null; reason?: string | null }): Promise<Result>;
  /** The subject's latest row; raises on a failed read (a guess would act or ask again). */
  latest(subjectType: ApprovalSubject, subjectId: string): Promise<(SubjectApproval & { requestedBy: string | null }) | null>;
};

export type ScreenOutcome =
  | { ok: true; report: { instructionsFound: boolean; instructionsQuote: string } | null }
  | { ok: false; error: string };

export type SendEmail = (opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  idempotencyKey: string;
  logMeta: Record<string, unknown>;
}) => Promise<boolean>;

export type ChainDeps = {
  store: ChainStore;
  approvals: ApprovalsPort;
  runs: {
    park(tick: string, summary: string): Promise<Result>;
    close(tick: string, outcome: { status: "ok" | "skipped"; summary: string }): Promise<Result>;
  };
  /** The pre-check's flags for the candidate's own text; a failed read raises. */
  precheck(applicationId: string): Promise<ScreenFlag[]>;
  screen(applicationId: string): Promise<ScreenOutcome>;
  send: SendEmail;
  /** company_os.record_application_decision: true when this call recorded the decision. */
  recordDecision(applicationId: string, outcome: DecisionOutcome, reason: string, by: string | null): Promise<boolean>;
  /** Publishes the hire the decision wrote to the outbox. Never raises: the driver's sweep delivers what this misses. */
  deliverHire(applicationId: string): Promise<void>;
  cancelInterviews(applicationId: string): Promise<void>;
  /** The mode of the run on this async chain (Z.17); live outside a run. */
  mode(): RunMode;
  now(): Date;
  orgName(): string | null;
  /** Why candidate email cannot go out at all (no Resend key, no sender), or null. */
  emailProblem(): string | null;
};

/** What one step reports, as the run loop records it. */
export type StepOutcome =
  | { ok: true; id: string; step: string; next: string | null; summary: string }
  | { ok: false; id: string; step: string; error: string }
  | { skipped: string; id: string };
