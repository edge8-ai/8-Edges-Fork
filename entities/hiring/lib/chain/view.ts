import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { decisionSubject } from "./ask";
import { chainDeps } from "./deps";
import { chainMode } from "./run";
import { PROPOSABLE_FROM, describeApplicationStep, sendKey, type DecisionOutcome, type Lane, type MessageKind } from "./steps";
import { compareShadow, type HumanOutcome, type ShadowRow } from "./shadow";
import type { ScreenFlag } from "./proposal";
import { decisionVersion, requisitionVersion } from "./versions";

// What the requisition and application pages show of the hiring chain (Z.9,
// spec section 11), read once on the server and handed to the client panels.
// Reads raise on failure (rule 2): a panel that showed "nothing waits" because
// a read failed would tell the approver there is nothing to decide.

export type ChainSwitch = "live" | "shadow" | "paused";

export type ApprovalView = { state: string; version: string | null; reason: string | null; decidedAt: string | null };

export type ShortlistCandidate = {
  applicationId: string;
  name: string;
  rating: number | null;
  overview: string | null;
  lane: Lane;
  reason: string;
  flags: ScreenFlag[];
};

export type RequisitionChainView = {
  mode: ChainSwitch;
  requisitionId: string;
  status: string;
  step: string | null;
  error: string | null;
  currentVersion: string;
  opening: ApprovalView | null;
  /** Screened applications waiting at triage that no live round has covered. */
  waiting: number;
  counts: { applied: number; interviewing: number; decided: number };
  shortlist: {
    id: string;
    round: number;
    status: string;
    version: string;
    asked: string | null;
    candidates: ShortlistCandidate[];
    drafted: { applicationId: string; name: string; kind: MessageKind; status: string }[];
    decision: ApprovalView | null;
  } | null;
  shadow: { rows: ShadowRow[]; agreed: number; decided: number; rounds: number } | null;
};

function approvalView(a: { state: string; metadata: Record<string, unknown>; decidedAt: string | null } | null, reason: string | null = null): ApprovalView | null {
  if (!a) return null;
  return { state: a.state, version: typeof a.metadata.version === "string" ? a.metadata.version : null, reason, decidedAt: a.decidedAt };
}

async function reasonOf(subjectType: string, subjectId: string): Promise<string | null> {
  const rows = mustRows(
    await companyOs.from("approvals").select("reason").eq("subject_type", subjectType).eq("subject_id", subjectId).order("created_at", { ascending: false }).limit(1),
    "[hiring/chain] approval reason",
  );
  return rows[0]?.reason ?? null;
}

type AppSummary = { id: string; name: string; overview: string | null; status: string; stageKind: string | null; step: string | null };

async function applicationSummaries(requisitionId: string): Promise<Map<string, AppSummary>> {
  const rows = mustRows(
    await companyOs
      .from("applications")
      .select(`id, status, chain_step, ai_summary, people!person_id(${NAME_COLUMNS}), application_stages!current_stage_id(stage_kind)`)
      .eq("job_requisition_id", requisitionId),
    "[hiring/chain] requisition applications",
  ) as unknown as {
    id: string;
    status: string;
    chain_step: string | null;
    ai_summary: { overview?: unknown } | null;
    people: NamedPerson | NamedPerson[] | null;
    application_stages: { stage_kind: string } | { stage_kind: string }[] | null;
  }[];
  return new Map(
    rows.map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      const st = Array.isArray(r.application_stages) ? r.application_stages[0] : r.application_stages;
      return [
        r.id,
        {
          id: r.id,
          name: personName(p, "Unnamed candidate"),
          overview: typeof r.ai_summary?.overview === "string" ? r.ai_summary.overview : null,
          status: r.status,
          stageKind: st?.stage_kind ?? null,
          step: r.chain_step,
        },
      ];
    }),
  );
}

/** What a person did with an application, for the shadow comparison: advanced to an interview, rejected, or still open. */
function humanOutcome(a: AppSummary | undefined): HumanOutcome {
  if (!a) return "open";
  if (a.status === "rejected" || a.stageKind === "rejected") return "rejected";
  if (a.status === "hired" || ["interview", "assessment", "reference", "offer", "hired"].includes(a.stageKind ?? "")) return "advanced";
  return "open";
}

export async function requisitionChainView(requisitionId: string): Promise<RequisitionChainView | null> {
  const [mode, req] = await Promise.all([chainMode(), chainDeps.store.requisition(requisitionId)]);
  if (!req) return null;
  const [rounds, triage, apps, opening] = await Promise.all([
    chainDeps.store.shortlists(requisitionId),
    chainDeps.store.triageApplications(requisitionId),
    applicationSummaries(requisitionId),
    chainDeps.approvals.latest("hiring_requisition", requisitionId),
  ]);
  const live = rounds.filter((s) => s.mode === "live");
  const covered = new Set(live.flatMap((s) => s.items.map((i) => i.application_id)));
  const latest = live[live.length - 1] ?? null;

  let shortlist: RequisitionChainView["shortlist"] = null;
  if (latest) {
    const approval = await chainDeps.approvals.latest("hiring_shortlist", latest.id);
    const drafted: NonNullable<RequisitionChainView["shortlist"]>["drafted"] = [];
    if (latest.status === "applied") {
      for (const item of latest.items.filter((i) => i.lane !== "hold")) {
        const kind: MessageKind = item.lane === "advance" ? "invite" : "decline";
        const msg = (await chainDeps.store.messages(item.application_id)).find((m) => m.mode === "live" && m.kind === kind);
        drafted.push({ applicationId: item.application_id, name: apps.get(item.application_id)?.name ?? "Candidate", kind, status: msg?.status ?? "drafting" });
      }
    }
    shortlist = {
      id: latest.id,
      round: latest.round,
      status: latest.status,
      version: latest.version,
      asked: approval?.state === "pending" && typeof approval.metadata.version === "string" ? approval.metadata.version : null,
      candidates: latest.items.map((i) => ({
        applicationId: i.application_id,
        name: apps.get(i.application_id)?.name ?? "Candidate",
        rating: i.rating,
        overview: apps.get(i.application_id)?.overview ?? null,
        lane: i.lane,
        reason: i.reason,
        flags: i.flags,
      })),
      drafted,
      decision: approvalView(approval, approval?.state === "rejected" ? await reasonOf("hiring_shortlist", latest.id) : null),
    };
  }

  const shadowRounds = rounds.filter((s) => s.mode === "shadow");
  let shadow: RequisitionChainView["shadow"] = null;
  if (shadowRounds.length > 0) {
    const proposed = new Map<string, Lane>();
    for (const s of shadowRounds) for (const i of s.items) proposed.set(i.application_id, i.lane);
    const drafts = new Map<string, string>();
    for (const id of proposed.keys()) {
      const msg = (await chainDeps.store.messages(id)).find((m) => m.mode === "shadow");
      if (msg) drafts.set(id, msg.subject);
    }
    shadow = {
      rounds: shadowRounds.length,
      ...compareShadow(
        [...proposed.entries()].map(([id, lane]) => ({ applicationId: id, name: apps.get(id)?.name ?? "Candidate", lane, human: humanOutcome(apps.get(id)), message: drafts.get(id) ?? null })),
      ),
    };
  }

  return {
    mode,
    requisitionId,
    status: req.status,
    step: req.step,
    error: req.error,
    currentVersion: requisitionVersion(req.content),
    opening: approvalView(opening, opening?.state === "rejected" ? await reasonOf("hiring_requisition", requisitionId) : null),
    waiting: triage.filter((a) => !covered.has(a.id)).length,
    counts: {
      applied: apps.size,
      interviewing: [...apps.values()].filter((a) => a.step === "interviewing").length,
      decided: [...apps.values()].filter((a) => a.status === "hired" || a.status === "rejected").length,
    },
    shortlist,
    shadow,
  };
}

// ── the application page ───────────────────────────────────────────────────

export type MessageView = {
  id: string;
  kind: MessageKind;
  status: string;
  toEmail: string;
  subject: string;
  body: string;
  edited: boolean;
  version: string;
  asked: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type ApplicationChainView = {
  mode: ChainSwitch;
  applicationId: string;
  step: string | null;
  stepLine: string;
  error: string | null;
  replyTo: string | null;
  flags: ScreenFlag[];
  canPropose: boolean;
  messages: MessageView[];
  decision: {
    outcome: DecisionOutcome;
    reason: string;
    proposedByMe: boolean;
    state: string;
    version: string | null;
    current: string | null;
    messageId: string | null;
    message: { subject: string; body: string; toEmail: string; version: string } | null;
  } | null;
};

export async function applicationChainView(applicationId: string, viewerPersonId: string | null): Promise<ApplicationChainView | null> {
  const [mode, app] = await Promise.all([chainMode(), chainDeps.store.application(applicationId)]);
  if (!app || app.step === null) return null;
  const all = (await chainDeps.store.messages(app.id)).filter((m) => m.mode === "live" && m.status !== "withdrawn");
  const messages: MessageView[] = [];
  for (const m of all) {
    const approval = m.kind === "invite" || m.kind === "decline" ? await chainDeps.approvals.latest("hiring_message", m.id) : null;
    messages.push({
      id: m.id,
      kind: m.kind,
      status: m.status,
      toEmail: m.toEmail,
      subject: m.subject,
      body: m.body,
      edited: m.body !== m.draftedBody,
      version: m.version,
      asked: approval?.state === "pending" && typeof approval.metadata.version === "string" ? approval.metadata.version : null,
      sentAt: m.sentAt,
      createdAt: m.createdAt,
    });
  }
  let decision: ApplicationChainView["decision"] = null;
  if (app.proposal) {
    const p = app.proposal;
    const approval = await chainDeps.approvals.latest(decisionSubject(p.outcome), app.id);
    const msg = await chainDeps.store.activeMessage(sendKey(app.id, p.outcome === "hired" ? "decision_hire" : "decision_reject", null));
    decision = {
      outcome: p.outcome,
      reason: p.reason,
      proposedByMe: viewerPersonId !== null && p.proposedBy === viewerPersonId,
      state: approval?.state ?? "asking",
      version: approval?.state === "pending" && typeof approval.metadata.version === "string" ? approval.metadata.version : null,
      current: msg ? decisionVersion({ outcome: p.outcome, reason: p.reason, messageVersion: msg.version }) : null,
      messageId: msg?.id ?? null,
      message: msg ? { subject: msg.subject, body: msg.body, toEmail: msg.toEmail, version: msg.version } : null,
    };
  }
  const ctx = await chainDeps.store.messageContext(app.id, null);
  return {
    mode,
    applicationId: app.id,
    step: app.step,
    stepLine: describeApplicationStep(app.step),
    error: app.error,
    replyTo: ctx.replyTo,
    flags: app.flags,
    canPropose: mode !== "shadow" && !app.archived && !app.error && PROPOSABLE_FROM.includes(app.step),
    messages,
    decision,
  };
}

/** For the surfaces that show the status select: where a live chain application's decision is proposed, or null to decide directly. */
export async function proposeHrefs(applications: { id: string; chainStep: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const inChain = applications.filter((a) => a.chainStep !== null && a.chainStep !== "closed");
  if (inChain.length === 0) return out;
  let mode: ChainSwitch;
  try {
    mode = await chainMode();
  } catch {
    // Unread switch: offer the proposal, which the server would insist on anyway.
    mode = "live";
  }
  if (mode === "shadow") return out;
  for (const a of inChain) out.set(a.id, `/admin/talent/applications/${a.id}#decision`);
  return out;
}

/** proposeHrefs for a few applications by id, for a surface whose rows do not carry chain_step (the contact page). */
export async function proposeHrefsForIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = mustRows(await companyOs.from("applications").select("id, chain_step").in("id", ids.slice(0, 50)), "[hiring/chain] chain steps");
  return proposeHrefs(rows.map((r) => ({ id: r.id, chainStep: r.chain_step })));
}

