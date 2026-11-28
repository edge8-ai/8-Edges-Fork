import { describe, expect, it } from "vitest";
import { answeredLine, answersSoFar, askedLine, askMoves, closedLabel, dueLabel, firstName, landedLine, waitingLabel, type AskActions } from "./asks-model";

// The Asks page's words and moves (AK.2, ADR 0036). Names are invented.

// Wednesday 18 November 2026, 10:00 in Saigon.
const NOW = "2026-11-18T03:00:00.000Z";

describe("the four moves: each one existing quest action", () => {
  const calls: unknown[][] = [];
  const ok = async () => ({ ok: true as const });
  const actions: AskActions = {
    turnIn: async (...args) => (calls.push(["turnIn", ...args]), ok()),
    reactToTurnIn: async (...args) => (calls.push(["reactToTurnIn", ...args]), ok()),
    closeQuest: async (...args) => (calls.push(["closeQuest", ...args]), ok()),
    withdrawQuest: async (...args) => (calls.push(["withdrawQuest", ...args]), ok()),
  };
  const moves = askMoves(actions);
  const ask = { questId: "q1", headId: "h1" };

  it("answers with a Turn-in on the ask's one head, its words trimmed", async () => {
    calls.length = 0;
    await moves.answer(ask, "  The deck is at https://example.com/deck \n");
    expect(calls).toEqual([["turnIn", "q1", "h1", { text: "The deck is at https://example.com/deck" }]]);
  });

  // AK.9: a required ask is a task and cannot be declined, and nobody is
  // expected to answer an ask open to anyone, so the page has no decline move.
  it("has no decline: Answer, Thanks, Close now and Withdraw are all", () => {
    expect(Object.keys(moves).sort()).toEqual(["answer", "closeNow", "thank", "withdraw"]);
  });

  it("thanks an answer with a Reaction the asker never has to write", async () => {
    calls.length = 0;
    await moves.thank(ask, "answerer");
    expect(calls).toEqual([["reactToTurnIn", "q1", "h1", "answerer", "Thanks for your answer."]]);
  });

  it("closes or withdraws the whole ask", async () => {
    calls.length = 0;
    await moves.closeNow(ask);
    await moves.withdraw(ask);
    expect(calls).toEqual([
      ["closeQuest", "q1"],
      ["withdrawQuest", "q1"],
    ]);
  });
});

describe("when an ask is due, in Saigon", () => {
  it("names the day, and marks today, tomorrow and a passed time as soon", () => {
    expect(dueLabel("2026-11-18T11:00:00.000Z", NOW)).toEqual({ text: "Due today, 18:00", soon: true });
    expect(dueLabel("2026-11-19T11:00:00.000Z", NOW)).toEqual({ text: "Due tomorrow", soon: true });
    expect(dueLabel("2026-11-20T11:00:00.000Z", NOW)).toEqual({ text: "Due Fri 20 Nov", soon: false });
    expect(dueLabel("2026-11-16T11:00:00.000Z", NOW)).toEqual({ text: "Was due Mon 16 Nov", soon: true });
  });

  it("takes the Saigon day, not the UTC one, for a time after 17:00 UTC", () => {
    // 01:00 on Saturday 21 November in Saigon is still Friday in UTC.
    expect(dueLabel("2026-11-20T18:00:00.000Z", NOW).text).toBe("Due Sat 21 Nov");
  });

  it("says Sep, not Sept", () => {
    expect(dueLabel("2027-09-07T11:00:00.000Z", NOW).text).toBe("Due Tue 7 Sep");
  });
});

describe("when an ask closed, in Saigon (AK.8)", () => {
  it("names the Saigon day it closed", () => {
    expect(closedLabel("2026-11-16T11:00:00.000Z")).toBe("Closed Mon 16 Nov");
    // 01:00 on Saturday 21 November in Saigon is still Friday in UTC.
    expect(closedLabel("2026-11-20T18:00:00.000Z")).toBe("Closed Sat 21 Nov");
  });
});

describe("the page's counting words", () => {
  it("counts who was asked and who answered, never naming anyone", () => {
    expect(askedLine(1)).toBe("To 1 person");
    expect(askedLine(29)).toBe("To 29 people");
    expect(answeredLine({ answered: 2, asked: 29 })).toBe("2 of 29 answered");
    expect(answersSoFar(0)).toBe("No answers yet");
    expect(answersSoFar(1)).toBe("1 answer so far");
    expect(answersSoFar(3)).toBe("3 answers so far");
    expect(waitingLabel(0)).toBe("Nothing waiting. Nice.");
    expect(waitingLabel(2)).toBe("2 open");
  });

  it("says where an answer went, by the name the asker goes by", () => {
    expect(landedLine("answered", "Lena Lead")).toBe("Answered. Lena can see it.");
    // An answer to an ask that closed is recorded as late, and the line says so
    // (AK.9, Khoa: "Say it shows late").
    expect(landedLine("answered_late", "Tam Nguyen (Kit)")).toBe("Answered late. Kit can see it.");
    expect(firstName("Pia")).toBe("Pia");
  });
});
