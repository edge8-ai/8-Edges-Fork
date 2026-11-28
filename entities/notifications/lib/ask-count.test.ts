import { describe, expect, it, vi } from "vitest";

// TH.8. The count on the team sidebar's Inbox row says "someone is waiting on
// you", so it counts only what can make that true: asks from teammates
// (ASK_KINDS, never the routine's reminders) that the person has not marked
// done and whose link they may still open, which is what the page lists. An
// ask snoozed until tomorrow is not waiting now either (TH.8.3).

const kindsAsked: string[][] = [];
let asks: { id: string; team_href: string | null }[] = [];
let done: { notification_id: string }[] = [];
const settledFilters: string[] = [];
let failAsks = false;

vi.mock("@/kernel/data/supabase", () => {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in(column: string, values: string[]) {
        if (column === "kind") kindsAsked.push(values);
        return chain;
      },
      or: async (filter: string) => {
        settledFilters.push(filter);
        return { data: done, error: null };
      },
      order: () => chain,
      limit: async () => (failAsks ? { data: null, error: { message: "down" } } : { data: table === "notifications" ? asks : [], error: null }),
    };
    return chain;
  };
  return { companyOs: { from } };
});
vi.mock("@/kernel/identity/may-open", () => ({ recipientMayOpen: async () => (href: string) => !href.includes("secret") }));
// TH.11: the count adds the decisions the Inbox lists, from the approvals reader.
let decisions: unknown[] = [];
let failDecisions = false;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => ({ may: () => false, permissions: () => [], roles: [] }) }));
vi.mock("@/kernel/approvals/inbox", () => ({
  approvalsInbox: async () => {
    if (failDecisions) throw new Error("down");
    return decisions;
  },
}));

const { askCount, teamNavCounts } = await import("./nav-count");
const { ASK_KINDS } = await import("./kinds");

describe("askCount", () => {
  it("asks only for the kinds a teammate raises, never the due reminder", async () => {
    asks = [];
    kindsAsked.length = 0;
    await askCount("p1");
    expect(kindsAsked[0]).toEqual([...ASK_KINDS]);
    expect(kindsAsked[0]).not.toContain("card.due_tomorrow");
  });

  it("counts the asks not yet done whose link the person may open, as the page lists them", async () => {
    asks = [
      { id: "a1", team_href: "/team/inbox/?card=1" },
      { id: "a2", team_href: "/team/inbox/?card=2" },
      { id: "a3", team_href: "/team/secret/3" },
      { id: "a4", team_href: null },
    ];
    done = [{ notification_id: "a2" }];
    expect(await askCount("p1")).toBe(2);
    // Done or snoozed past now, both read in one filter.
    expect(settledFilters.at(-1)).toMatch(/^done_at\.not\.is\.null,snoozed_until\.gt\.\d{4}-\d{2}-\d{2}T/);
    expect(await teamNavCounts("p1")).toEqual({ "/team/inbox": 2 });
  });

  it("adds the decisions waiting on the person to the asks, and hides the count when they cannot be read (TH.11)", async () => {
    decisions = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
    expect(await teamNavCounts("p1")).toEqual({ "/team/inbox": 5 });
    failDecisions = true;
    expect(await teamNavCounts("p1")).toEqual({});
    failDecisions = false;
    decisions = [];
  });

  it("draws no count, rather than a wrong one, when the read fails", async () => {
    failAsks = true;
    expect(await askCount("p1")).toBeNull();
    expect(await teamNavCounts("p1")).toEqual({});
    failAsks = false;
  });
});
