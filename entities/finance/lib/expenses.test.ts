import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { expensesBetween, expensesSince } from "./expenses";

// A.65: the queries crm's runway and the team assistant's company totals
// built by hand around selectExpenses before the card.
const q = (...steps: Query["steps"]): Query => ({ table: "expenses", steps });

const cases: [string, () => Promise<unknown>, Query][] = [
  [
    "expensesSince",
    () => expensesSince("2026-04-01"),
    q(["select", "id, amount_cents, currency, incurred_on"], ["gte", "incurred_on", "2026-04-01"], ["limit", 20000]),
  ],
  [
    "expensesBetween",
    () => expensesBetween("2026-10-01", "2026-10-31"),
    q(["select", "amount_cents, currency"], ["gte", "incurred_on", "2026-10-01"], ["lte", "incurred_on", "2026-10-31"]),
  ],
];

beforeEach(() => resetQueries());

describe("finance's expense questions make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });
});
