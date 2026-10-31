import { describe, it, expect } from "vitest";
import { aggregateDeliveryCost, assignmentCoversMonth, type AssignmentRow, type BilledMix, type ContractorCostRow, type ExpenseCostRow, type TeamMemberRow } from "./delivery-cost";

// RF-3. The point of every case here is the same: a figure this module cannot
// support must arrive as "unmapped", never as zero cost, because zero cost is
// what turns an empty book into a 100% margin.

const MONTHS = ["2026-08", "2026-09"] as const;

const expense = (over: Partial<ExpenseCostRow> = {}): ExpenseCostRow => ({
  id: "e1",
  amount_cents: 100_00,
  currency: "usd",
  incurred_on: "2026-09-10",
  company_id: null,
  ...over,
});

const payment = (over: Partial<ContractorCostRow> = {}): ContractorCostRow => ({
  id: "p1",
  amount_cents: 900_00,
  currency: "usd",
  period_month: "2026-09-01",
  person_id: "person-a",
  ...over,
});

const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  team_member_id: "tm-a",
  company_id: "client-1",
  start_date: "2026-01-01",
  end_date: null,
  status: "active",
  ...over,
});

const TEAM: TeamMemberRow[] = [
  { id: "tm-a", person_id: "person-a" },
  { id: "tm-b", person_id: "person-b" },
];

const run = (
  expenses: ExpenseCostRow[] = [],
  payments: ContractorCostRow[] = [],
  assignments: AssignmentRow[] = [],
  billed: BilledMix[] = [],
) => aggregateDeliveryCost(expenses, payments, assignments, TEAM, MONTHS, billed);

describe("assignmentCoversMonth", () => {
  it("covers every month from its start when it has no end", () => {
    const a = assignment({ start_date: "2026-05-01", end_date: null });
    expect(assignmentCoversMonth(a, "2026-09")).toBe(true);
    expect(assignmentCoversMonth(a, "2026-04")).toBe(false);
  });

  it("covers the month it ends in, and not the one after", () => {
    const a = assignment({ start_date: "2026-01-01", end_date: "2026-08-15" });
    expect(assignmentCoversMonth(a, "2026-08")).toBe(true);
    expect(assignmentCoversMonth(a, "2026-09")).toBe(false);
  });

  it("covers the month it starts in even when it starts on the last day", () => {
    expect(assignmentCoversMonth(assignment({ start_date: "2026-09-30" }), "2026-09")).toBe(true);
  });

  it("claims nothing without a client, and nothing when cancelled", () => {
    expect(assignmentCoversMonth(assignment({ company_id: null }), "2026-09")).toBe(false);
    expect(assignmentCoversMonth(assignment({ status: "cancelled" }), "2026-09")).toBe(false);
  });
});

describe("aggregateDeliveryCost", () => {
  it("reports nothing, and no false zero, for an empty book", () => {
    const r = run();
    expect(r.byClient).toEqual([]);
    expect(r.mappedCents).toBe(0);
    expect(r.unmappedCents).toBe(0);
    expect(r.untaggedSpendCents).toBe(0);
    expect(r.gaps).toEqual({ untaggedExpenses: 0, unassignedPayments: 0, foreignCurrencyRows: 0 });
  });

  it("attributes a tagged expense to its client and calls an untagged one unclassified SPEND, not unmapped delivery cost", () => {
    // The distinction is the point: a contractor payment is delivery labour by
    // definition, so one that reaches no client is unmapped delivery cost. An
    // untagged expense might be overhead, and nothing on the row says which.
    const r = run([expense({ id: "e1", company_id: "client-1" }), expense({ id: "e2", company_id: null, amount_cents: 50_00 })]);
    expect(r.byClient).toEqual([{ companyId: "client-1", cents: 100_00 }]);
    expect(r.unmappedCents).toBe(0);
    expect(r.untaggedSpendCents).toBe(50_00);
    expect(r.gaps.untaggedExpenses).toBe(1);
  });

  it("ignores an expense outside the window", () => {
    const r = run([expense({ incurred_on: "2026-06-10", company_id: "client-1" })]);
    expect(r.mappedCents).toBe(0);
  });

  it("counts a foreign-currency row as a gap rather than adding wrong dollars", () => {
    const r = run([expense({ currency: "vnd", amount_cents: 9_000_000, company_id: "client-1" })]);
    expect(r.mappedCents).toBe(0);
    expect(r.unmappedCents).toBe(0);
    expect(r.untaggedSpendCents).toBe(0);
    expect(r.gaps.foreignCurrencyRows).toBe(1);
  });

  it("sends a contractor payment with no assignment that month to unmapped", () => {
    const r = run([], [payment()], []);
    expect(r.unmappedCents).toBe(900_00);
    expect(r.gaps.unassignedPayments).toBe(1);
    expect(r.byClient).toEqual([]);
  });

  it("splits a payment evenly between the clients that person served", () => {
    const r = run([], [payment()], [assignment({ company_id: "client-1" }), assignment({ company_id: "client-2" })]);
    expect(r.byClient).toEqual([
      { companyId: "client-1", cents: 450_00 },
      { companyId: "client-2", cents: 450_00 },
    ]);
    expect(r.unmappedCents).toBe(0);
  });

  it("splits an odd amount without losing or inventing a cent", () => {
    const r = run([], [payment({ amount_cents: 100 })], [assignment({ company_id: "client-1" }), assignment({ company_id: "client-2" }), assignment({ company_id: "client-3" })]);
    expect(r.byClient.reduce((a, c) => a + c.cents, 0)).toBe(100);
    expect(r.byClient.map((c) => c.cents).sort((a, b) => a - b)).toEqual([33, 33, 34]);
  });

  it("does not let an assignment that ended before the month claim the payment", () => {
    const r = run([], [payment()], [assignment({ company_id: "client-1", end_date: "2026-07-31" })]);
    expect(r.unmappedCents).toBe(900_00);
    expect(r.byClient).toEqual([]);
  });

  it("ignores an assignment belonging to a different person", () => {
    const r = run([], [payment({ person_id: "person-a" })], [assignment({ team_member_id: "tm-b", company_id: "client-2" })]);
    expect(r.unmappedCents).toBe(900_00);
  });

  it("splits a client's cost by the mix of what that client was billed", () => {
    const billed: BilledMix[] = [{ companyId: "client-1", recurringCents: 750_00, projectCents: 250_00 }];
    const r = run([expense({ company_id: "client-1", amount_cents: 400_00 })], [], [], billed);
    expect(r.byKind).toEqual({ recurring: 300_00, project: 100_00, unknown: 0 });
  });

  it("calls a client's cost unknown rather than halving it when nothing was billed", () => {
    const r = run([expense({ company_id: "client-1", amount_cents: 400_00 })], [], [], []);
    expect(r.byKind).toEqual({ recurring: 0, project: 0, unknown: 400_00 });
  });

  it("keeps the kind split summing to the mapped total", () => {
    const billed: BilledMix[] = [
      { companyId: "client-1", recurringCents: 1, projectCents: 2 },
      { companyId: "client-2", recurringCents: 7, projectCents: 3 },
    ];
    const r = run([expense({ id: "e1", company_id: "client-1", amount_cents: 101 }), expense({ id: "e2", company_id: "client-2", amount_cents: 99 })], [], [], billed);
    expect(r.byKind.recurring + r.byKind.project + r.byKind.unknown).toBe(r.mappedCents);
  });

  it("exposes no person on anything it returns", () => {
    const r = run([expense({ company_id: "client-1" })], [payment()], [assignment()]);
    const serialised = JSON.stringify(r);
    expect(serialised).not.toContain("person");
    expect(serialised).not.toContain("team_member");
  });
});
