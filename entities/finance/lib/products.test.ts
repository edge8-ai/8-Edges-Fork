import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { countUpcomingProducts, productPrices } from "./products";

// A.65: the queries crm's recurring forecast and company-os's products page
// built by hand around selectProducts before the card.
const q = (...steps: Query["steps"]): Query => ({ table: "products", steps });

const cases: [string, () => Promise<unknown>, Query][] = [
  ["productPrices", () => productPrices(), q(["select", "id, amount_cents, amount_usd_cents, currency"], ["limit", 5000])],
  [
    "countUpcomingProducts",
    () => countUpcomingProducts("2026-10-18T00:00:00.000Z"),
    q(["select", "*", { count: "exact", head: true }], ["eq", "active", true], ["gte", "date_start", "2026-10-18T00:00:00.000Z"]),
  ],
];

beforeEach(() => resetQueries());

describe("finance's product questions make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });
});
