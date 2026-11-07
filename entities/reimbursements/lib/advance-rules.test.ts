import { describe, expect, it } from "vitest";
import {
  ADVANCE_MOVES,
  ADVANCE_STATUSES,
  ADVANCE_STATUS_LABEL,
  ADVANCE_STATUS_LABEL_TO_OTHERS,
  ADVANCE_STATUS_TONE,
  CLOSED_ADVANCE_STATUSES,
  OPEN_ADVANCE_STATUSES,
  advanceRef,
  canDeleteAdvance,
  canSubmitAdvance,
  isAdvanceStatus,
  isOverdue,
  isSettling,
  returnStillReported,
  moveNeedsReason,
  nextAdvanceStatus,
  ownAdvanceRefusal,
  ownerCanAdvance,
  payOutRefusal,
  type AdvanceActorKind,
  type AdvanceMove,
  type AdvanceStatus,
} from "./advance-rules";

const ACTORS: AdvanceActorKind[] = ["owner", "approver", "payer", "system"];

// The design's table, written out again by hand so a change to the module has to
// be made twice. The moves with two endings are asked with the figure that picks each.
const ARROWS: [AdvanceStatus, AdvanceMove, AdvanceActorKind, AdvanceStatus][] = [
  ["draft", "submit", "owner", "submitted"],
  ["sent_back", "submit", "owner", "submitted"],
  ["submitted", "withdraw", "owner", "draft"],
  ["draft", "cancel", "owner", "cancelled"],
  ["approved", "cancel", "owner", "cancelled"],
  ["submitted", "approve", "approver", "approved"],
  ["submitted", "send_back", "approver", "sent_back"],
  ["submitted", "reject", "approver", "rejected"],
  ["approved", "pay_out", "payer", "paid_out"],
  ["paid_out", "return_unspent", "owner", "to_return"],
  ["cancelled", "reinstate", "payer", "approved"],
];
const NOOPS: [AdvanceStatus, AdvanceMove, AdvanceActorKind][] = [
  ["submitted", "submit", "owner"],
  ["draft", "withdraw", "owner"],
  ["cancelled", "cancel", "owner"],
  ["to_return", "return_unspent", "owner"],
];
const TWO_ENDINGS: ReadonlySet<AdvanceMove> = new Set<AdvanceMove>(["close", "confirm_return"]);

describe("nextAdvanceStatus", () => {
  for (const from of ADVANCE_STATUSES) {
    for (const move of ADVANCE_MOVES) {
      if (TWO_ENDINGS.has(move)) continue;
      for (const actor of ACTORS) {
        const arrow = ARROWS.find(([f, m, a]) => f === from && m === move && a === actor);
        const noop = NOOPS.some(([f, m, a]) => f === from && m === move && a === actor);
        const expected = arrow ? `apply ${arrow[3]}` : noop ? "noop" : "refuse";
        it(`${actor} ${move} on ${from}: ${expected}`, () => {
          const next = nextAdvanceStatus(from, move, actor);
          expect(next.outcome === "apply" ? `apply ${next.status}` : next.outcome).toBe(expected);
          if (next.outcome === "refuse") expect(next.error).toMatch(/\S/);
        });
      }
    }
  }

  describe("close", () => {
    it("ends on the balance: owing waits for the money, anything else settles", () => {
      expect(nextAdvanceStatus("paid_out", "close", "system", { balanceVnd: -640_000 })).toEqual({ outcome: "apply", status: "to_return" });
      expect(nextAdvanceStatus("paid_out", "close", "system", { balanceVnd: 0 })).toEqual({ outcome: "apply", status: "settled" });
      expect(nextAdvanceStatus("paid_out", "close", "system", { balanceVnd: 720_000 })).toEqual({ outcome: "apply", status: "settled" });
    });

    it("refuses without the figure, rather than guessing", () => {
      expect(nextAdvanceStatus("paid_out", "close", "system").outcome).toBe("refuse");
    });

    it("is the system's alone, from paid_out alone", () => {
      for (const actor of ["owner", "approver", "payer"] as const) expect(nextAdvanceStatus("paid_out", "close", actor, { balanceVnd: 0 }).outcome).toBe("refuse");
      for (const from of ADVANCE_STATUSES) {
        if (from !== "paid_out") expect(nextAdvanceStatus(from, "close", "system", { balanceVnd: 0 }).outcome).toBe("refuse");
      }
    });
  });

  describe("confirm_return", () => {
    it("stays open while money is owed, and settles when none is", () => {
      expect(nextAdvanceStatus("to_return", "confirm_return", "payer", { outstandingAfterVnd: 240_000 })).toEqual({ outcome: "apply", status: "to_return" });
      expect(nextAdvanceStatus("to_return", "confirm_return", "payer", { outstandingAfterVnd: 0 })).toEqual({ outcome: "apply", status: "settled" });
    });

    it("refuses without the figure, and once settled", () => {
      expect(nextAdvanceStatus("to_return", "confirm_return", "payer").outcome).toBe("refuse");
      expect(nextAdvanceStatus("settled", "confirm_return", "payer", { outstandingAfterVnd: 0 }).outcome).toBe("refuse");
    });
  });

  it("leaves paid_out only by the ledger's two moves", () => {
    const out = ADVANCE_MOVES.flatMap((move) =>
      ACTORS.filter((actor) => nextAdvanceStatus("paid_out", move, actor, { balanceVnd: 0 }).outcome === "apply").map(() => move),
    );
    expect(out.sort()).toEqual(["close", "return_unspent"]);
  });

  it("names who may make a move when the wrong actor asks", () => {
    expect(nextAdvanceStatus("submitted", "approve", "owner")).toEqual({ outcome: "refuse", error: "Only an approver can approve an advance." });
    expect(nextAdvanceStatus("approved", "pay_out", "approver")).toEqual({ outcome: "refuse", error: "Only Finance can record the transfer." });
  });

  it("refuses a repeated decision and says it was already made", () => {
    expect(nextAdvanceStatus("approved", "approve", "approver")).toEqual({ outcome: "refuse", error: 'This advance is already "approved · being sent".' });
    expect(nextAdvanceStatus("paid_out", "pay_out", "payer").outcome).toBe("refuse");
  });
});

describe("who a status is said to", () => {
  it("never says you to someone other than the person holding the money", () => {
    for (const status of ADVANCE_STATUSES) expect(ADVANCE_STATUS_LABEL_TO_OTHERS[status]).not.toMatch(/\byou\b/i);
  });

  it("words a refusal for whoever may make the move", () => {
    expect(nextAdvanceStatus("paid_out", "approve", "approver")).toEqual({ outcome: "refuse", error: 'An advance that is "money with them" cannot be moved this way.' });
    expect(nextAdvanceStatus("paid_out", "cancel", "owner")).toEqual({ outcome: "refuse", error: 'This advance is "money with you", so it can no longer be cancelled.' });
  });
});

describe("the lists agree", () => {
  it("every status has a label and a tone", () => {
    for (const status of ADVANCE_STATUSES) {
      expect(ADVANCE_STATUS_LABEL[status]).toMatch(/\S/);
      expect(ADVANCE_STATUS_LABEL_TO_OTHERS[status]).toMatch(/\S/);
      expect(ADVANCE_STATUS_TONE[status]).toMatch(/\S/);
    }
  });

  it("open means what the database's unique index means", () => {
    expect([...OPEN_ADVANCE_STATUSES].sort()).toEqual(["approved", "draft", "paid_out", "sent_back", "submitted", "to_return"]);
  });

  it("knows a status from a string", () => {
    expect(isAdvanceStatus("paid_out")).toBe(true);
    expect(isAdvanceStatus("overdue")).toBe(false);
  });
});

describe("moveNeedsReason", () => {
  it("asks for one on a no, and on cancelling money about to be sent", () => {
    expect(moveNeedsReason("send_back", "submitted")).toBe(true);
    expect(moveNeedsReason("reject", "submitted")).toBe(true);
    expect(moveNeedsReason("cancel", "approved")).toBe(true);
  });

  it("does not on anything else", () => {
    expect(moveNeedsReason("cancel", "draft")).toBe(false);
    expect(moveNeedsReason("approve", "submitted")).toBe(false);
    expect(moveNeedsReason("withdraw", "submitted")).toBe(false);
  });
});

describe("ownAdvanceRefusal", () => {
  const advance = { personId: "me" };

  it("reads as not found to an owner it does not belong to", () => {
    expect(ownAdvanceRefusal(advance, { kind: "owner", personId: "me", mayDecideOwn: false })).toBeNull();
    expect(ownAdvanceRefusal(advance, { kind: "owner", personId: "them", mayDecideOwn: false })).toBe("Advance not found.");
    expect(ownAdvanceRefusal(advance, { kind: "owner", personId: null, mayDecideOwn: false })).toBe("Advance not found.");
  });

  it("stops an approver deciding their own, unless they may", () => {
    expect(ownAdvanceRefusal(advance, { kind: "approver", personId: "me", mayDecideOwn: false })).toMatch(/your own/);
    expect(ownAdvanceRefusal(advance, { kind: "approver", personId: "me", mayDecideOwn: true })).toBeNull();
    expect(ownAdvanceRefusal(advance, { kind: "approver", personId: "them", mayDecideOwn: false })).toBeNull();
  });
});

describe("payOutRefusal", () => {
  const owned = { personId: "owner" };

  it("keeps the approver from recording the transfer, even when they hold both roles", () => {
    expect(payOutRefusal({ ...owned, decidedBy: "dave" }, { personId: "dave" })).toMatch(/someone else/);
    expect(payOutRefusal({ ...owned, decidedBy: "dave" }, { personId: "accountant" })).toBeNull();
  });

  it("keeps a payer from recording the transfer of their own advance, whoever approved it", () => {
    expect(payOutRefusal({ ...owned, decidedBy: "dave" }, { personId: "owner" })).toMatch(/your own advance/);
  });

  it("needs a person, because the rule cannot hold without one", () => {
    expect(payOutRefusal({ ...owned, decidedBy: "dave" }, { personId: null })).toMatch(/person/);
    expect(payOutRefusal({ ...owned, decidedBy: null }, { personId: null })).toMatch(/person/);
  });
});

describe("returnStillReported", () => {
  it("holds only while nothing has arrived since they said it", () => {
    const said = { returnReportedAt: "t", returnReportedAtVnd: 0 };
    expect(returnStillReported(said, 0)).toBe(true);
    expect(returnStillReported(said, 400_000)).toBe(false);
    expect(returnStillReported({ returnReportedAt: "t", returnReportedAtVnd: 400_000 }, 400_000)).toBe(true);
  });

  it("is false when they never said it", () => {
    expect(returnStillReported({ kept: 1 }, 0)).toBe(false);
    expect(returnStillReported(null, 0)).toBe(false);
  });
});

describe("the statuses an advance can be in", () => {
  it("are each either open or closed, never both", () => {
    expect([...OPEN_ADVANCE_STATUSES, ...CLOSED_ADVANCE_STATUSES].sort()).toEqual([...ADVANCE_STATUSES].sort());
  });
});

describe("what the owner can do", () => {
  const can = (status: AdvanceStatus, submittedAt: string | null = "2026-11-03", settling = false) => ownerCanAdvance({ status, submittedAt, settling });

  it("deletes a never-submitted draft, and cancels one that was submitted", () => {
    expect(can("draft", null)).toMatchObject({ delete: true, cancel: false, edit: true, submit: true });
    expect(can("draft")).toMatchObject({ delete: false, cancel: true, edit: true, submit: true });
    expect(canDeleteAdvance({ status: "draft", submittedAt: null })).toBe(true);
    expect(canDeleteAdvance({ status: "draft", submittedAt: "2026-11-03" })).toBe(false);
    expect(canDeleteAdvance({ status: "submitted", submittedAt: null })).toBe(false);
  });

  it("withdraws while waiting, fixes when sent back and cancels before the transfer", () => {
    expect(can("submitted")).toMatchObject({ withdraw: true, edit: false, cancel: false });
    expect(can("sent_back")).toMatchObject({ edit: true, submit: true, withdraw: false });
    expect(can("approved")).toMatchObject({ cancel: true, edit: false });
  });

  it("settles or returns once the money is out, and not while a settlement is being checked", () => {
    expect(can("paid_out")).toMatchObject({ settle: true, returnUnspent: true, cancel: false });
    expect(can("paid_out", "2026-11-03", true)).toMatchObject({ settle: false, returnUnspent: false });
  });

  it("does nothing once it has ended", () => {
    for (const status of ["rejected", "cancelled", "settled"] as const) {
      expect(Object.values(can(status)).every((choice) => choice === false)).toBe(true);
    }
  });

  it("offers only moves the state machine would take", () => {
    for (const status of ADVANCE_STATUSES) {
      const offered = can(status);
      if (offered.submit) expect(nextAdvanceStatus(status, "submit", "owner").outcome).toBe("apply");
      if (offered.withdraw) expect(nextAdvanceStatus(status, "withdraw", "owner").outcome).toBe("apply");
      if (offered.cancel) expect(nextAdvanceStatus(status, "cancel", "owner").outcome).toBe("apply");
      if (offered.returnUnspent) expect(nextAdvanceStatus(status, "return_unspent", "owner").outcome).toBe("apply");
    }
  });
});

describe("canSubmitAdvance", () => {
  const good = { purpose: "Venue deposit", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", evidenceCount: 1, promised: true, bankDetailsOnFile: true, anotherOpen: false };

  it("passes a complete request", () => {
    expect(canSubmitAdvance(good)).toEqual({ ok: true });
  });

  const AMOUNTS: [number, boolean][] = [[0, false], [1, true], [10_000_000, true], [10_000_001, false], [-1, false], [1.5, false], [Number.NaN, false]];
  for (const [amountVnd, ok] of AMOUNTS) {
    it(`amount ${amountVnd}: ${ok ? "passes" : "refused"}`, () => {
      expect(canSubmitAdvance({ ...good, amountVnd }).ok).toBe(ok);
    });
  }

  const MISSING: [string, Partial<typeof good> | { spendEndsOn: null }, RegExp][] = [
    ["a blank purpose", { purpose: "   " }, /what it is for/],
    ["no date", { spendEndsOn: null }, /date/],
    ["no evidence", { evidenceCount: 0 }, /quote/],
    ["no promise", { promised: false }, /promise/],
    ["no bank details", { bankDetailsOnFile: false }, /bank details/],
    ["another open advance", { anotherOpen: true }, /open advance/],
  ];
  for (const [what, change, words] of MISSING) {
    it(`refuses ${what}, and says so`, () => {
      const result = canSubmitAdvance({ ...good, ...change });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons.join(" ")).toMatch(words);
    });
  }

  it("says every reason at once", () => {
    const result = canSubmitAdvance({ purpose: "", amountVnd: 0, spendEndsOn: null, evidenceCount: 0, promised: false, bankDetailsOnFile: false, anotherOpen: true });
    expect(result.ok === false && result.reasons.length).toBe(7);
  });

  it("names the maximum when an amount is above it", () => {
    const result = canSubmitAdvance({ ...good, amountVnd: 10_000_001 });
    expect(result.ok === false && result.reasons[0]).toContain("₫10,000,000");
  });
});

describe("what is derived and never stored", () => {
  it("settling is paid_out with a settlement being checked", () => {
    expect(isSettling({ status: "paid_out", claimStatus: "submitted" })).toBe(true);
    expect(isSettling({ status: "paid_out", claimStatus: "checked" })).toBe(true);
    expect(isSettling({ status: "paid_out", claimStatus: "draft" })).toBe(false);
    expect(isSettling({ status: "paid_out", claimStatus: "sent_back" })).toBe(false);
    expect(isSettling({ status: "paid_out", claimStatus: null })).toBe(false);
    expect(isSettling({ status: "to_return", claimStatus: "submitted" })).toBe(false);
  });

  it("overdue starts the day after the deadline", () => {
    const advance = { status: "paid_out" as const, settleBy: "2026-11-30", claimStatus: null };
    expect(isOverdue(advance, "2026-11-30")).toBe(false);
    expect(isOverdue(advance, "2026-12-01")).toBe(true);
  });

  it("is overdue while money is still owed back, so saying none was spent does not clear it", () => {
    expect(isOverdue({ status: "to_return", settleBy: "2026-11-30", claimStatus: null }, "2026-12-01")).toBe(true);
    expect(isOverdue({ status: "to_return", settleBy: "2026-11-30", claimStatus: null }, "2026-11-30")).toBe(false);
  });

  it("is not overdue for a settlement reviewed after the date: the person handed it in and the wait was ours", () => {
    expect(isOverdue({ status: "to_return", settleBy: "2026-11-30", claimStatus: "approved" }, "2026-12-01")).toBe(false);
  });

  it("is not overdue while a settlement is being checked, or once the money is not out", () => {
    expect(isOverdue({ status: "paid_out", settleBy: "2026-11-30", claimStatus: "submitted" }, "2026-12-01")).toBe(false);
    expect(isOverdue({ status: "paid_out", settleBy: "2026-11-30", claimStatus: "sent_back" }, "2026-12-01")).toBe(true);
    expect(isOverdue({ status: "settled", settleBy: "2026-11-30", claimStatus: null }, "2026-12-01")).toBe(false);
    expect(isOverdue({ status: "paid_out", settleBy: null, claimStatus: null }, "2026-12-01")).toBe(false);
  });
});

describe("advanceRef", () => {
  it("pads to four digits and grows past them", () => {
    expect(advanceRef(7)).toBe("ADV-0007");
    expect(advanceRef(12345)).toBe("ADV-12345");
  });
});
