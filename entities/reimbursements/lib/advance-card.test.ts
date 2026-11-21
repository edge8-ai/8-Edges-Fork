import { describe, expect, it } from "vitest";
import { alertOf, heroOf, owedOf, ringOf, stagesOf, type AdvanceFacts } from "./advance-card";
import { ADVANCE_STATUSES } from "./advance-rules";

const TODAY = "2026-11-04";
const facts = (over: Partial<AdvanceFacts> = {}): AdvanceFacts => ({
  status: "draft",
  amountVnd: 8_000_000,
  settleBy: null,
  spentVnd: null,
  balanceVnd: null,
  returnedVnd: 0,
  claimStatus: null,
  reason: null,
  returnReported: false,
  paidTo: "Techcombank · •••• 4821",
  paidOutOn: null,
  approver: "the approver",
  ...over,
});
const sent = { status: "paid_out" as const, settleBy: "2026-11-30", paidOutOn: "2026-11-04" };

describe("every status has its words", () => {
  for (const status of ADVANCE_STATUSES) {
    it(status, () => {
      const f = facts({ status, settleBy: "2026-11-30", spentVnd: 8_000_000, balanceVnd: 0 });
      expect(heroOf(f, TODAY).figure).toMatch(/\S/);
      expect(heroOf(f, TODAY).line).toMatch(/\S/);
      expect(alertOf(f, TODAY).head).toMatch(/\S/);
      expect(stagesOf(f, { askedOn: null, approvedBy: null, sentOn: null })).toHaveLength(5);
    });
  }
});

describe("heroOf", () => {
  it("names the approver, and the reason when it is sent back", () => {
    expect(heroOf(facts({ status: "submitted", approver: "Avery" }), TODAY).line).toContain("Avery");
    expect(heroOf(facts({ status: "sent_back", approver: "Avery", reason: "The quote is smaller." }), TODAY).line).toBe("Avery sent it back: The quote is smaller.");
  });

  it("says where the money went, masked", () => {
    expect(heroOf(facts(sent), TODAY).line).toContain("Techcombank · •••• 4821");
  });

  it("changes when a settlement is being checked, and when the date has passed", () => {
    expect(heroOf(facts({ ...sent, claimStatus: "submitted" }), TODAY).line).toContain("checking your receipts");
    expect(heroOf(facts(sent), "2026-12-01").line).toContain("taxed as your income");
    expect(heroOf(facts({ ...sent, claimStatus: "checked" }), "2026-12-01").line).toContain("checking your receipts");
  });

  it("shows what is still owed, not what was advanced", () => {
    const owing = facts({ status: "to_return", spentVnd: 7_360_000, balanceVnd: -640_000, returnedVnd: 400_000 });
    expect(heroOf(owing, TODAY).figure).toContain("240,000");
    expect(heroOf({ ...owing, returnReported: true }, TODAY).line).toContain("on its way");
  });

  it("says it is overdue while money is owed back past the date, unless they said it is on its way", () => {
    const late = facts({ status: "to_return", settleBy: "2026-11-30", spentVnd: 0, balanceVnd: -8_000_000 });
    expect(heroOf(late, "2026-12-01").line).toContain("settle-by date has passed");
    expect(alertOf(late, "2026-12-01").tone).toBe("err");
    expect(heroOf({ ...late, returnReported: true }, "2026-12-01").line).toContain("on its way");
    expect(alertOf({ ...late, returnReported: true }, "2026-12-01").tone).toBe("warn");
  });

  it("says on the last step what the company owes, and when it has paid", () => {
    const closed = facts({ status: "settled", spentVnd: 8_720_000, balanceVnd: 720_000 });
    const sub = (a: typeof closed) => stagesOf(a, { askedOn: null, approvedBy: null, sentOn: null }).at(-1)?.sub;
    expect(sub(closed)).toBe("₫720,000 to you");
    expect(sub({ ...closed, claimStatus: "paid" })).toBe("₫720,000 paid to you");
    expect(sub(facts({ status: "settled", spentVnd: 8_000_000, balanceVnd: 0 }))).toBe("Nothing owed");
  });

  it("says it is back on while the transfer waits to be recorded, not that Finance is sending it", () => {
    const back = facts({ status: "approved", reinstatedWhy: "It went at 09:40." });
    expect(alertOf(back, TODAY)).toMatchObject({ tone: "warn", head: "Your advance is back on." });
    expect(alertOf(back, TODAY).body).toContain("It went at 09:40.");
    expect(alertOf(back, TODAY).body).toContain("If it never reached you, cancel it");
    expect(heroOf(back, TODAY).line).not.toContain("is sending");
    expect(alertOf(facts({ status: "approved" }), TODAY).body).toContain("is sending");
  });

  it("says nothing owed rather than a zero, and what the company still pays", () => {
    expect(heroOf(facts({ status: "settled", spentVnd: 8_000_000, balanceVnd: 0 }), TODAY).figure).toBe("Nothing owed");
    expect(heroOf(facts({ status: "settled", spentVnd: 7_360_000, balanceVnd: -640_000 }), TODAY).line).toContain("returned arrived");
    expect(heroOf(facts({ status: "settled", spentVnd: 8_720_000, balanceVnd: 720_000 }), TODAY).figure).toContain("720,000");
    // Once the run has paid it, nothing is still to come.
    const paid = facts({ status: "settled", spentVnd: 8_720_000, balanceVnd: 720_000, claimStatus: "paid" });
    expect(heroOf(paid, TODAY)).toEqual({ figure: expect.stringContaining("720,000 paid to you"), line: "Settled. The company paid you the difference." });
    expect(alertOf(paid, TODAY).body).toBe("The company paid you ₫720,000.");
    const waiting = facts({ status: "settled", spentVnd: 8_720_000, balanceVnd: 720_000, claimStatus: "approved" });
    expect(heroOf(waiting, TODAY).line).toContain("next run");
    expect(alertOf(waiting, TODAY).body).toContain("next payment run");
  });
});

describe("alertOf", () => {
  it("is a warning when sent back, an error when rejected or overdue", () => {
    expect(alertOf(facts({ status: "sent_back", reason: "x" }), TODAY).tone).toBe("warn");
    expect(alertOf(facts({ status: "rejected", reason: "x" }), TODAY)).toMatchObject({ tone: "err", body: "x" });
    expect(alertOf(facts(sent), "2026-12-01").tone).toBe("err");
    expect(alertOf(facts(sent), TODAY).tone).toBe("ok");
  });
});

describe("stagesOf", () => {
  const reached = { askedOn: "2026-11-03", approvedBy: "Avery", sentOn: "2026-11-04" };
  const states = (f: AdvanceFacts) => stagesOf(f, reached).map((s) => s.state);

  it("walks the five steps", () => {
    expect(states(facts({ status: "draft" }))).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(states(facts({ status: "submitted" }))).toEqual(["done", "current", "todo", "todo", "todo"]);
    expect(states(facts({ status: "approved" }))).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(states(facts({ status: "paid_out" }))).toEqual(["done", "done", "done", "current", "todo"]);
    expect(states(facts({ status: "to_return" }))).toEqual(["done", "done", "done", "done", "current"]);
    expect(states(facts({ status: "settled" }))).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("stops where it stopped, and says who did it", () => {
    const sentBack = stagesOf(facts({ status: "sent_back", approver: "Avery" }), reached);
    expect(sentBack[1]).toMatchObject({ state: "stopped", sub: "Sent back by Avery" });
    expect(stagesOf(facts({ status: "cancelled" }), reached)[2]).toMatchObject({ state: "stopped", sub: "Cancelled by you" });
  });

  it("says a settlement is being checked", () => {
    expect(stagesOf(facts({ status: "paid_out", claimStatus: "submitted" }), reached)[3].sub).toBe("Being checked");
  });
});

describe("owedOf", () => {
  it("is what is left, and nothing with no balance", () => {
    expect(owedOf({ balanceVnd: -640_000, returnedVnd: 400_000 })).toBe(240_000);
    expect(owedOf({ balanceVnd: null, returnedVnd: 0 })).toBe(0);
  });
});

describe("ringOf", () => {
  it("empties as the deadline nears, warns at three days, and is red once it has passed", () => {
    expect(ringOf(20, false, 20)).toEqual({ degrees: 360, tone: "accent" });
    expect(ringOf(10, false, 20)).toEqual({ degrees: 180, tone: "accent" });
    expect(ringOf(3, false, 20).tone).toBe("warn");
    expect(ringOf(0, true, 20)).toEqual({ degrees: 360, tone: "err" });
  });

  it("never draws past a full circle", () => {
    expect(ringOf(40, false, 20).degrees).toBe(360);
  });
});
