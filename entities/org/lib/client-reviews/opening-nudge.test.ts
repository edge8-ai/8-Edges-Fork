import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.5: a week before a framework's usual opening date, the person who
// opened its last cycle is nudged in their Inbox. Once a year per framework,
// nothing for a framework without a date, and nothing to anyone at the client.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ published: [] as { name: string; payload: unknown }[] }));
vi.mock("@/kernel/events", () => ({
  publish: async (name: string, payload: unknown) => {
    h.published.push({ name, payload });
  },
}));

import { nudgeClientReviewOpenings, openingNudgesDue, usualOpeningIn, type FrameworkForNudge, type LastCycle } from "./opening-nudge";

const NOV: FrameworkForNudge = { id: "fw-nov", name: "Competency review, November", usualOpenMonth: 11, usualOpenDay: 10, archived: false };
const APR: FrameworkForNudge = { id: "fw-apr", name: "Competency review, April", usualOpenMonth: 4, usualOpenDay: 10, archived: false };
const MAI = "person-mai";
const lastNov: LastCycle = { frameworkId: "fw-nov", openedBy: MAI, openedOn: "2026-11-11", clientName: "On Target" };
const byFramework = new Map([["fw-nov", lastNov]]);

beforeEach(() => {
  resetFake();
  h.published.length = 0;
});

describe("usualOpeningIn", () => {
  it("is the month and day in that year, and the last day when the month is short", () => {
    expect(usualOpeningIn(2027, 4, 10)).toBe("2027-04-10");
    expect(usualOpeningIn(2027, 2, 29)).toBe("2027-02-28");
    expect(usualOpeningIn(2028, 2, 29)).toBe("2028-02-29");
  });
});

describe("openingNudgesDue", () => {
  it("is due from a week before the usual date until the day before it", () => {
    expect(openingNudgesDue([NOV], byFramework, lastNov, "2027-11-02")).toEqual([]);
    expect(openingNudgesDue([NOV], byFramework, lastNov, "2027-11-03")).toEqual([
      { frameworkId: "fw-nov", frameworkName: "Competency review, November", clientName: "On Target", ownerPersonId: MAI, opensOn: "2027-11-10" },
    ]);
    expect(openingNudgesDue([NOV], byFramework, lastNov, "2027-11-09")).toHaveLength(1);
    expect(openingNudgesDue([NOV], byFramework, lastNov, "2027-11-10")).toEqual([]);
  });

  it("sends nothing for a framework without a usual date, or an archived one", () => {
    const noDate = { ...NOV, usualOpenMonth: null };
    const archived = { ...NOV, archived: true };
    expect(openingNudgesDue([noDate, archived], byFramework, lastNov, "2027-11-05")).toEqual([]);
  });

  it("sends nothing when this round's cycle was already opened early", () => {
    const early = new Map([["fw-nov", { ...lastNov, openedOn: "2027-10-20" }]]);
    expect(openingNudgesDue([NOV], early, lastNov, "2027-11-05")).toEqual([]);
  });

  it("tells whoever opened the latest client cycle about a framework never opened", () => {
    expect(openingNudgesDue([APR], byFramework, lastNov, "2027-04-05")).toEqual([
      { frameworkId: "fw-apr", frameworkName: "Competency review, April", clientName: "On Target", ownerPersonId: MAI, opensOn: "2027-04-10" },
    ]);
  });

  it("tells nobody when no client cycle was ever opened", () => {
    expect(openingNudgesDue([APR], new Map(), null, "2027-04-05")).toEqual([]);
  });

  it("finds an opening in early January from the last week of December", () => {
    const jan = { ...NOV, id: "fw-jan", usualOpenMonth: 1, usualOpenDay: 3 };
    expect(openingNudgesDue([jan], new Map(), lastNov, "2026-12-28")[0]?.opensOn).toBe("2027-01-03");
  });
});

describe("nudgeClientReviewOpenings", () => {
  const frameworks = [
    { id: "fw-nov", name: "Competency review, November", usual_open_month: 11, usual_open_day: 10, archived_at: null },
    { id: "fw-apr", name: "Competency review, April", usual_open_month: 4, usual_open_day: 10, archived_at: null },
  ];
  const cycles = [{ framework_id: "fw-nov", opened_by: MAI, opened_at: "2026-11-11T02:00:00Z", companies: { name: "On Target" } }];

  it("publishes one fact per framework due, naming where to open the next cycle", async () => {
    script("review_frameworks", { data: frameworks });
    script("review_cycles", { data: cycles });
    expect(await nudgeClientReviewOpenings("2027-04-04")).toBe(1);
    expect(h.published).toEqual([
      {
        name: "review.framework.opening_due",
        payload: {
          frameworkId: "fw-apr",
          frameworkName: "Competency review, April",
          clientName: "On Target",
          ownerPersonId: MAI,
          opensOn: "2027-04-10",
          newCyclePath: "/admin/talent/reviews/clients/new",
        },
      },
    ]);
  });

  it("counts but publishes nothing on a dry run", async () => {
    script("review_frameworks", { data: frameworks });
    script("review_cycles", { data: cycles });
    expect(await nudgeClientReviewOpenings("2027-04-04", { dryRun: true })).toBe(1);
    expect(h.published).toEqual([]);
  });

  it("reads no cycles when no framework has a usual date", async () => {
    script("review_frameworks", { data: [{ ...frameworks[0], usual_open_month: null }] });
    expect(await nudgeClientReviewOpenings("2027-11-05")).toBe(0);
    expect(calls.map((c) => c.table)).toEqual(["review_frameworks"]);
  });

  it("throws on a failed read rather than answering that nothing is due", async () => {
    script("review_frameworks", { error: { message: "read failed" } });
    await expect(nudgeClientReviewOpenings("2027-11-05")).rejects.toThrow(/read failed/);
  });
});
