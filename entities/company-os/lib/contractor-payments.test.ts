import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The roll-up used to run three lookups per contractor inside the loop
// (team_members, compensation_sensitive, contractor_payments). What this test
// pins down is that those are now one query each for the whole batch, and that
// the per-person decisions — rates, the already-decided skip, the insert — come
// out exactly as before.
//
// The fake client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts): `from(table)` returns a chainable
// builder that resolves to the next scripted response for that table, records
// the operations it saw, and throws on a query no test scripted.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/entities/portal", () => ({
  updateContractorWorkRequests: () => ({ in: async () => ({ error: null }) }),
}));

const countFor = (table: string) => calls.filter((c) => c.table === table).length;

beforeEach(() => {
  resetFake();
});
afterEach(() => vi.clearAllMocks());

function workRequest(id: string, personId: string, name: string) {
  return {
    id,
    person_id: personId,
    actual_hours: 10,
    actual_overtime_hours: 0,
    people: { full_name: name, email: `${personId}@example.com` },
  };
}

describe("rollupContractorPayments", () => {
  it("reads rates and existing payments once for the whole batch", async () => {
    script("contractor_work_requests", {
      data: [workRequest("w1", "p1", "Ann"), workRequest("w2", "p2", "Bo"), workRequest("w3", "p3", "Cy")],
    });
    script("team_members", {
      data: [
        { id: "tm1", person_id: "p1" },
        { id: "tm2", person_id: "p2" },
      ],
    });
    script("compensation_sensitive", {
      data: [
        { team_member_id: "tm1", comp_type: "hourly", amount_cents: 5000, currency: "usd" },
        { team_member_id: "tm2", comp_type: "hourly", amount_cents: 6000, currency: "usd" },
      ],
    });
    // The batched existing-payments read, then p1's insert and totals update.
    script(
      "contractor_payments",
      { data: [{ id: "pay2", status: "paid", person_id: "p2" }] },
      { data: { id: "pay1" } },
      { error: null },
    );
    // The recompute read of everything linked to p1's payment.
    script("contractor_work_requests", { data: [{ actual_hours: 10, actual_overtime_hours: 0 }] });

    const { rollupContractorPayments } = await import("./contractor-payments");
    const result = await rollupContractorPayments("2026-08-01");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // Three contractors, but one lookup each for members and compensation.
    expect(countFor("team_members")).toBe(1);
    expect(countFor("compensation_sensitive")).toBe(1);
    expect(result.created).toBe(1);
    expect(result.requestsLinked).toBe(1);
    // p2's payment is already paid; p3 has no team_members row.
    expect(result.skipped).toEqual([
      "Bo: payment for 2026-08-01 already paid — new work left unlinked",
      "Cy: no team_members row",
    ]);
  });

  // E8-10: the recompute read used to be unchecked, so a failed read summed an
  // empty list and overwrote a correct payment with zero hours and zero cents.
  it("skips the contractor instead of zeroing the payment when the recompute read fails", async () => {
    script("contractor_work_requests", { data: [workRequest("w1", "p1", "Ann")] });
    script("team_members", { data: [{ id: "tm1", person_id: "p1" }] });
    script("compensation_sensitive", {
      data: [{ team_member_id: "tm1", comp_type: "hourly", amount_cents: 5000, currency: "usd" }],
    });
    script("contractor_payments", { data: [] }, { data: { id: "pay1" } });
    script("contractor_work_requests", { error: { message: "read timeout" } });

    const { rollupContractorPayments } = await import("./contractor-payments");
    const result = await rollupContractorPayments("2026-08-01");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.skipped).toEqual(["Ann: could not recompute totals (read timeout)"]);
    // The read and the insert only — no third query updating the totals.
    expect(countFor("contractor_payments")).toBe(2);
  });

  it("treats a duplicate team_members row as absent, as maybeSingle did", async () => {
    script("contractor_work_requests", { data: [workRequest("w1", "p1", "Ann")] });
    script("team_members", {
      data: [
        { id: "tm1", person_id: "p1" },
        { id: "tm1b", person_id: "p1" },
      ],
    });
    script("contractor_payments", { data: [] });

    const { rollupContractorPayments } = await import("./contractor-payments");
    const result = await rollupContractorPayments("2026-08-01");
    expect(result).toMatchObject({ created: 0, skipped: ["Ann: no team_members row"] });
  });
});
