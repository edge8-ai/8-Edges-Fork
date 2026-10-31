import { describe, expect, it } from "vitest";
import { dueWindow, parkedInWaiting } from "./due-tomorrow";

// TH.2: the morning run tells each assignee what is due by the next working day.
describe("dueWindow", () => {
  it("is the next day on a working day", () => {
    expect(dueWindow("2026-10-13")).toEqual({ after: "2026-10-13", through: "2026-10-14" });
  });

  it("reaches through the weekend to Monday on a Friday", () => {
    expect(dueWindow("2026-10-09")).toEqual({ after: "2026-10-09", through: "2026-10-12" });
  });
});

// U.4: a card parked in Waiting gets no due-date reminder.
describe("parkedInWaiting", () => {
  const lane = (name: string) => ({ name });
  it("skips a card in Waiting and keeps one anywhere else", () => {
    expect(parkedInWaiting({ parent_task_id: null, column: lane("Waiting"), parent: null })).toBe(true);
    expect(parkedInWaiting({ parent_task_id: null, column: [lane("To do")], parent: null })).toBe(false);
    expect(parkedInWaiting({ parent_task_id: null, column: null, parent: null })).toBe(false);
  });

  it("reads a subtask by its parent's lane, not its own", () => {
    expect(parkedInWaiting({ parent_task_id: "p", column: lane("Doing"), parent: { column: lane("Waiting") } })).toBe(true);
    expect(parkedInWaiting({ parent_task_id: "p", column: lane("Waiting"), parent: { column: lane("Doing") } })).toBe(false);
  });
});
