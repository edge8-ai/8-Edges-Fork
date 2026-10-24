import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  compensationHistoryOf,
  currentBillableRate,
  currentContractorRates,
  currentPayRates,
  ownCurrentPayRates,
  recordSalaryChange,
  replaceContractorRates,
  salaryHistory,
} from "./compensation";

// A.65: each question or command is the query its caller used to build by
// hand around selectCompensationSensitive / updateCompensationSensitive /
// insertCompensationSensitive. Compensation is the most sensitive table
// finance owns, so the select of every question here is exactly its caller's
// column list from before the card, never a union (H1-DESIGN rule 7); a row
// that fails here because a column was added is the test doing its job.
const q = (...steps: Query["steps"]): Query => ({ table: "compensation_sensitive", steps });
const NOW = "2026-10-18T03:00:00.000Z";
const RATE_COLUMNS = "team_member_id, comp_type, amount_cents, currency";

const cases: [string, () => Promise<unknown>, Query[]][] = [
  // company-os client-invoicing.ts billableRateCents
  [
    "currentBillableRate",
    () => currentBillableRate("tm-1"),
    [q(["select", "amount_cents"], ["eq", "team_member_id", "tm-1"], ["eq", "comp_type", "billable"], ["eq", "is_current", true], ["maybeSingle"])],
  ],
  // company-os lib/contractor-payments.ts rollup: hourly and overtime only
  [
    "currentPayRates",
    () => currentPayRates(["tm-1", "tm-2"]),
    [q(["select", RATE_COLUMNS], ["in", "team_member_id", ["tm-1", "tm-2"]], ["in", "comp_type", ["hourly", "overtime"]], ["eq", "is_current", true])],
  ],
  // company-os contractors/data.ts roster: billable as well
  [
    "currentContractorRates",
    () => currentContractorRates(["tm-1"]),
    [q(["select", RATE_COLUMNS], ["in", "team_member_id", ["tm-1"]], ["in", "comp_type", ["hourly", "overtime", "billable"]], ["eq", "is_current", true])],
  ],
  // portal lib/my-contractor-work.ts: the contractor's own, without the id column
  [
    "ownCurrentPayRates",
    () => ownCurrentPayRates("tm-1"),
    [q(["select", "comp_type, amount_cents, currency"], ["eq", "team_member_id", "tm-1"], ["eq", "is_current", true], ["in", "comp_type", ["hourly", "overtime"]])],
  ],
  // org lib/compensation.ts getSalaryHistory
  [
    "salaryHistory",
    () => salaryHistory("tm-1"),
    [
      q(
        ["select", "id, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason, created_at"],
        ["eq", "team_member_id", "tm-1"],
        ["eq", "comp_type", "base_salary"],
        ["order", "effective_from", { ascending: false }],
        ["order", "created_at", { ascending: false }],
      ),
    ],
  ],
  // team chat my-records-tools.ts myPay
  [
    "compensationHistoryOf",
    () => compensationHistoryOf("tm-1"),
    [
      q(
        [
          "select",
          "team_member_id, comp_type, pay_period, amount_cents, currency, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason",
        ],
        ["eq", "team_member_id", "tm-1"],
        ["order", "effective_from", { ascending: false }],
      ),
    ],
  ],
  // company-os contractors/actions.ts updateContractorRates: close, then insert the set
  [
    "replaceContractorRates",
    () =>
      replaceContractorRates("tm-1", {
        hourlyCents: 1500,
        overtimeCents: 2250,
        billableCents: 3000,
        currency: "vnd",
        effectiveFrom: "2026-10-18",
        reason: "Rate update via admin",
      }),
    [
      q(
        ["update", { is_current: false, effective_to: "2026-10-18", updated_at: NOW }],
        ["eq", "team_member_id", "tm-1"],
        ["in", "comp_type", ["hourly", "overtime", "billable"]],
        ["eq", "is_current", true],
      ),
      q([
        "insert",
        [
          { comp_type: "hourly", amount_cents: 1500, currency: "vnd" },
          { comp_type: "overtime", amount_cents: 2250, currency: "vnd" },
          { comp_type: "billable", amount_cents: 3000, currency: "usd" },
        ].map((r) => ({
          team_member_id: "tm-1",
          ...r,
          pay_period: "hourly",
          effective_from: "2026-10-18",
          is_current: true,
          change_reason: "Rate update via admin",
        })),
      ]),
    ],
  ],
  // org lib/compensation.ts saveSalaryChange: close, then insert the new salary
  [
    "recordSalaryChange",
    () => recordSalaryChange("tm-1", { salaryVnd: 25_500_000, salaryUsdCents: 100_000, effectiveFrom: "2026-11-01", changeReason: "Annual review" }),
    [
      q(
        ["update", { is_current: false, effective_to: "2026-11-01", updated_at: NOW }],
        ["eq", "team_member_id", "tm-1"],
        ["eq", "comp_type", "base_salary"],
        ["eq", "is_current", true],
      ),
      q(
        [
          "insert",
          {
            team_member_id: "tm-1",
            comp_type: "base_salary",
            pay_period: "monthly",
            amount_cents: 100_000,
            currency: "usd",
            salary_vnd: 25_500_000,
            salary_usd_cents: 100_000,
            effective_from: "2026-11-01",
            is_current: true,
            change_reason: "Annual review",
          },
        ],
        ["select", "id"],
        ["single"],
      ),
    ],
  ],
];

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("finance's compensation questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    answerNext({ data: [], error: null }, { data: { id: "comp-9" }, error: null });
    await ask();
    expect(queries).toEqual(expected);
  });

  it("answers the new salary row's id", async () => {
    answerNext({ data: null, error: null }, { data: { id: "comp-9" }, error: null });
    expect(await recordSalaryChange("tm-1", { salaryVnd: 1, salaryUsdCents: 1, effectiveFrom: "2026-11-01" })).toEqual({ ok: true, id: "comp-9" });
  });

  it("stops before inserting when closing the current rows fails, as the callers did", async () => {
    answerNext({ data: null, error: { message: "close refused" } });
    const rates = { hourlyCents: 1, overtimeCents: 1, billableCents: 1, currency: "usd", effectiveFrom: "2026-10-18", reason: "x" };
    expect(await replaceContractorRates("tm-1", rates)).toEqual({ ok: false, error: "close refused" });
    expect(queries).toHaveLength(1);
  });
});
