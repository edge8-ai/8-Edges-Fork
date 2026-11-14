import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// How each move on an advance keeps the kernel's approvals in step. What matters is what
// the Inbox and "Waiting on you" then read: one waiting row while it waits on someone,
// none once it does not, and a decision on the row that was waiting.
const kernel = vi.hoisted(() => ({
  opened: [] as Record<string, unknown>[],
  cancelled: [] as Record<string, unknown>[],
  decidedPending: [] as Record<string, unknown>[],
  decided: [] as Record<string, unknown>[],
  pending: true,
  raises: false,
}));
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => {
    if (kernel.raises) throw new Error("kernel down");
    kernel.opened.push(r);
    return { ok: true };
  },
  cancelApproval: async (r: Record<string, unknown>) => (kernel.cancelled.push(r), { ok: true }),
  decidePendingApproval: async (r: Record<string, unknown>) => (kernel.decidedPending.push(r), { ok: true, decided: kernel.pending }),
  decideApproval: async (r: Record<string, unknown>) => (kernel.decided.push(r), { ok: true }),
}));
const names = vi.hoisted(() => ({ fails: false }));
vi.mock("./notices", () => ({
  ownerName: async () => {
    if (names.fails) throw new Error("people down");
    return "Avery Example";
  },
}));
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { recordAdvanceApproval } from "./advance-decisions";

const row = { id: "advance-1", refNo: 7, personId: "person-a", purpose: "Venue deposit", amountVnd: 8_000_000 };
const actor = { personId: "person-d", label: "approver@test" };
const move = (m: Parameters<typeof recordAdvanceApproval>[0]["move"], reason: string | null = null) => recordAdvanceApproval({ row, move: m, actor, reason });

beforeEach(() => {
  kernel.opened.length = 0;
  kernel.cancelled.length = 0;
  kernel.decidedPending.length = 0;
  kernel.decided.length = 0;
  kernel.pending = true;
  kernel.raises = false;
  names.fails = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a submit", () => {
  it("opens one approval on whoever holds reimbursements.approve, never on a person, saying who and how much", async () => {
    await move("submit");
    expect(kernel.opened).toEqual([
      expect.objectContaining({
        subjectType: "reimbursement_advance",
        subjectId: "advance-1",
        approverPermission: "reimbursements.approve",
        requestedBy: "person-a",
        label: "Avery Example asks for ₫8,000,000",
        metadata: { advanceId: "advance-1", ref: "ADV-0007", purpose: "Venue deposit", amountVnd: 8_000_000 },
      }),
    ]);
    expect(kernel.opened[0].approverPersonId).toBeUndefined();
  });

  it("still opens it when the name cannot be read: the person's name is not worth losing the ask", async () => {
    names.fails = true;
    await move("submit");
    expect(kernel.opened[0].label).toBe("Someone asks for ₫8,000,000");
  });
});

describe("taking it back", () => {
  it.each(["withdraw", "cancel"] as const)("%s cancels the approval, naming who did", async (m) => {
    await move(m);
    expect(kernel.cancelled).toEqual([expect.objectContaining({ subjectType: "reimbursement_advance", subjectId: "advance-1", cancelledBy: "person-d" })]);
  });
});

describe("the approver's moves", () => {
  it("settles the waiting row as approved, keeping the figure it was decided on", async () => {
    await move("approve");
    expect(kernel.decidedPending).toEqual([expect.objectContaining({ state: "approved", decidedBy: "person-d", metadata: { amountVnd: 8_000_000 } })]);
    expect(kernel.decided).toHaveLength(0);
  });

  it("reads approved again when Finance puts it back, in the approver's name and not Finance's", async () => {
    kernel.pending = false;
    await recordAdvanceApproval({ row: { ...row, decidedBy: "person-d" }, move: "reinstate", actor: { personId: "person-t", label: "payer@test" }, reason: "Already sent." });
    expect(kernel.decided).toEqual([expect.objectContaining({ state: "approved", decidedBy: "person-d", metadata: { amountVnd: 8_000_000, reinstatedBy: "person-t" } })]);
  });

  it.each([["send_back", "sent_back"], ["reject", "rejected"]] as const)("settles %s as a no, with the outcome and the reason", async (m, outcome) => {
    await move(m, "The quote is out of date.");
    expect(kernel.decidedPending).toEqual([expect.objectContaining({ state: "rejected", reason: "The quote is out of date.", metadata: { outcome, amountVnd: 8_000_000 } })]);
  });

  it("leaves one decided row when nothing was waiting, so every decision has its record", async () => {
    kernel.pending = false;
    await move("approve");
    expect(kernel.decided).toEqual([expect.objectContaining({ state: "approved", requestedBy: "person-a", label: "Advance ADV-0007" })]);
  });
});

describe("what it stays out of", () => {
  it.each(["pay_out", "close", "return_unspent", "confirm_return"] as const)("%s touches no approval", async (m) => {
    await move(m);
    expect([...kernel.opened, ...kernel.cancelled, ...kernel.decidedPending, ...kernel.decided]).toHaveLength(0);
  });

  it("never throws: the advance has moved, so a failure here is logged and not answered as a failed move", async () => {
    kernel.raises = true;
    await expect(move("submit")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
