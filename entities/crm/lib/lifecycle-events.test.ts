import { beforeEach, describe, expect, it, vi } from "vitest";

// What a won deal says on the bus (S.2). The cases worth pinning are the two
// half-written rows — a win whose FX lookup failed, and one whose close stamp
// never landed — because both typecheck and both would reach a subscriber that
// stores them.

const published: [string, unknown][] = [];
vi.mock("@/kernel/events", () => ({
  publish: async (name: string, payload: unknown) => {
    published.push([name, payload]);
  },
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => undefined } }));
vi.mock("@/kernel/identity/writes", () => ({ updateCompanies: () => undefined }));
vi.mock("@/entities/contacts", () => ({ selectPersonCompanies: () => undefined }));
vi.mock("./reads", () => ({ selectDeals: () => undefined, selectLead: () => undefined }));
vi.mock("./writes", () => ({ upsertLead: () => undefined, insertLifecycleTransitions: () => undefined }));

import { announceDealWon, becomesWon, dealWonFact } from "./lifecycle";

const row = {
  id: "deal-1",
  company_id: "co-1",
  person_id: "person-1",
  amount_usd_cents: 1_200_000,
  closed_at: "2026-09-22T04:00:00.000Z",
};

beforeEach(() => {
  published.length = 0;
});

describe("dealWonFact", () => {
  it("states the win with the account, the person and the amount in USD cents", () => {
    expect(dealWonFact(row)).toEqual({
      dealId: "deal-1",
      companyId: "co-1",
      personId: "person-1",
      amountUsdCents: 1_200_000,
      closedAt: "2026-09-22T04:00:00.000Z",
    });
  });

  it("announces no amount when the FX conversion did not land", () => {
    // The database leaves the USD column empty for a currency with no cached
    // rate (deals_derive_usd, R.24), so a won deal can reach here with the
    // figure still in its own currency and no USD value.
    expect(dealWonFact({ ...row, amount_usd_cents: null })?.amountUsdCents).toBeNull();
    expect(dealWonFact({ ...row, amount_usd_cents: 1200.5 })?.amountUsdCents).toBeNull();
  });

  it("carries a win nobody has mapped to an account", () => {
    const fact = dealWonFact({ ...row, company_id: null, person_id: null });
    expect(fact).toMatchObject({ companyId: null, personId: null });
  });

  it("says nothing about a win with no close stamp, or a row that came back empty", () => {
    expect(dealWonFact({ ...row, closed_at: null })).toBeNull();
    expect(dealWonFact(null)).toBeNull();
  });
});

describe("becomesWon", () => {
  const open = { id: "s-open", is_won: false };
  const won = { id: "s-won", is_won: true };
  const wonAgain = { id: "s-won-2", is_won: true };
  const board = [open, won, wonAgain];

  it("is a win when the deal comes from a stage that had not won it", () => {
    // Which is also the reopened-then-won-again case: a deal that genuinely
    // left the won stage and came back was won a second time, and delivery
    // starts again. Only a deal that never left is not a new win.
    expect(becomesWon(won, "s-open", board)).toBe(true);
  });

  it("is not a win when the deal is re-saved into the stage it already sits in", () => {
    expect(becomesWon(won, "s-won", board)).toBe(false);
  });

  it("is not a win when the deal moves between two won stages", () => {
    expect(becomesWon(wonAgain, "s-won", board)).toBe(false);
  });

  it("is not a win when the destination has not won anything", () => {
    expect(becomesWon(open, "s-won", board)).toBe(false);
  });

  it("is a win for a deal that carried no stage at all", () => {
    expect(becomesWon(won, null, board)).toBe(true);
  });

  it("is a win when the stage it came from is no longer on the board", () => {
    // Unresolvable counts as not-won on purpose. A duplicate reaches idempotent
    // subscribers; a swallowed win is a delivery board that never opens.
    expect(becomesWon(won, "s-deleted", board)).toBe(true);
    expect(becomesWon(won, "s-open", [])).toBe(true);
  });
});

describe("announceDealWon", () => {
  it("publishes the fact", async () => {
    await announceDealWon(row);
    expect(published).toEqual([["deal.won", dealWonFact(row)]]);
  });

  it("publishes nothing when there is no fact to state", async () => {
    await announceDealWon(null);
    expect(published).toEqual([]);
  });
});
