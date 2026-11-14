import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Account 141. The card's promise: each row balances against the ledger, and the test compares
// the file with the ledger. So every ending below is added up from the file's own rows and
// compared with what the advance's page would say.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { accountOf } from "./advance-books";
import { account141Csv, account141Rows, readAdvancesForExport, type ExportAdvance } from "./advance-export";

const advance = (over: Partial<ExportAdvance> = {}): ExportAdvance => ({
  id: "advance-1",
  refNo: 7,
  personId: "person-a",
  person: "Avery Example",
  kind: "employee",
  purpose: "Venue",
  amountVnd: 8_000_000,
  spentVnd: null,
  closedOn: null,
  claimId: null,
  transfers: [{ direction: "out", amountVnd: 8_000_000, transferredOn: "2026-11-04" }],
  ...over,
});
const back = (amountVnd: number, transferredOn = "2026-11-20") => ({ direction: "in" as const, amountVnd, transferredOn });
const closed = (spentVnd: number, more: Partial<ExportAdvance> = {}) => advance({ spentVnd, closedOn: "2026-11-16", claimId: "claim-1", ...more });
const entries = (rows: ReturnType<typeof account141Rows>) => rows.map((r) => r.Entry);
const closing = (rows: ReturnType<typeof account141Rows>) => rows.filter((r) => r.Entry === "Closing balance").map((r) => r["Balance 141"]);

describe("a month's rows, compared with the ledger", () => {
  it.each([
    { why: "held", a: advance(), left: 8_000_000 },
    { why: "spent exactly", a: closed(8_000_000), left: 0 },
    { why: "spent more: the difference is a claim, not 141", a: closed(8_720_000), left: 0 },
    { why: "spent less, nothing back", a: closed(7_360_000), left: 640_000 },
    { why: "spent less, part back", a: closed(7_360_000, { transfers: [advance().transfers[0], back(400_000)] }), left: 240_000 },
    { why: "spent less, all back", a: closed(7_360_000, { transfers: [advance().transfers[0], back(400_000), back(240_000, "2026-11-21")] }), left: 0 },
    { why: "spent none, all back", a: closed(0, { claimId: null, transfers: [advance().transfers[0], back(8_000_000)] }), left: 0 },
  ])("ends on the account's own balance when $why", ({ a, left }) => {
    const rows = account141Rows([a], "2026-11");
    expect(closing(rows)).toEqual([left]);
    expect(accountOf(a).balanceVnd).toBe(left);
    // Each row's balance is the one before it, plus its debit, less its credit.
    let running = 0;
    for (const r of rows) {
      if (r.Entry === "Closing balance") continue;
      running = r.Entry === "Opening balance" ? Number(r["Balance 141"]) : running + Number(r["Debit 141"] || 0) - Number(r["Credit 141"] || 0);
      expect(r["Balance 141"]).toBe(running);
    }
  });
});

describe("what each event says", () => {
  it("names the accounts as columns, for the payout, the settlement and the return", () => {
    const rows = account141Rows([closed(7_360_000, { transfers: [advance().transfers[0], back(640_000)] })], "2026-11");
    expect(rows[1]).toMatchObject({ Entry: "Payout", "Debit account": "141", "Credit account": "112", "Debit 141": 8_000_000, Advance: "ADV-0007", Kind: "employee" });
    expect(rows[2]).toMatchObject({ Entry: "Settlement", "Debit account": "Expense", "Credit account": "141", "Credit 141": 7_360_000, Claim: "claim-1" });
    expect(rows[3]).toMatchObject({ Entry: "Returned by transfer", "Debit account": "112", "Credit account": "141", "Credit 141": 640_000 });
  });

  it("shows the company's difference as spend paid by the run, moving nothing on 141", () => {
    const rows = account141Rows([closed(8_720_000)], "2026-11");
    expect(rows[2]).toMatchObject({ "Credit 141": 8_000_000, Amount: 8_000_000 });
    expect(rows[3]).toMatchObject({ Entry: "Difference, paid by the run", Amount: 720_000, "Debit 141": "", "Credit 141": "", "Credit account": "Payable", Claim: "claim-1" });
    expect(closing(rows)).toEqual([0]);
  });

  it("carries a contractor's kind, so Finance can book it elsewhere", () => {
    expect(account141Rows([advance({ kind: "contractor" })], "2026-11")[0].Kind).toBe("contractor");
  });
});

describe("the month", () => {
  const twoMonths = closed(7_360_000, { closedOn: "2026-12-02", transfers: [advance().transfers[0], back(640_000, "2026-12-10")] });

  it("opens on what they held coming in, and leaves earlier events out", () => {
    const rows = account141Rows([twoMonths], "2026-12");
    expect(rows[0]).toMatchObject({ Entry: "Opening balance", "Balance 141": 8_000_000 });
    expect(entries(rows)).toEqual(["Opening balance", "Settlement", "Returned by transfer", "Closing balance"]);
    expect(closing(rows)).toEqual([0]);
  });

  it("leaves later events out too, so a past month's file never changes", () => {
    const rows = account141Rows([twoMonths], "2026-11");
    expect(entries(rows)).toEqual(["Opening balance", "Payout", "Closing balance"]);
    expect(closing(rows)).toEqual([8_000_000]);
  });

  it("still shows someone holding money in a month nothing happened", () => {
    const rows = account141Rows([advance()], "2026-12");
    expect(entries(rows)).toEqual(["Opening balance", "Closing balance"]);
    expect(closing(rows)).toEqual([8_000_000]);
  });

  it("leaves out someone with nothing in the month and nothing held", () => {
    expect(account141Rows([closed(8_000_000)], "2026-12")).toEqual([]);
    expect(account141Rows([advance()], "2026-10")).toEqual([]);
  });

  it("keeps a close with no date in the file, on the payout's date, and says so", () => {
    const rows = account141Rows([advance({ spentVnd: 8_000_000, closedOn: null })], "2026-11");
    expect(entries(rows)).toContain("Settlement (date from the payout: the close's history is missing)");
    expect(closing(rows)).toEqual([0]);
  });
});

describe("people", () => {
  it("groups each person's advances, adds them up, and sorts by name", () => {
    const earlier = closed(8_000_000, { id: "advance-0", refNo: 3 });
    const other = advance({ id: "advance-2", refNo: 9, personId: "person-b", person: "Blair Example" });
    const rows = account141Rows([other, earlier, advance({ id: "advance-1", transfers: [{ direction: "out", amountVnd: 8_000_000, transferredOn: "2026-11-18" }] })], "2026-11");
    expect([...new Set(rows.map((r) => r.Person))]).toEqual(["Avery Example", "Blair Example"]);
    expect(closing(rows)).toEqual([8_000_000, 8_000_000]);
  });
});

describe("account141Csv", () => {
  it("writes a file, its columns in the order a person reads them", () => {
    const [head] = account141Csv([advance()], "2026-11").split("\r\n");
    expect(head).toBe("Person,Kind,Advance,Purpose,Date,Entry,Debit account,Credit account,Amount,Debit 141,Credit 141,Balance 141,Claim");
    expect(account141Csv([advance()], "2026-11")).toContain("Avery Example");
    expect(account141Csv([], "2026-11")).toBe("");
  });
});

describe("readAdvancesForExport", () => {
  const raw = { id: "advance-1", ref_no: 7, person_id: "person-a", team_member_id: "member-a", purpose: "Venue", amount_vnd: 8_000_000, spent_vnd: 7_360_000, settled_claim_id: "claim-1", person: { display_name: "Avery Example" } };

  beforeEach(() => resetFake());

  it("reads the ledger, the close's date in Vietnam and the person's kind", async () => {
    script("reimbursement_advances", { data: [raw] });
    script("reimbursement_advance_transfers", { data: [{ advance_id: "advance-1", direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-11-04" }] });
    script("reimbursement_advance_events", { data: [{ advance_id: "advance-1", created_at: "2026-11-15T20:00:00Z" }] });
    script("team_members", { data: [{ id: "member-a", employment_type: "contractor" }] });
    const [a] = await readAdvancesForExport();
    // 20:00 UTC on the 15th is already the 16th in Vietnam.
    expect(a).toMatchObject({ person: "Avery Example", kind: "contractor", closedOn: "2026-11-16", spentVnd: 7_360_000, claimId: "claim-1", transfers: [{ direction: "out", amountVnd: 8_000_000 }] });
  });

  it("answers empty with no advance ever paid out, without asking for more", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readAdvancesForExport()).toEqual([]);
  });

  it.each(["reimbursement_advances", "reimbursement_advance_transfers", "reimbursement_advance_events", "team_members"])("raises when %s cannot be read, rather than writing a file with a gap", async (failing) => {
    for (const table of ["reimbursement_advances", "reimbursement_advance_transfers", "reimbursement_advance_events", "team_members"]) {
      if (table === failing) script(table, { data: null, error: { message: "down" } });
      else script(table, { data: table === "reimbursement_advances" ? [raw] : [] });
    }
    await expect(readAdvancesForExport()).rejects.toThrow("down");
  });
});
