import type { RunMode } from "@/kernel/audit/run-context";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import type { ScreenFlag } from "../proposal";
import type { ApplicationStep, DecisionOutcome, RequisitionStep } from "../steps";
import { isFinalStatus } from "../types";
import type {
  CandidateMessage,
  ChainApplication,
  ChainDeps,
  ChainRequisition,
  ChainStore,
  MessageStatus,
  ScreenOutcome,
  Shortlist,
} from "../types";

// An in-memory hiring chain for the tests (Z.9): the chain's tables, the
// approvals table, the parked runs, the sender, the screen and the decision
// RPC, each keeping the fences and unique keys the real ones keep, so a test
// that runs a step twice sees what production would. Nothing here is shipped.

export type FakeApproval = {
  id: string;
  subjectType: ApprovalSubject;
  subjectId: string;
  state: "pending" | "approved" | "rejected" | "cancelled";
  metadata: Record<string, unknown>;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  label: string;
};

export type FakeChain = {
  deps: ChainDeps;
  apps: Map<string, ChainApplication>;
  reqs: Map<string, ChainRequisition>;
  messages: Map<string, CandidateMessage>;
  shortlists: Map<string, Shortlist>;
  approvals: FakeApproval[];
  parks: Map<string, "waiting" | "ok" | "skipped">;
  sends: { to: string; subject: string; html: string; idempotencyKey: string }[];
  decisions: { applicationId: string; outcome: DecisionOutcome; recorded: boolean }[];
  hiresDelivered: string[];
  stageMoves: { applicationId: string; to: string }[];
  screenResults: ScreenOutcome[];
  precheckFlags: Map<string, ScreenFlag[]>;
  people: Map<string, { email: string | null; firstName: string | null }>;
  setMode(mode: RunMode): void;
  setSendResult(ok: boolean): void;
  setOrgName(name: string | null): void;
  addApplication(over: Partial<ChainApplication> & { id: string; jobRequisitionId: string }): ChainApplication;
  addRequisition(over: Partial<ChainRequisition> & { id: string }): ChainRequisition;
  pending(subjectType: ApprovalSubject, subjectId: string): FakeApproval | undefined;
};

let seq = 0;
const nextId = (prefix: string) => {
  seq += 1;
  // A uuid-shaped id, so the actions' input checks accept it.
  return `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

export function fakeChain(): FakeChain {
  const apps = new Map<string, ChainApplication>();
  const reqs = new Map<string, ChainRequisition>();
  const messages = new Map<string, CandidateMessage>();
  const shortlists = new Map<string, Shortlist>();
  const approvals: FakeApproval[] = [];
  const parks = new Map<string, "waiting" | "ok" | "skipped">();
  const sends: FakeChain["sends"] = [];
  const decisions: FakeChain["decisions"] = [];
  const hiresDelivered: string[] = [];
  const stageMoves: FakeChain["stageMoves"] = [];
  const screenResults: ScreenOutcome[] = [];
  const precheckFlags = new Map<string, ScreenFlag[]>();
  const people = new Map<string, { email: string | null; firstName: string | null }>();
  let mode: RunMode = "live";
  let sendOk = true;
  let orgName: string | null = "Example Org";
  let clock = Date.parse("2026-10-09T03:00:00Z");
  const now = () => new Date((clock += 1000));

  const ACTIVE: MessageStatus[] = ["pending", "approved", "sending", "sent"];
  const active = (key: string) => [...messages.values()].find((m) => m.sendKey === key && m.mode === "live" && ACTIVE.includes(m.status)) ?? null;

  const store: ChainStore = {
    async application(id) {
      const a = apps.get(id);
      return a ? { ...a, flags: [...a.flags], proposal: a.proposal ? { ...a.proposal } : null } : null;
    },
    async setApplication(id, patch, fence) {
      const a = apps.get(id);
      if (!a) return false;
      if (fence && a.step !== fence.step) return false;
      if (patch.step !== undefined) a.step = patch.step as ApplicationStep | null;
      if (patch.epoch !== undefined) a.epoch = patch.epoch;
      if (patch.error !== undefined) a.error = patch.error;
      if (patch.proposal !== undefined) a.proposal = patch.proposal;
      if (patch.flags !== undefined) a.flags = patch.flags;
      return true;
    },
    async requisition(id) {
      const r = reqs.get(id);
      return r ? { ...r, content: { ...r.content } } : null;
    },
    async setRequisition(id, patch, fence) {
      const r = reqs.get(id);
      if (!r) return false;
      if (fence && r.step !== fence.step) return false;
      if (patch.step !== undefined) r.step = patch.step as RequisitionStep | null;
      if (patch.epoch !== undefined) r.epoch = patch.epoch;
      if (patch.error !== undefined) r.error = patch.error;
      return true;
    },
    async openRequisition(id) {
      const r = reqs.get(id);
      if (!r || r.status !== "draft") return false;
      r.status = "open";
      return true;
    },
    async triageApplications(requisitionId) {
      return [...apps.values()].filter(
        (a) =>
          a.jobRequisitionId === requisitionId &&
          a.step === "triage" &&
          !a.archived &&
          !isFinalStatus(a.status) &&
          (a.aiScreenStatus === "done" || a.aiScreenStatus === "failed"),
      );
    },
    async decidedByHand() {
      return [...apps.values()].filter((a) => a.step !== null && !["send", "decide", "closed"].includes(a.step) && isFinalStatus(a.status));
    },
    async chainApplications(requisitionId) {
      return [...apps.values()].filter((a) => a.jobRequisitionId === requisitionId && a.step !== null && a.step !== "closed");
    },
    async shortlists(requisitionId) {
      return [...shortlists.values()].filter((s) => s.requisitionId === requisitionId).sort((a, b) => a.round - b.round);
    },
    async shortlist(id) {
      const s = shortlists.get(id);
      return s ? { ...s, items: s.items.map((i) => ({ ...i })) } : null;
    },
    async insertShortlist(row) {
      const clash = [...shortlists.values()].find(
        (s) => s.requisitionId === row.requisitionId && s.mode === row.mode && (s.round === row.round || (row.mode === "live" && s.status === "proposed")),
      );
      if (clash) return clash;
      const s: Shortlist = { ...row, id: nextId("short"), createdAt: now().toISOString(), decidedAt: null };
      shortlists.set(s.id, s);
      return s;
    },
    async updateShortlist(id, patch, fence) {
      const s = shortlists.get(id);
      if (!s) return false;
      if (fence && !fence.status.includes(s.status)) return false;
      Object.assign(s, patch);
      return true;
    },
    async firstInterviewStage() {
      return { id: "stage-interview", name: "Interview" };
    },
    async moveToStage(applicationId, _from, to) {
      const a = apps.get(applicationId);
      if (a) a.currentStageId = to;
      stageMoves.push({ applicationId, to });
    },
    async messageContext(applicationId) {
      const a = apps.get(applicationId);
      const p = a?.personId ? people.get(a.personId) : undefined;
      const r = a ? reqs.get(a.jobRequisitionId) : undefined;
      return {
        toEmail: p?.email ?? null,
        replyTo: "recruiter@example.test",
        facts: { firstName: p?.firstName ?? null, roleTitle: r?.title ?? "the role", stepName: "First interview", stepMinutes: 45, recruiterName: "Recruiter One" },
      };
    },
    async message(id) {
      const m = messages.get(id);
      return m ? { ...m } : null;
    },
    async messages(applicationId) {
      return [...messages.values()].filter((m) => m.applicationId === applicationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async activeMessage(key) {
      const m = active(key);
      return m ? { ...m } : null;
    },
    async insertMessage(row) {
      if (row.mode === "live") {
        const existing = active(row.sendKey);
        if (existing) return { ...existing };
      }
      const m: CandidateMessage = { ...row, id: nextId("msg"), approvedBy: null, approvedAt: null, claimedAt: null, sentAt: null, error: null, createdAt: now().toISOString() };
      messages.set(m.id, m);
      return { ...m };
    },
    async updateMessage(id, patch, fence) {
      const m = messages.get(id);
      if (!m) return false;
      if (fence && !fence.status.includes(m.status)) return false;
      if (fence?.version && m.version !== fence.version) return false;
      const { providerRef: _ref, ...rest } = patch;
      Object.assign(m, rest);
      return true;
    },
    async claimMessage(id, staleBefore, expiredBefore) {
      const m = messages.get(id);
      if (!m || m.mode !== "live") return false;
      const stale = m.status === "sending" && m.claimedAt !== null && m.claimedAt < staleBefore && m.claimedAt > expiredBefore;
      if (m.status !== "approved" && !stale) return false;
      m.status = "sending";
      m.claimedAt = now().toISOString();
      return true;
    },
  };

  const deps: ChainDeps = {
    store,
    approvals: {
      async open(ref) {
        const open = approvals.find((a) => a.subjectType === ref.subjectType && a.subjectId === ref.subjectId && a.state === "pending");
        const metadata = { label: ref.label, ...ref.metadata };
        if (open) Object.assign(open, { metadata, label: ref.label });
        else approvals.push({ id: nextId("appr"), subjectType: ref.subjectType, subjectId: ref.subjectId, state: "pending", metadata, requestedBy: ref.requestedBy, decidedBy: null, decidedAt: null, label: ref.label });
        return { ok: true };
      },
      async decide(ref) {
        const open = approvals.find((a) => a.subjectType === ref.subjectType && a.subjectId === ref.subjectId && a.state === "pending");
        if (!open) return { ok: true, decided: false };
        if (ref.expect && (open.id !== ref.expect.id || open.metadata.version !== ref.expect.version)) return { ok: true, decided: false };
        Object.assign(open, { state: ref.state, decidedBy: ref.decidedBy, decidedAt: now().toISOString() });
        return { ok: true, decided: true };
      },
      async withdraw(ref) {
        const open = approvals.find((a) => a.subjectType === ref.subjectType && a.subjectId === ref.subjectId && a.state === "pending");
        if (open) Object.assign(open, { state: "cancelled", decidedBy: ref.cancelledBy, decidedAt: now().toISOString() });
        return { ok: true };
      },
      async latest(subjectType, subjectId) {
        const rows = approvals.filter((a) => a.subjectType === subjectType && a.subjectId === subjectId);
        const r = rows[rows.length - 1];
        return r ? { id: r.id, state: r.state, metadata: { ...r.metadata }, decidedBy: r.decidedBy, decidedAt: r.decidedAt, requestedBy: r.requestedBy } : null;
      },
    },
    runs: {
      async park(tick) {
        parks.set(tick, "waiting");
        return { ok: true };
      },
      async close(tick, outcome) {
        if (parks.get(tick) === "waiting") parks.set(tick, outcome.status);
        return { ok: true };
      },
    },
    async precheck(applicationId) {
      return [...(precheckFlags.get(applicationId) ?? [])];
    },
    async screen(applicationId) {
      const res = screenResults.shift() ?? { ok: true, report: { instructionsFound: false, instructionsQuote: "" } };
      const a = apps.get(applicationId);
      if (a) {
        a.aiScreenStatus = res.ok ? "done" : "failed";
        if (res.ok && a.aiRating === null) a.aiRating = 4;
      }
      return res;
    },
    async send(opts) {
      if (mode === "shadow") return false;
      if (!sendOk) return false;
      // Resend's key: a repeat of a key it took sends nothing new.
      if (!sends.some((s) => s.idempotencyKey === opts.idempotencyKey)) sends.push({ to: opts.to, subject: opts.subject, html: opts.html, idempotencyKey: opts.idempotencyKey });
      return true;
    },
    async recordDecision(applicationId, outcome) {
      const a = apps.get(applicationId);
      if (!a) throw new Error("no application");
      const recorded = a.status !== "hired" && a.status !== "rejected";
      if (recorded) a.status = outcome;
      decisions.push({ applicationId, outcome, recorded });
      return recorded;
    },
    async deliverHire(applicationId) {
      hiresDelivered.push(applicationId);
    },
    async cancelInterviews() {},
    mode: () => mode,
    now,
    orgName: () => orgName,
    emailProblem: () => null,
  };

  return {
    deps,
    apps,
    reqs,
    messages,
    shortlists,
    approvals,
    parks,
    sends,
    decisions,
    hiresDelivered,
    stageMoves,
    screenResults,
    precheckFlags,
    people,
    setMode: (m) => {
      mode = m;
    },
    setSendResult: (ok) => {
      sendOk = ok;
    },
    setOrgName: (n) => {
      orgName = n;
    },
    addApplication(over) {
      const a: ChainApplication = {
        personId: `person-${over.id}`,
        candidateName: "Candidate A",
        step: "screen",
        epoch: "2026-10-09T00:00:00.000Z",
        error: null,
        proposal: null,
        status: "active",
        archived: false,
        currentStageId: "stage-applied",
        aiScreenStatus: null,
        aiRating: null,
        flags: [],
        ...over,
      };
      apps.set(a.id, a);
      if (a.personId && !people.has(a.personId)) people.set(a.personId, { email: `${a.id}@example.test`, firstName: "Alex" });
      return a;
    },
    addRequisition(over) {
      const r: ChainRequisition = { title: "Product Engineer", status: "open", step: null, epoch: "2026-10-09T00:00:00.000Z", error: null, isPublic: false, content: { title: "Product Engineer" }, ...over };
      reqs.set(r.id, r);
      return r;
    },
    pending: (subjectType, subjectId) => approvals.find((a) => a.subjectType === subjectType && a.subjectId === subjectId && a.state === "pending"),
  };
}
