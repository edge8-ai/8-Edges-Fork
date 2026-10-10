// An in-memory stand-in for the approvals primitive and the parked-run rows,
// for the writer's and the letter's approval tests (Y.16, Y.17). It keeps the
// rules those flows lean on: one pending row per subject (opening again
// refreshes it), a decision closes only a row still pending, so two decisions
// racing produce one, a withdrawal touches only a pending row, a cancellation
// after a decision is appended, and a subject's answer is its newest row. Each
// suite wires it in with its own vi.mock calls.

export type FakeApproval = {
  id: string;
  subjectType: string;
  subjectId: string;
  state: string;
  approverPermission: string | null;
  metadata: Record<string, unknown>;
  decidedBy: string | null;
  reason: string | null;
};

export type FakePark = { routineId: string; tick: string; status: string; summary: string };

export const fake = { approvals: [] as FakeApproval[], parks: [] as FakePark[], seq: 0, afterRead: null as null | (() => void) };

export function resetApprovalsFake(): void {
  fake.approvals.length = 0;
  fake.parks.length = 0;
  fake.seq = 0;
  fake.afterRead = null;
}

type Ref = { subjectType: string; subjectId: string };
const of = (ref: Ref) => fake.approvals.filter((a) => a.subjectType === ref.subjectType && a.subjectId === ref.subjectId);
const pendingOf = (ref: Ref) => of(ref).find((a) => a.state === "pending");

export const requestsFake = {
  openApproval: async (ref: Ref & { approverPermission?: string; label: string; metadata?: Record<string, unknown> }) => {
    const metadata = { label: ref.label, ...(ref.metadata ?? {}) };
    const open = pendingOf(ref);
    if (open) Object.assign(open, { metadata, approverPermission: ref.approverPermission ?? null });
    else {
      fake.seq += 1;
      fake.approvals.push({ id: `ap-${fake.seq}`, subjectType: ref.subjectType, subjectId: ref.subjectId, state: "pending", approverPermission: ref.approverPermission ?? null, metadata, decidedBy: null, reason: null });
    }
    return { ok: true as const };
  },
  decidePendingApproval: async (
    ref: Ref & { state: string; decidedBy: string | null; reason?: string | null; metadata?: Record<string, unknown>; expect?: { id: string; version: string } },
  ) => {
    const open = pendingOf(ref);
    if (!open) return { ok: true as const, decided: false };
    if (ref.expect && (open.id !== ref.expect.id || open.metadata.version !== ref.expect.version)) return { ok: true as const, decided: false };
    Object.assign(open, { state: ref.state, decidedBy: ref.decidedBy, reason: ref.reason ?? null, metadata: { ...open.metadata, ...(ref.metadata ?? {}) } });
    return { ok: true as const, decided: true };
  },
  withdrawPendingApproval: async (ref: Ref & { cancelledBy: string | null; reason?: string | null }) => {
    const open = pendingOf(ref);
    if (!open) return { ok: true as const, withdrawn: false };
    Object.assign(open, { state: "cancelled", decidedBy: ref.cancelledBy, reason: ref.reason ?? null });
    return { ok: true as const, withdrawn: true };
  },
  cancelApproval: async (ref: Ref & { cancelledBy: string | null }) => {
    const open = pendingOf(ref);
    if (open) {
      Object.assign(open, { state: "cancelled", decidedBy: ref.cancelledBy });
      return { ok: true as const };
    }
    const latest = of(ref).at(-1);
    if (!latest || latest.state === "cancelled") return { ok: true as const };
    fake.seq += 1;
    fake.approvals.push({ ...latest, id: `ap-${fake.seq}`, state: "cancelled", decidedBy: ref.cancelledBy, reason: null });
    return { ok: true as const };
  },
};

export const waitingFake = {
  latestApproval: async (subjectType: string, subjectId: string) => {
    const latest = of({ subjectType, subjectId }).at(-1);
    const answer = latest ? { id: latest.id, state: latest.state, metadata: { ...latest.metadata }, decidedBy: latest.decidedBy, decidedAt: null } : null;
    // Something that happens just after the read, such as another ask
    // refreshing the row the reader is about to decide.
    const after = fake.afterRead;
    fake.afterRead = null;
    after?.();
    return answer;
  },
};

export const parksFake = {
  parkRun: async (routineId: string, tick: string, summary: string) => {
    if (!fake.parks.some((p) => p.routineId === routineId && p.tick === tick)) fake.parks.push({ routineId, tick, status: "waiting", summary });
    return { ok: true as const };
  },
  closeParkedRun: async (routineId: string, tick: string, outcome: { status: string; summary: string }) => {
    const park = fake.parks.find((p) => p.routineId === routineId && p.tick === tick && p.status === "waiting");
    if (park) Object.assign(park, outcome);
    return { ok: true as const };
  },
};

/** The rows for one subject, oldest first. */
export function approvalsFor(subjectType: string, subjectId: string): FakeApproval[] {
  return of({ subjectType, subjectId });
}
