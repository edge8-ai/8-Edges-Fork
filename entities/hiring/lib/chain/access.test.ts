import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEVER_WAITS_ON_REQUESTER } from "@/kernel/approvals/vocabulary";

// Who decides in the hiring chain (Z.9, spec section 6, test 10): every
// approver's action requires hiring.approve before it reads anything, so a
// holder of hiring.ats alone is refused; the recruiter's actions require
// hiring.ats; and a proposed hire never waits on the person who proposed it.

const held = new Set<string>();
const refused: string[] = [];

vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (atom: string) => {
    if (!held.has(atom)) {
      refused.push(atom);
      throw new Error(`NEXT_NOT_FOUND ${atom}`);
    }
    return { personId: "p-1", user: { email: "someone@example.test" }, may: (a: string) => held.has(a) };
  },
}));
// Nothing past the guard may run in these tests: any read would fail loudly.
vi.mock("./deps", () => ({ chainDeps: new Proxy({}, { get: () => { throw new Error("reached the chain past the guard"); } }) }));
vi.mock("./run", () => ({ chainMode: async () => "live", runApplicationNow: async () => null, runRequisitionNow: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const approve = await import("./approve-actions");

const ID = "3f1c2a90-7d4e-4b8a-9c0f-1e2d3c4b5a69";
const V = "0123456789ab";

beforeEach(() => {
  held.clear();
  refused.length = 0;
});

describe("the approver's actions", () => {
  it("refuse a holder of hiring.ats alone, before touching the chain", async () => {
    held.add("hiring.ats");
    const calls: [string, () => Promise<unknown>][] = [
      ["approveCandidateMessage", () => approve.approveCandidateMessage(ID, V)],
      ["dontSendCandidateMessage", () => approve.dontSendCandidateMessage(ID, null)],
      ["editCandidateMessage", () => approve.editCandidateMessage(ID, { subject: "S", body: "B" })],
      ["approveApplicationDecision", () => approve.approveApplicationDecision(ID, V)],
      ["rejectApplicationDecision", () => approve.rejectApplicationDecision(ID, null)],
      ["approveHiringShortlist", () => approve.approveHiringShortlist(ID, V)],
      ["rejectHiringShortlist", () => approve.rejectHiringShortlist(ID, null)],
      ["moveShortlistLane", () => approve.moveShortlistLane(ID, ID, "hold")],
      ["approveRequisitionOpening", () => approve.approveRequisitionOpening(ID, V)],
      ["rejectRequisitionOpening", () => approve.rejectRequisitionOpening(ID, null)],
    ];
    for (const [name, call] of calls) await expect(call(), name).rejects.toThrow(/NEXT_NOT_FOUND hiring\.approve/);
    expect(refused).toEqual(calls.map(() => "hiring.approve"));
  });

  it("are declared under hiring.approve, the recruiter's under hiring.ats", () => {
    const decl = readFileSync(path.resolve(__dirname, "../../permissions.ts"), "utf8");
    expect(decl).toContain('"lib/chain/approve-actions": "hiring.approve"');
    expect(decl).toContain('"lib/chain/actions": "hiring.ats"');
  });

  it("never list a proposed hire for the person who proposed it", () => {
    expect(NEVER_WAITS_ON_REQUESTER.has("hiring_hire")).toBe(true);
    expect(NEVER_WAITS_ON_REQUESTER.has("hiring_reject")).toBe(false);
  });
});
