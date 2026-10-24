import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A contractor's own work and pay (/team/my-work): every read is filtered to
// the signed-in person, a request links back only while it waits on them, and
// overtime reads as the hourly rate when none is set, as the roll-up pays it.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { loadMyContractorWork } = await import("./my-contractor-work");

beforeEach(resetFake);
afterEach(() => vi.clearAllMocks());

function scriptAll({ comps = [{ comp_type: "hourly", amount_cents: 3750, currency: "usd" }] } = {}) {
  script("contractor_work_requests", {
    data: [
      { id: "r1", title: "Week 1 classes", status: "approved", estimated_hours: "6", actual_hours: null, actual_overtime_hours: 0, created_at: "2026-10-12T02:00:00Z", access_token: "tok-1" },
      { id: "r2", title: "Slides", status: "completed", estimated_hours: 4, actual_hours: "4.5", actual_overtime_hours: "1", created_at: "2026-09-02T02:00:00Z", access_token: "tok-2" },
    ],
  });
  script("contractor_payments", {
    data: [{ id: "p1", period_month: "2026-09-01", total_regular_hours: "11.5", total_overtime_hours: 0, amount_cents: "43125", currency: "usd", status: "pending", paid_at: null, note: null }],
  });
  script("compensation_sensitive", { data: comps });
}

describe("loadMyContractorWork", () => {
  it("filters every read to the person and team member it is given", async () => {
    scriptAll();
    await loadMyContractorWork("person-1", "tm-1");
    const filter = (table: string, col: string) => calls.find((c) => c.table === table)?.filters.find((f) => f[0] === "eq" && f[1] === col);
    expect(filter("contractor_work_requests", "person_id")).toEqual(["eq", "person_id", "person-1"]);
    expect(filter("contractor_payments", "person_id")).toEqual(["eq", "person_id", "person-1"]);
    expect(filter("compensation_sensitive", "team_member_id")).toEqual(["eq", "team_member_id", "tm-1"]);
  });

  it("links a request only while the next move is the contractor's", async () => {
    scriptAll();
    const { requests } = await loadMyContractorWork("person-1", "tm-1");
    expect(requests.map((r) => [r.id, r.openHref])).toEqual([
      ["r1", "/work/tok-1"],
      ["r2", null],
    ]);
    expect(requests[1]).toMatchObject({ hours: 4.5, overtimeHours: 1, estimatedHours: 4 });
  });

  // A Super Admin viewing as the contractor must not get a link that acts as
  // them: /work/<token> is outside /team, so the read-only rule never sees it.
  it("links nothing while a Super Admin is viewing as the contractor", async () => {
    scriptAll();
    const { requests } = await loadMyContractorWork("person-1", "tm-1", { assumed: true });
    expect(requests.map((r) => r.openHref)).toEqual([null, null]);
  });

  it("reads numbers that come back as strings, and the payment as it stands", async () => {
    scriptAll();
    const { payments } = await loadMyContractorWork("person-1", "tm-1");
    expect(payments).toEqual([
      { id: "p1", month: "2026-09-01", regularHours: 11.5, overtimeHours: 0, amountCents: 43125, currency: "usd", status: "pending", paidAt: null, note: null },
    ]);
  });

  it("leaves overtime unset when only an hourly rate exists, and says when there is no rate", async () => {
    scriptAll();
    expect((await loadMyContractorWork("person-1", "tm-1")).rate).toEqual({ hourlyCents: 3750, overtimeCents: null, currency: "usd" });
    resetFake();
    scriptAll({ comps: [] });
    expect((await loadMyContractorWork("person-1", "tm-1")).rate).toBeNull();
  });

  it("raises when a read fails, rather than showing no payments", async () => {
    script("contractor_work_requests", { data: [] });
    script("contractor_payments", { data: null, error: { message: "boom" } });
    script("compensation_sensitive", { data: [] });
    await expect(loadMyContractorWork("person-1", "tm-1")).rejects.toThrow(/contractor_payments/);
  });
});
