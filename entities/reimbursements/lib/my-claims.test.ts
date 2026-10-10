import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The owner's line about where each claim stands (plan section 3): what they
// read must be what happened — the VND the bank actually sent, and the run a
// returned claim really waits for.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { listMyClaims } from "./my-claims";

const claim = (over: Record<string, unknown>) => ({
  id: "c1",
  title: "Hanoi workshop",
  person_id: "person-a",
  submitted_at: "2026-10-05T02:00:00Z",
  approved_total_vnd: 1_500_000,
  approved_at: "2026-10-10T02:00:00Z",
  paid_at: null,
  created_at: "2026-10-05T01:00:00Z",
  payment_run_id: null,
  payment_id: null,
  ...over,
});

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T05:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("listMyClaims", () => {
  it("says Paid with the VND the covering payment actually sent, not the approved total", async () => {
    script("reimbursement_claims", { data: [claim({ status: "paid", paid_at: "2026-10-16T03:00:00Z", payment_run_id: "run-1", payment_id: "pay-1" })] });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_payment_runs", { data: [{ id: "run-1", run_date: "2026-10-15" }] });
    script("reimbursement_payments", { data: [{ id: "pay-1", paid_vnd: 1_490_000 }] });
    const [mine] = await listMyClaims("person-a");
    expect(mine.line).toBe("Paid ₫1,490,000 on Oct 16, 2026.");
    const read = calls.find((c) => c.table === "reimbursement_payments");
    expect(read?.filters).toEqual(expect.arrayContaining([["in", "id", ["pay-1"]], ["eq", "status", "paid"]]));
  });

  it("names the run after the return for a claim a failed transfer returned on its run's own day", async () => {
    script("reimbursement_claims", { data: [claim({ status: "approved" })] });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: [{ claim_id: "c1", created_at: "2026-10-15T04:00:00Z" }] });
    const [mine] = await listMyClaims("person-a");
    expect(mine.line).toBe("Approved: ₫1,500,000. Will be paid in the run on Nov 1, 2026.");
  });

  it("names the first run after approval for a claim never returned", async () => {
    script("reimbursement_claims", { data: [claim({ status: "approved", approved_at: "2026-10-15T03:00:00Z" })] });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: [] });
    const [mine] = await listMyClaims("person-a");
    expect(mine.line).toBe("Approved: ₫1,500,000. Will be paid in the run on Nov 1, 2026.");
  });
});

// Plan §10, 20261008090000: a receipt the owner removed stays on the claim,
// marked, and counts toward nothing on their own list either. Read with only
// the selected columns, so a read that stops selecting `removed_at` fails here.
describe("removed receipts on the owner's list", () => {
  it("are left out of the receipts count, the total and the rate-pending count", async () => {
    answerOnlySelectedColumns();
    script("reimbursement_claims", { data: [claim({ status: "sent_back", approved_total_vnd: null, approved_at: null })] });
    script("reimbursement_claim_items", {
      data: [
        { claim_id: "c1", amount_vnd: 126000, declined_at: null, removed_at: null },
        { claim_id: "c1", amount_vnd: 900000, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
        { claim_id: "c1", amount_vnd: null, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
      ],
    });
    script("reimbursement_claim_events", { data: [] });
    const [mine] = await listMyClaims("person-a");
    expect(mine).toMatchObject({ receipts: 1, totalVnd: 126000, ratePending: 0 });
  });
});
