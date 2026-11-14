import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.64. A claim is atomic only because its UPDATE carries the conditions: the
// stamp is still null, and so is every column the caller named. Drop either
// `.is(…, null)` and the update matches a row someone already claimed, or a
// starter who already answered, so two runs both "win" and both send. The
// milestone tests stub the claim, so only this suite sees the query itself.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { claimJourneyStamp } from "./journey-claim";

beforeEach(resetFake);

const claimFilters = () => {
  const writes = calls.filter((c) => c.table === "onboarding_plans");
  expect(writes).toHaveLength(1);
  return writes[0].filters;
};

describe("claimJourneyStamp only matches a row whose stamp is still empty", () => {
  it("updates this journey only while the stamp is null", async () => {
    script("onboarding_plans", { data: [{ id: "j1" }] });
    expect(await claimJourneyStamp("j1", "day8_survey_sent_at")).toBe(true);
    const filters = claimFilters();
    expect(filters).toContainEqual(["eq", "id", "j1"]);
    expect(filters).toContainEqual(["is", "day8_survey_sent_at", null]);
  });

  it("also requires every unlessSet column to be null", async () => {
    script("onboarding_plans", { data: [{ id: "j1" }] });
    await claimJourneyStamp("j1", "day45_email_sent_at", ["decision", "day60_promoted_at"]);
    const filters = claimFilters();
    expect(filters).toContainEqual(["is", "day45_email_sent_at", null]);
    expect(filters).toContainEqual(["is", "decision", null]);
    expect(filters).toContainEqual(["is", "day60_promoted_at", null]);
  });

  it("writes the stamp it claims", async () => {
    script("onboarding_plans", { data: [{ id: "j1" }] });
    await claimJourneyStamp("j1", "day180_email_sent_at");
    const [write] = calls.filter((c) => c.table === "onboarding_plans");
    expect(write.ops[0]).toBe("update");
    expect(write.payloads[0]).toMatchObject({ day180_email_sent_at: expect.any(String) });
  });

  it("answers not claimed when no row matched: another run holds it", async () => {
    script("onboarding_plans", { data: [] });
    expect(await claimJourneyStamp("j1", "day8_survey_sent_at", ["day8_response_id"])).toBe(false);
  });

  it("raises on a failed write rather than answering not claimed", async () => {
    script("onboarding_plans", { error: { message: "connection reset" } });
    await expect(claimJourneyStamp("j1", "day60_promoted_at")).rejects.toThrow();
  });
});
