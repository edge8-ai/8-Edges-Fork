import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The hiring driver's due lists (Z.9): in shadow only the screen and the
// shortlist are offered, so nothing that asks, sends or decides is even
// claimed; a requisition collecting is offered only once five screened
// applications wait that no round has covered; and each step's tick names
// the visit (the message it sends, the round it proposes), so a second send
// in one run is a new tick. A switch that cannot be read offers nothing.

let mode: { ok: true; mode: "live" | "shadow" | "paused"; reason: null } | { ok: false; error: string } = { ok: true, mode: "live", reason: null };

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/routine-config", () => ({ readRoutineMode: async () => mode }));
vi.mock("./deps", () => ({ chainDeps: {} }));

import { dueApplicationRuns, dueRequisitionRuns } from "./run";
import { fakeChain } from "./testing/fake-chain";

const REQ = "req00000-0000-4000-8000-000000000001";

beforeEach(() => {
  resetFake();
  mode = { ok: true, mode: "live", reason: null };
});

describe("dueApplicationRuns", () => {
  it("offers every acting step when live, the send named by its message", async () => {
    const c = fakeChain();
    c.addApplication({ id: "a1", jobRequisitionId: REQ, step: "screen" });
    c.addApplication({ id: "a2", jobRequisitionId: REQ, step: "send" });
    await c.deps.store.insertMessage({ applicationId: "a2", personId: null, kind: "invite", stageId: "s", mode: "live", status: "pending", toEmail: "x@example.test", subject: "S", body: "B", draftedBody: "B", version: "v", sendKey: "hiring:msg:a2:invite:s", runTick: null });
    const msg = [...c.messages.values()][0];
    msg.status = "approved";
    script("applications", { data: [{ id: "a1" }, { id: "a2" }] });
    const runs = await dueApplicationRuns(c.deps);
    expect(runs.map((r) => r.step)).toEqual(["screen", `send:${msg.id}:v`]);
  });

  it("offers only the screen in shadow", async () => {
    mode = { ok: true, mode: "shadow", reason: null };
    const c = fakeChain();
    c.addApplication({ id: "a1", jobRequisitionId: REQ, step: "screen" });
    c.addApplication({ id: "a2", jobRequisitionId: REQ, step: "draft-invite" });
    c.addApplication({ id: "a3", jobRequisitionId: REQ, step: "decide" });
    script("applications", { data: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] });
    expect((await dueApplicationRuns(c.deps)).map((r) => r.id)).toEqual(["a1"]);
  });

  it("offers nothing when the switch cannot be read", async () => {
    mode = { ok: false, error: "connection reset" };
    await expect(dueApplicationRuns(fakeChain().deps)).rejects.toThrow(/switch could not be read/);
  });
});

describe("dueRequisitionRuns", () => {
  it("offers a requisition collecting once five new screened applications wait, as the next round", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "collecting" });
    for (const n of [1, 2, 3, 4]) c.addApplication({ id: `a${n}`, jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4 });
    script("job_requisitions", { data: [{ id: REQ }] }, { data: [{ id: REQ }] });
    expect(await dueRequisitionRuns(c.deps)).toEqual([]);
    c.addApplication({ id: "a5", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "failed" });
    expect(await dueRequisitionRuns(c.deps)).toEqual([{ id: REQ, epoch: "2026-10-09T00:00:00.000Z", step: "shortlist:1" }]);
  });

  it("leaves a requisition that is no longer open", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "collecting", status: "filled" });
    for (const n of [1, 2, 3, 4, 5]) c.addApplication({ id: `a${n}`, jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4 });
    script("job_requisitions", { data: [{ id: REQ }] });
    expect(await dueRequisitionRuns(c.deps)).toEqual([]);
  });
});
