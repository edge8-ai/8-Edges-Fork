import { beforeEach, describe, expect, it, vi } from "vitest";

// Each named query is pinned against the chain it replaced, verbatim.
//
// A named query moves a column list, a cap and a cast out of five callers, and
// the way that refactor goes wrong is silently: a column dropped on the way
// over still typechecks and still returns rows, just without the field. This
// file is the same check `audit:parity` makes on a door read, written down so
// it runs on every build rather than only when someone remembers the audit.

const calls: { columns: string; limit: number | null }[] = [];

vi.mock("@/entities/crm/lib/reads", () => ({
  selectDeals: (columns: string) => {
    const call = { columns, limit: null as number | null };
    calls.push(call);
    const builder = { limit: (n: number) => { call.limit = n; return builder; } };
    return builder;
  },
}));

const { DEAL_CAP, dealsForBilling, dealsForDataHealth, dealsForDemand, dealsForOverview, dealsForPipeline } =
  await import("./deals");

// The five strings that were written out by hand in the five loaders, as they
// stood at origin/main before A.5. Not regenerated — copied. One deliberate
// change since: S.16 widened overview's people embed with display_name and
// preferred_name, so the deal's contact is named by personName().
const BEFORE = {
  billing:
    "id, title, status, stage_id, amount_usd_cents, amount_cents, currency, probability, closed_at, expected_close_date, archived_at",
  dataHealth:
    "id, stage_id, status, amount_cents, amount_usd_cents, currency, source, campaign_id, company_id, next_step, next_step_date, expected_close_date, updated_at, archived_at",
  demand: "id, source, campaign_id, status, amount_usd_cents, amount_cents, currency, archived_at",
  pipeline:
    "id, stage_id, status, amount_usd_cents, amount_cents, currency, probability, source, created_at, closed_at, expected_close_date, lost_reason, archived_at",
  overview:
    "id, title, stage_id, status, amount_cents, amount_usd_cents, currency, probability, owner_id, next_step, next_step_date, expected_close_date, created_at, closed_at, archived_at, companies!company_id(name), people!person_id(display_name, preferred_name, full_name, email)",
};

beforeEach(() => {
  calls.length = 0;
});

describe("the Revenue hub's named deal queries", () => {
  const cases = [
    ["billing", dealsForBilling, BEFORE.billing],
    ["dataHealth", dealsForDataHealth, BEFORE.dataHealth],
    ["demand", dealsForDemand, BEFORE.demand],
    ["pipeline", dealsForPipeline, BEFORE.pipeline],
    ["overview", dealsForOverview, BEFORE.overview],
  ] as const;

  for (const [name, query, before] of cases) {
    it(`${name} asks for exactly the columns its loader asked for`, () => {
      query();
      expect(calls).toHaveLength(1);
      expect(calls[0].columns).toBe(before);
    });

    it(`${name} caps the read where its loader capped it`, () => {
      query();
      expect(calls[0].limit).toBe(DEAL_CAP);
    });
  }

  it("caps every query at the same number, which is why the number has a name", () => {
    expect(DEAL_CAP).toBe(5000);
    for (const [, query] of cases) query();
    expect(new Set(calls.map((c) => c.limit))).toEqual(new Set([DEAL_CAP]));
  });

  it("adds no filter or ordering, because none of the five had one", () => {
    // The tabs aggregate over the whole book; a filter here would change a
    // total, and `.order` on an unbounded read would only cost time.
    const builder = dealsForBilling() as unknown as Record<string, unknown>;
    expect(Object.keys(builder)).toEqual(["limit"]);
  });
});
