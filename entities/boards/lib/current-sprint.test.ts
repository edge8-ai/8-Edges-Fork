import { describe, expect, it } from "vitest";
import type { WorkboardData } from "./workboard";
import type { SprintRow } from "./types";
import { currentSprint, currentSprintByBoard } from "./current-sprint";
import { currentSprintFor } from "./idea-cards";
import { workboardHeadSummary } from "@/entities/boards/ui/workboard-head-summary";
import { openingSprint } from "@/entities/boards/ui/workboard-filter-parts";

// "Which sprint is this board in today?" (A.57). Invented sprint names: the
// public fork receives test files too.

const TODAY = "2026-10-15";

const span = (id: string, starts_on: string | null, ends_on: string | null, status = "active") => ({ id, status, starts_on, ends_on });

describe("currentSprint", () => {
  it("is the active sprint that holds today", () => {
    expect(currentSprint([span("last", "2026-10-06", "2026-10-12"), span("now", "2026-10-13", "2026-10-19")], TODAY)?.id).toBe("now");
  });

  it("holds on its first and its last day", () => {
    expect(currentSprint([span("now", TODAY, "2026-10-21")], TODAY)?.id).toBe("now");
    expect(currentSprint([span("now", "2026-10-09", TODAY)], TODAY)?.id).toBe("now");
  });

  it("is not a sprint that has not begun, even an active one planned ahead", () => {
    expect(currentSprint([span("next", "2026-10-20", "2026-10-26")], TODAY)).toBeNull();
  });

  it("is not an active sprint whose end has passed, though nobody closed it", () => {
    expect(currentSprint([span("stale", "2026-09-29", "2026-10-05")], TODAY)).toBeNull();
  });

  it("counts a null start as started and a null end as open", () => {
    expect(currentSprint([span("undated-start", null, "2026-10-19")], TODAY)?.id).toBe("undated-start");
    expect(currentSprint([span("open-ended", "2026-10-01", null)], TODAY)?.id).toBe("open-ended");
    expect(currentSprint([span("undated", null, null)], TODAY)?.id).toBe("undated");
  });

  it("ignores a closed sprint that holds today", () => {
    expect(currentSprint([span("closed", "2026-10-13", "2026-10-19", "closed")], TODAY)).toBeNull();
  });

  it("breaks a tie by the latest start, then the earliest end, then the lowest id, in any read order", () => {
    const twoWeeks = span("two-weeks", "2026-10-06", "2026-10-19");
    const week = span("week", "2026-10-13", "2026-10-19");
    expect(currentSprint([twoWeeks, week], TODAY)?.id).toBe("week");
    expect(currentSprint([week, twoWeeks], TODAY)?.id).toBe("week");

    const short = span("short", "2026-10-13", "2026-10-16");
    expect(currentSprint([week, short], TODAY)?.id).toBe("short");
    expect(currentSprint([short, week], TODAY)?.id).toBe("short");

    const twinB = span("b", "2026-10-13", "2026-10-19");
    const twinA = span("a", "2026-10-13", "2026-10-19");
    expect(currentSprint([twinB, twinA], TODAY)?.id).toBe("a");
  });

  it("is null on a board without sprints", () => {
    expect(currentSprint([], TODAY)).toBeNull();
  });
});

describe("currentSprintByBoard", () => {
  it("answers each board on its own and leaves out a board that is in no sprint", () => {
    const rows = [
      { ...span("b1-now", "2026-10-13", "2026-10-19"), board_id: "b1" },
      { ...span("b2-two-weeks", "2026-10-06", "2026-10-19"), board_id: "b2" },
      { ...span("b3-next", "2026-10-20", "2026-10-26"), board_id: "b3" },
    ];
    const byBoard = currentSprintByBoard(rows, TODAY);
    expect([...byBoard.entries()].map(([board, s]) => [board, s.id])).toEqual([
      ["b1", "b1-now"],
      ["b2", "b2-two-weeks"],
    ]);
  });
});

// The proof the card is done. One board, this week's sprint A and next week's
// sprint B both active, B ahead of A in sort_order (the order the Workboard
// reads them in). Before A.57 the single-board filter opened on B while the
// header and a picked-up idea said A.
describe("the board's current sprint, asked three ways", () => {
  const sprintRow = (id: string, starts_on: string, ends_on: string, week: string, sort_order: number): SprintRow =>
    ({ id, board_id: "b1", name: id, status: "active", starts_on, ends_on, week, sort_order }) as SprintRow;
  const A = sprintRow("sp-a", "2026-10-13", "2026-10-19", "2026-W42", 2);
  const B = sprintRow("sp-b", "2026-10-20", "2026-10-26", "2026-W43", 1);
  const data = { boards: [{ id: "b1" }], cards: [], sprints: [B, A] } as unknown as WorkboardData;

  it("names one sprint and its week", () => {
    const pickedUp = currentSprintFor([A, B], TODAY);
    expect(pickedUp).toBe("sp-a");
    expect(openingSprint(data, TODAY)).toBe(pickedUp);
    expect(workboardHeadSummary(data, TODAY)).toBe("0 cards · 1 board · 2026-W42");
  });
});
