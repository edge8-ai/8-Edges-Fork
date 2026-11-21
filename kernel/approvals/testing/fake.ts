// The house fake of the approvals primitive (A.39), shared by every flow that
// parks on a decision: the writer's publish, the letter's send, the proposal
// chain and the meeting follow-up. It lives in the kernel, beside the module it
// fakes, for the reason kernel/data/testing/fake-company-os.ts does: any entity
// may import the kernel, and no entity may reach into another's lib/. Three
// suites each kept their own copy until A.39, with three store shapes, and none
// returned the requestedBy and reason SubjectApproval carries since A.38, so
// they had drifted from the kernel without anything failing.
//
// It keeps the rules the flows lean on, the same ones requests.ts writes:
// - an approval waits on a person or on a permission atom, never both;
// - one pending row per subject; opening it again refreshes who it waits on and
//   what it says, and keeps the asker it was opened with;
// - a decision closes only a row still pending, so two racing produce one, and
//   `expect` binds it to that row and its metadata.version;
// - decideApproval with nothing pending writes a row already decided;
// - a withdrawal touches only a pending row;
// - a cancellation after a decision is appended, never written over it;
// - a subject's answer is its newest row, in the full SubjectApproval shape.
//
// Each function is typed against the real one, so a change to the kernel's
// signatures fails here at compile time instead of leaving the fake behind.
// Each suite still declares its own vi.mock calls, which vitest hoists:
//   vi.mock("@/kernel/approvals/requests", async () => (await import("@/kernel/approvals/testing/fake")).requestsFake);
//   vi.mock("@/kernel/approvals/waiting", async () => (await import("@/kernel/approvals/testing/fake")).waitingFake);
import type * as Requests from "../requests";
import type * as Waiting from "../waiting";
import { isPermissionAtom, type ApprovalState } from "../vocabulary";

export type FakeApproval = {
  id: string;
  subjectType: string;
  subjectId: string;
  state: ApprovalState;
  requestedBy: string | null;
  approverPersonId: string | null;
  approverPermission: string | null;
  metadata: Record<string, unknown>;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
};

/**
 * Every approval row, oldest first, as the table would hold them. `afterRead`
 * runs once, just after the next latestApproval read: something that happens
 * between a reader's read and its decision, such as another ask refreshing the
 * row it is about to decide.
 */
export const approvals = { rows: [] as FakeApproval[], seq: 0, afterRead: null as null | (() => void) };

export function resetApprovalsFake(): void {
  approvals.rows.length = 0;
  approvals.seq = 0;
  approvals.afterRead = null;
}

/** The rows for one subject, oldest first. */
export function approvalsFor(subjectType: string, subjectId: string): FakeApproval[] {
  return approvals.rows.filter((a) => a.subjectType === subjectType && a.subjectId === subjectId);
}

// A v4-shaped id, so a flow that validates the id it is handed back (`expect`)
// accepts it; the variant digit keeps it apart from any id a suite mints itself.
function nextId(): string {
  approvals.seq += 1;
  return `00000000-0000-4000-a000-${String(approvals.seq).padStart(12, "0")}`;
}

type Ref = { subjectType: string; subjectId: string };
const pendingOf = (ref: Ref) => approvalsFor(ref.subjectType, ref.subjectId).find((a) => a.state === "pending");
const latestOf = (ref: Ref) => approvalsFor(ref.subjectType, ref.subjectId).at(-1);
const now = () => new Date().toISOString();

type Fn<K extends keyof typeof Requests> = (...args: Parameters<(typeof Requests)[K]>) => ReturnType<(typeof Requests)[K]>;

const openApproval: Fn<"openApproval"> = async (ref) => {
  const permission = ref.approverPermission ?? null;
  if (permission !== null && ref.approverPersonId != null) return { ok: false, error: "An approval waits on a person or on a permission, never both." };
  if (permission !== null && !isPermissionAtom(permission)) return { ok: false, error: `"${permission}" is not a permission atom.` };
  const patch = { approverPersonId: ref.approverPersonId ?? null, approverPermission: permission, metadata: { label: ref.label, ...(ref.metadata ?? {}) } };
  const open = pendingOf(ref);
  if (open) Object.assign(open, patch);
  else
    approvals.rows.push({
      id: nextId(),
      subjectType: ref.subjectType,
      subjectId: ref.subjectId,
      state: "pending",
      requestedBy: ref.requestedBy,
      decidedBy: null,
      decidedAt: null,
      reason: null,
      ...patch,
    });
  return { ok: true };
};

const decideApproval: Fn<"decideApproval"> = async (ref) => {
  const decision = { state: ref.state, decidedBy: ref.decidedBy, decidedAt: now(), reason: ref.reason ?? null };
  const open = pendingOf(ref);
  if (open) Object.assign(open, decision);
  else
    approvals.rows.push({
      id: nextId(),
      subjectType: ref.subjectType,
      subjectId: ref.subjectId,
      requestedBy: ref.requestedBy ?? null,
      approverPersonId: ref.decidedBy,
      approverPermission: null,
      metadata: { label: ref.label ?? null, ...(ref.metadata ?? {}) },
      ...decision,
    });
  return { ok: true };
};

const decidePendingApproval: Fn<"decidePendingApproval"> = async (ref) => {
  const open = pendingOf(ref);
  if (!open) return { ok: true, decided: false };
  if (ref.expect && (open.id !== ref.expect.id || open.metadata.version !== ref.expect.version)) return { ok: true, decided: false };
  Object.assign(open, {
    state: ref.state,
    decidedBy: ref.decidedBy,
    decidedAt: now(),
    reason: ref.reason ?? null,
    metadata: { ...open.metadata, ...(ref.metadata ?? {}) },
  });
  return { ok: true, decided: true };
};

const withdrawPendingApproval: Fn<"withdrawPendingApproval"> = async (ref) => {
  const open = pendingOf(ref);
  if (!open) return { ok: true, withdrawn: false };
  Object.assign(open, { state: "cancelled", decidedBy: ref.cancelledBy, decidedAt: now(), reason: ref.reason ?? null });
  return { ok: true, withdrawn: true };
};

const cancelApproval: Fn<"cancelApproval"> = async (ref) => {
  const open = pendingOf(ref);
  if (open) {
    Object.assign(open, { state: "cancelled", decidedBy: ref.cancelledBy, decidedAt: now() });
    return { ok: true };
  }
  const latest = latestOf(ref);
  if (!latest || latest.state === "cancelled") return { ok: true };
  approvals.rows.push({ ...latest, id: nextId(), metadata: { ...latest.metadata }, state: "cancelled", decidedBy: ref.cancelledBy, decidedAt: now(), reason: null });
  return { ok: true };
};

const annotateApproval: Fn<"annotateApproval"> = async (ref) => {
  const latest = latestOf(ref);
  if (!latest) return { ok: false, error: "No approval on record." };
  latest.metadata = { ...latest.metadata, ...ref.metadata };
  return { ok: true };
};

export const requestsFake = {
  openApproval,
  decideApproval,
  decidePendingApproval,
  withdrawPendingApproval,
  cancelApproval,
  annotateApproval,
} satisfies typeof Requests;

const latestApproval: (...args: Parameters<typeof Waiting.latestApproval>) => ReturnType<typeof Waiting.latestApproval> = async (subjectType, subjectId) => {
  const r = latestOf({ subjectType, subjectId });
  const answer = r
    ? { id: r.id, state: r.state, metadata: { ...r.metadata }, decidedBy: r.decidedBy, decidedAt: r.decidedAt, requestedBy: r.requestedBy, reason: r.reason }
    : null;
  const after = approvals.afterRead;
  approvals.afterRead = null;
  after?.();
  return answer;
};

export const waitingFake = { latestApproval } satisfies Pick<typeof Waiting, "latestApproval">;
