import { contentVersion } from "@/kernel/approvals/version";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { readFlags, readItems } from "./proposal";
import { isApplicationStep, isRequisitionStep, type MessageKind } from "./steps";
import type { CandidateMessage, ChainApplication, ChainRequisition, MessageStatus, Proposal, Shortlist, ShortlistStatus } from "./types";

// The rows the chain's store reads, and how each becomes the chain's shape
// (Z.9). Split from ./store so the store is its queries and fences alone.

export const APP_COLUMNS = `id, job_requisition_id, person_id, chain_step, chain_started_at, chain_error, chain_proposal, status, archived_at, current_stage_id, ai_screen_status, ai_rating, ai_screen_flags, people!person_id(${NAME_COLUMNS})`;

export type AppRow = {
  id: string;
  job_requisition_id: string;
  person_id: string | null;
  chain_step: string | null;
  chain_started_at: string | null;
  chain_error: string | null;
  chain_proposal: unknown;
  status: string;
  archived_at: string | null;
  current_stage_id: string | null;
  ai_screen_status: string | null;
  ai_rating: number | null;
  ai_screen_flags: unknown;
  people: NamedPerson | NamedPerson[] | null;
};

function readProposal(v: unknown): Proposal | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.outcome !== "hired" && o.outcome !== "rejected") return null;
  return {
    outcome: o.outcome,
    reason: typeof o.reason === "string" ? o.reason : "",
    proposedBy: typeof o.proposedBy === "string" ? o.proposedBy : null,
    proposedAt: typeof o.proposedAt === "string" ? o.proposedAt : "",
    from: isApplicationStep(o.from) ? o.from : "interviewing",
  };
}

export function toApp(r: AppRow): ChainApplication {
  const person = Array.isArray(r.people) ? r.people[0] : r.people;
  return {
    id: r.id,
    jobRequisitionId: r.job_requisition_id,
    personId: r.person_id,
    candidateName: personName(person, "the candidate"),
    step: isApplicationStep(r.chain_step) ? r.chain_step : null,
    epoch: r.chain_started_at,
    error: r.chain_error,
    proposal: readProposal(r.chain_proposal),
    status: r.status,
    archived: r.archived_at !== null,
    currentStageId: r.current_stage_id,
    aiScreenStatus: r.ai_screen_status,
    aiRating: r.ai_rating === null ? null : Number(r.ai_rating),
    flags: readFlags(r.ai_screen_flags),
  };
}

export const REQ_COLUMNS =
  "id, title, status, chain_step, chain_started_at, chain_error, is_public, headcount, employment_type, location, remote_policy, salary_min_cents, salary_max_cents, currency, description, requirements, responsibilities, full_jd, application_questions";

export type ReqRow = {
  id: string;
  title: string;
  status: string;
  chain_step: string | null;
  chain_started_at: string | null;
  chain_error: string | null;
  is_public: boolean;
  headcount: number;
  employment_type: string;
  location: string | null;
  remote_policy: string | null;
  salary_min_cents: number | null;
  salary_max_cents: number | null;
  currency: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  full_jd: string | null;
  application_questions: unknown;
};

/** What opening the requisition commits to (spec section 6): the hash of the long texts stands in for them. */
function requisitionContent(r: Omit<ReqRow, "id" | "status" | "chain_step" | "chain_started_at" | "chain_error">): Record<string, unknown> {
  return {
    title: r.title,
    headcount: r.headcount,
    employmentType: r.employment_type,
    location: r.location,
    remotePolicy: r.remote_policy,
    salaryMinCents: r.salary_min_cents,
    salaryMaxCents: r.salary_max_cents,
    currency: r.currency,
    isPublic: r.is_public,
    text: contentVersion({ description: r.description, requirements: r.requirements, responsibilities: r.responsibilities, fullJd: r.full_jd }),
    questions: Array.isArray(r.application_questions) ? r.application_questions : [],
  };
}

export function toReq(r: ReqRow): ChainRequisition {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    step: isRequisitionStep(r.chain_step) ? r.chain_step : null,
    epoch: r.chain_started_at,
    error: r.chain_error,
    isPublic: r.is_public,
    content: requisitionContent(r),
  };
}

export type MsgRow = {
  id: string;
  application_id: string;
  person_id: string | null;
  kind: string;
  stage_id: string | null;
  mode: string;
  status: string;
  to_email: string;
  subject: string;
  body_md: string;
  drafted_body_md: string;
  version: string;
  send_key: string;
  run_tick: string | null;
  approved_by: string | null;
  approved_at: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

export const MSG_COLUMNS =
  "id, application_id, person_id, kind, stage_id, mode, status, to_email, subject, body_md, drafted_body_md, version, send_key, run_tick, approved_by, approved_at, claimed_at, sent_at, error, created_at";

export function toMsg(r: MsgRow): CandidateMessage {
  return {
    id: r.id,
    applicationId: r.application_id,
    personId: r.person_id,
    kind: r.kind as MessageKind,
    stageId: r.stage_id,
    mode: r.mode === "shadow" ? "shadow" : "live",
    status: r.status as MessageStatus,
    toEmail: r.to_email,
    subject: r.subject,
    body: r.body_md,
    draftedBody: r.drafted_body_md,
    version: r.version,
    sendKey: r.send_key,
    runTick: r.run_tick,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    claimedAt: r.claimed_at,
    sentAt: r.sent_at,
    error: r.error,
    createdAt: r.created_at,
  };
}

export type ShortRow = { id: string; job_requisition_id: string; round: number; mode: string; status: string; items: unknown; version: string; created_at: string; decided_at: string | null };
export const SHORT_COLUMNS = "id, job_requisition_id, round, mode, status, items, version, created_at, decided_at";

export function toShortlist(r: ShortRow): Shortlist {
  return {
    id: r.id,
    requisitionId: r.job_requisition_id,
    round: r.round,
    mode: r.mode === "shadow" ? "shadow" : "live",
    status: r.status as ShortlistStatus,
    items: readItems(r.items),
    version: r.version,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}
