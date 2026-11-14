import { describe, expect, it } from "vitest";
import { accountOf, ADVANCE_TABS, closedAheadOfClaim, isAdvanceTab, previousMonth, queueFigures, tabOf } from "./advance-books";
import { ADVANCE_STATUSES } from "./advance-rules";
import { outstandingOf } from "./settlement-rules";

const out = (amountVnd: number) => ({ direction: "out" as const, amountVnd, transferredOn: "2026-11-04" });
const back = (amountVnd: number, transferredOn = "2026-11-20") => ({ direction: "in" as const, amountVnd, transferredOn });

describe("tabOf", () => {
  it("puts every status under a tab that exists, so nothing goes missing from the queue", () => {
    for (const status of ADVANCE_STATUSES) {
      expect(ADVANCE_TABS.map((t) => t.key)).toContain(tabOf({ status, claimStatus: null }));
    }
  });

  it("sends each to where Finance would look for it", () => {
    expect(tabOf({ status: "approved", claimStatus: null })).toBe("pay");
    expect(tabOf({ status: "paid_out", claimStatus: null })).toBe("out");
    expect(tabOf({ status: "to_return", claimStatus: null })).toBe("back");
    expect(tabOf({ status: "sent_back", claimStatus: null })).toBe("before");
    expect(tabOf({ status: "submitted", claimStatus: null })).toBe("before");
    expect(tabOf({ status: "draft", claimStatus: null })).toBe("before");
    expect(tabOf({ status: "settled", claimStatus: "settled" })).toBe("closed");
    expect(tabOf({ status: "rejected", claimStatus: null })).toBe("closed");
    expect(tabOf({ status: "cancelled", claimStatus: null })).toBe("closed");
  });

  it("moves a held advance to the settlements while its claim is being checked, and back if it is sent back", () => {
    expect(tabOf({ status: "paid_out", claimStatus: "submitted" })).toBe("settle");
    expect(tabOf({ status: "paid_out", claimStatus: "checked" })).toBe("settle");
    expect(tabOf({ status: "paid_out", claimStatus: "sent_back" })).toBe("out");
  });
});

describe("isAdvanceTab", () => {
  it("knows only the tabs there are", () => {
    expect(isAdvanceTab("pay")).toBe(true);
    expect(isAdvanceTab("everything")).toBe(false);
    expect(isAdvanceTab(undefined)).toBe(false);
    expect(isAdvanceTab(["pay"])).toBe(false);
  });
});

describe("queueFigures", () => {
  const base = { amountVnd: 8_000_000, balanceVnd: null, returnedVnd: 0, claimStatus: null, settleBy: null };

  it("adds up what to transfer, what people hold and what is coming back", () => {
    expect(
      queueFigures(
        [
          { ...base, status: "approved" },
          { ...base, status: "paid_out", amountVnd: 5_000_000, settleBy: "2026-12-01" },
          { ...base, status: "to_return", balanceVnd: -1_000_000, returnedVnd: 400_000 },
          { ...base, status: "submitted" },
          { ...base, status: "settled", balanceVnd: 0 },
        ],
        "2026-11-05",
      ),
    ).toEqual({ toTransferVnd: 8_000_000, withPeopleVnd: 5_600_000, comingBackVnd: 600_000, overdue: 0 });
  });

  it("does not count one Finance put back as still to transfer: the money has gone", () => {
    const waiting = { ...base, status: "approved" as const };
    expect(queueFigures([waiting, { ...waiting, putBack: true }], "2026-11-05").toTransferVnd).toBe(waiting.amountVnd);
  });

  it("counts money still owed back past its date", () => {
    const late = { ...base, status: "to_return" as const, balanceVnd: -1_000_000, returnedVnd: 0, settleBy: "2026-11-01" };
    expect(queueFigures([late], "2026-11-05").overdue).toBe(1);
  });

  it("counts one held past its date, and not one whose settlement is being checked", () => {
    const late = { ...base, status: "paid_out" as const, settleBy: "2026-11-01" };
    expect(queueFigures([late, { ...late, claimStatus: "submitted" }], "2026-11-05").overdue).toBe(1);
  });
});

describe("previousMonth", () => {
  it("steps back a month, and over a new year", () => {
    expect(previousMonth("2026-11-05")).toBe("2026-10");
    expect(previousMonth("2027-01-31")).toBe("2026-12");
  });
});

describe("closedAheadOfClaim", () => {
  it("flags an advance closed by a claim that never landed", () => {
    expect(closedAheadOfClaim({ status: "settled", spentVnd: 8_000_000, claimStatus: "checked" })).toBe(true);
    expect(closedAheadOfClaim({ status: "to_return", spentVnd: 7_000_000, claimStatus: "checked" })).toBe(true);
  });

  it.each(["approved", "settled", "in_run", "paid"])("leaves one whose claim is %s alone", (claimStatus) => {
    expect(closedAheadOfClaim({ status: "settled", spentVnd: 8_000_000, claimStatus })).toBe(false);
  });

  it("leaves one returned unspent alone: it has no claim", () => {
    expect(closedAheadOfClaim({ status: "to_return", spentVnd: 0, claimStatus: null })).toBe(false);
  });

  it("leaves one still being settled alone", () => {
    expect(closedAheadOfClaim({ status: "paid_out", spentVnd: null, claimStatus: "submitted" })).toBe(false);
  });
});

describe("accountOf", () => {
  it("is empty before money moves", () => {
    expect(accountOf({ amountVnd: 8_000_000, spentVnd: null, closedOn: null, transfers: [] })).toEqual({ entries: [], balanceVnd: 0 });
  });

  it("holds the whole amount once paid out", () => {
    const { entries, balanceVnd } = accountOf({ amountVnd: 8_000_000, spentVnd: null, closedOn: null, transfers: [out(8_000_000)] });
    expect(balanceVnd).toBe(8_000_000);
    expect(entries).toEqual([{ on: "2026-11-04", what: "Payout · Nợ 141 / Có 112", debitVnd: 8_000_000, creditVnd: null }]);
  });

  // The promise that matters: the account's balance and what the rules say is owed agree,
  // however it ended, including short returns and spending more than was advanced.
  it.each([
    { spent: 8_000_000, returns: [], left: 0, why: "spent exactly" },
    { spent: 11_000_000, returns: [], left: 0, why: "spent more: the difference is a claim, not this account" },
    { spent: 7_000_000, returns: [], left: 1_000_000, why: "spent less, nothing back yet" },
    { spent: 7_000_000, returns: [400_000], left: 600_000, why: "spent less, part back" },
    { spent: 7_000_000, returns: [400_000, 600_000], left: 0, why: "spent less, all back" },
    { spent: 0, returns: [], left: 8_000_000, why: "spent none of it" },
  ])("ends on $left when $why", ({ spent, returns, left }) => {
    const { balanceVnd } = accountOf({ amountVnd: 8_000_000, spentVnd: spent, closedOn: "2026-11-16", transfers: [out(8_000_000), ...returns.map((r) => back(r))] });
    expect(balanceVnd).toBe(left);
    const returned = returns.reduce((sum, r) => sum + r, 0);
    expect(balanceVnd).toBe(outstandingOf(spent - 8_000_000, returned));
  });

  it("lists the payout, then the settlement, then each return, whatever order the rows came in", () => {
    const { entries } = accountOf({ amountVnd: 8_000_000, spentVnd: 7_000_000, closedOn: "2026-11-16", transfers: [back(400_000), out(8_000_000)] });
    expect(entries.map((e) => e.what)).toEqual(["Payout · Nợ 141 / Có 112", "Settlement · receipts kept", "Returned by transfer · Nợ 112 / Có 141"]);
  });

  it("says nothing was spent, and shows no date rather than a guessed one when the close's history is lost", () => {
    const { entries } = accountOf({ amountVnd: 8_000_000, spentVnd: 0, closedOn: null, transfers: [out(8_000_000)] });
    expect(entries[1]).toEqual({ on: null, what: "Nothing spent", debitVnd: null, creditVnd: 0 });
  });
});
