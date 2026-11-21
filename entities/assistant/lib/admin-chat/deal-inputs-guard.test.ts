import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// R.23 on the assistant's write path: an approved UPDATE that names a deal's
// amount or close date runs inside a transaction that compares the deals before
// and after it, and is rolled back when a deal at Proposal or later lost one.
// The rule is crm's real forecastLossError; only the database is faked.

type Row = { id: string; stage_id: string; amount_cents: number | null; expected_close_date: string | null };
const STAGES = [
  { id: "disc", name: "Discovery", position: 1, is_won: false, is_lost: false },
  { id: "prop", name: "Proposal", position: 2, is_won: false, is_lost: false },
];
let snapshots: Row[][] = [];
const events: string[] = [];

const answer = (text: string) => {
  if (/from company_os\.pipeline_stages/.test(text)) return STAGES;
  if (/^select id, stage_id, amount_cents, expected_close_date/.test(text)) return snapshots.shift() ?? [];
  events.push("statement");
  return Object.assign([{ id: "d1" }], { count: 1 });
};
const tx = { unsafe: vi.fn(async (text: string) => answer(text)) };
const client = {
  unsafe: vi.fn(async (text: string) => answer(text)),
  begin: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
    try {
      const out = await fn(tx);
      events.push("commit");
      return out;
    } catch (e) {
      events.push("rollback");
      throw e;
    }
  }),
};
vi.mock("postgres", () => ({ default: vi.fn(() => client) }));

import { runApprovedWrite } from "./db";

beforeAll(() => {
  process.env.CHATBOT_WRITE_DB_URL = "postgres://writer@localhost:6543/db";
});
beforeEach(() => {
  snapshots = [];
  events.length = 0;
  vi.clearAllMocks();
});

const deal = (amount_cents: number | null, expected_close_date: string | null, stage_id = "prop"): Row => ({ id: "d1", stage_id, amount_cents, expected_close_date });

describe("runApprovedWrite on a deal's forecast inputs", () => {
  it("rolls back a statement that clears the amount of a deal at Proposal, and says why", async () => {
    snapshots = [[deal(500000, "2026-11-01")], [deal(null, "2026-11-01")]];
    expect(await runApprovedWrite("update company_os.deals set amount_cents = (select null) where id = 'd1'")).toEqual({
      ok: false,
      error: "A deal in Proposal keeps an amount, so the forecast can count it.",
    });
    expect(events).toEqual(["statement", "rollback"]);
  });

  it("catches the tuple form and a cleared close date", async () => {
    snapshots = [[deal(500000, "2026-11-01")], [deal(500000, null)]];
    const res = await runApprovedWrite("update company_os.deals set (title, expected_close_date) = ('Renewal', null) where id = 'd1'");
    expect(res).toEqual({ ok: false, error: "A deal in Proposal keeps an expected close date, so the forecast can count it." });
  });

  it("commits a statement that changes the amount to another value, or clears one before Proposal", async () => {
    snapshots = [[deal(500000, "2026-11-01")], [deal(900000, "2026-11-01")]];
    expect(await runApprovedWrite("update company_os.deals set amount_cents = 900000 where id = 'd1'")).toMatchObject({ ok: true, affectedRows: 1 });

    snapshots = [[deal(500000, "2026-11-01", "disc")], [deal(null, null, "disc")]];
    expect(await runApprovedWrite("update company_os.deals set amount_cents = null, expected_close_date = null where id = 'd1'")).toMatchObject({ ok: true });
    expect(events).toEqual(["statement", "commit", "statement", "commit"]);
  });

  it("runs a write that names neither input as before, with no transaction", async () => {
    expect(await runApprovedWrite("update company_os.deals set next_step = 'call' where amount_cents > 0 and id = 'd1'")).toMatchObject({ ok: true });
    expect(client.begin).not.toHaveBeenCalled();
    expect(events).toEqual(["statement"]);
  });
});
