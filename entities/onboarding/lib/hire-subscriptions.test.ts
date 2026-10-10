import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Onboarding's side of a hire (S.2).
//
// The journey was opened by whoever got there first: the new-hire intake form
// (lib/data.ts), the probation decision, `backfillJourneys` running at the top
// of the admin onboarding page, and the nightly cycle's own backfill pass. A
// hire decided at 10am therefore showed on the manager's board whenever one of
// those next happened to run.
//
// What is pinned here is the narrow thing the event adds: a person already on
// the payroll gets their journey immediately, and every other shape of hire is
// left to the paths that were already handling it.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (t: string) => builderFor(t) },
  supabase: { from: (t: string) => builderFor(t) },
}));

const ensureJourney = vi.fn(async () => undefined);
vi.mock("./cycle", () => ({
  ensureJourney: (...args: unknown[]) => ensureJourney(...(args as [])),
  LIVE_STATUSES: ["active", "pre_start", "on_leave", "notice"],
}));

import { openPlanForHire } from "./hire-subscriptions";

const HIRED = {
  applicationId: "app-1",
  jobRequisitionId: "jr-1",
  candidateId: "cand-1",
  personId: "person-1",
};

// The one read a hire with a person makes: their live employment record.
const scriptMember = (answer: { data?: unknown; error?: { message: string } }) => script("team_members", answer);

beforeEach(() => {
  resetFake();
  ensureJourney.mockClear();
});

describe("openPlanForHire", () => {
  it("opens the journey for a hire who is already on the payroll", async () => {
    scriptMember({ data: { id: "tm-1" } });
    await openPlanForHire(HIRED);
    expect(ensureJourney).toHaveBeenCalledWith("tm-1");
  });

  it("waits for the intake form when the hire has no person row yet", async () => {
    // The normal case. Nothing to look up, so nothing is looked up.
    await openPlanForHire({ ...HIRED, personId: null });
    expect(calls).toHaveLength(0);
    expect(ensureJourney).not.toHaveBeenCalled();
  });

  it("waits for the intake form when the person is not an employee yet", async () => {
    // A hired candidate who exists as a contact but has no employment record:
    // there is no journey to hang on anything, and inventing a team member
    // here would be onboarding writing a table it does not own.
    scriptMember({ data: null });
    await openPlanForHire(HIRED);
    expect(ensureJourney).not.toHaveBeenCalled();
  });

  it("only counts a live employment record, never an alumnus", async () => {
    scriptMember({ data: { id: "tm-1" } });
    await openPlanForHire(HIRED);
    const read = calls.find((c) => c.table === "team_members")!;
    const [, column, statuses] = read.filters.find((f) => f[0] === "in") as [string, string, string[]];
    expect(column).toBe("status");
    expect(statuses).not.toContain("terminated");
    expect(statuses).not.toContain("alumni");
  });

  it("throws when the lookup fails, so the bus audits the drop", async () => {
    scriptMember({ error: { message: "connection reset" } });
    await expect(openPlanForHire(HIRED)).rejects.toThrow(/person-1/);
    expect(ensureJourney).not.toHaveBeenCalled();
  });
});
