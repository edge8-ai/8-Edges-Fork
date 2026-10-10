import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.5. An Edge8 manager decides a report's leave on /team/approvals, but only
// when the approver resolver names THEM as the Edge8 approver, and only while
// the request is pending. The decision is written to the row, announced after
// the write, and settles the request's approval with their person, which is
// where who decided is kept.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const resolveLeaveApprover = vi.fn();
let leads = false;
vi.mock("./approver", () => ({
  resolveLeaveApprover: (id: string) => resolveLeaveApprover(id),
  leadsTheOrg: async () => leads,
}));
// The real leave step runs (A.30); only its edges are recorded: the approval
// it settles and the fact it states.
const settled: { state: string; subjectId: string; decidedBy: string | null }[] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  decideApproval: async (r: { state: string; subjectId: string; decidedBy: string | null }) =>
    void settled.push({ state: r.state, subjectId: r.subjectId, decidedBy: r.decidedBy }),
  cancelApproval: async () => ({ ok: true }),
  openApproval: async () => ({ ok: true }),
}));
const published: string[] = [];
vi.mock("@/kernel/events", () => ({ publish: async (name: string) => void published.push(name) }));

import type { TeamActor } from "@/kernel/identity/team-auth";
import { decideLeaveAsManager } from "./manager-decisions";

const MANAGER = { personId: "juno", teamMemberId: "tm-juno" } as TeamActor;
const REQUEST = { status: "requested", team_member_id: "tm-rowan", start_date: "2026-10-01", end_date: "2026-10-03", leave_type: "annual" };
const EDGE8_JUNO = { kind: "edge8", personId: "juno", email: "juno@x.test", displayName: "Juno", companyId: null };

beforeEach(() => {
  resetFake();
  resolveLeaveApprover.mockReset();
  settled.length = 0;
  published.length = 0;
  leads = false;
});

describe("decideLeaveAsManager", () => {
  it("approves a pending request the resolver names this manager for, then announces and settles it", async () => {
    script("time_off", { data: REQUEST }, { data: [{ id: "lv-1" }] });
    resolveLeaveApprover.mockResolvedValue(EDGE8_JUNO);
    expect(await decideLeaveAsManager(MANAGER, "lv-1", "approved")).toEqual({ ok: true });
    const update = calls.find((c) => c.ops[0] === "update");
    // Who decided lives on the approval now (S.5 contract): the leave row keeps only when.
    expect(update?.payloads[0]).toEqual({ status: "approved", approved_at: expect.any(String) });
    expect(update?.filters).toContainEqual(["eq", "status", "requested"]);
    expect(settled).toEqual([{ state: "approved", subjectId: "lv-1", decidedBy: "juno" }]);
    expect(published).toEqual(["leave.approved"]);
  });

  it("announces and records nothing when somebody decided it between the read and the write", async () => {
    // The guarded update matched no row: the request was no longer pending.
    script("time_off", { data: REQUEST }, { data: [] });
    resolveLeaveApprover.mockResolvedValue(EDGE8_JUNO);
    expect(await decideLeaveAsManager(MANAGER, "lv-1", "approved")).toEqual({ ok: false, error: "This request has already been decided." });
    expect(settled).toEqual([]);
    expect(published).toEqual([]);
  });

  it("refuses a manager deciding their own leave, whatever the resolver says", async () => {
    script("time_off", { data: { ...REQUEST, team_member_id: "tm-juno" } });
    resolveLeaveApprover.mockResolvedValue(EDGE8_JUNO);
    expect((await decideLeaveAsManager(MANAGER, "lv-1", "approved")).ok).toBe(false);
    expect(resolveLeaveApprover).not.toHaveBeenCalled();
  });

  it("lets whoever leads the organisation decide their own leave, since nobody is above them", async () => {
    leads = true;
    script("time_off", { data: { ...REQUEST, team_member_id: "tm-juno" } }, { data: [{ id: "lv-1" }] });
    expect(await decideLeaveAsManager(MANAGER, "lv-1", "approved")).toEqual({ ok: true });
    expect(resolveLeaveApprover).not.toHaveBeenCalled();
    expect(settled).toEqual([{ state: "approved", subjectId: "lv-1", decidedBy: "juno" }]);
  });

  it("refuses when the resolver names somebody else, and writes nothing", async () => {
    script("time_off", { data: REQUEST });
    resolveLeaveApprover.mockResolvedValue({ ...EDGE8_JUNO, personId: "kai" });
    expect(await decideLeaveAsManager(MANAGER, "lv-1", "approved")).toEqual({ ok: false, error: "You cannot decide this request." });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });

  it("refuses a request a client manager decides, even for the same person", async () => {
    script("time_off", { data: REQUEST });
    resolveLeaveApprover.mockResolvedValue({ ...EDGE8_JUNO, kind: "client" });
    expect((await decideLeaveAsManager(MANAGER, "lv-1", "approved")).ok).toBe(false);
  });

  it("refuses a decision already made, by the manager's narrower rule", async () => {
    script("time_off", { data: { ...REQUEST, status: "approved" } });
    resolveLeaveApprover.mockResolvedValue(EDGE8_JUNO);
    expect(await decideLeaveAsManager(MANAGER, "lv-1", "rejected")).toEqual({ ok: false, error: "This request has already been decided." });
    expect(settled).toEqual([]);
  });
});
