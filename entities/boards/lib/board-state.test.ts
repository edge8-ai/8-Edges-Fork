import { describe, expect, it } from "vitest";
import { isInProgressLane, personBoardState } from "./board-state";
import type { WorkboardCard, WorkboardLane } from "./workboard";

// U.2. The one rule the three reporting agents count a person's cards by.

const NOW = Date.parse("2026-09-22T02:30:00Z");
const DAY = 86_400_000;
const LANES: WorkboardLane[] = [
  { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Waiting", name: "Waiting", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
  { id: "Not doing", name: "Not doing", isDone: false, isNotDoing: true, wipLimit: null },
];

function card(id: string, over: Partial<WorkboardCard> = {}): WorkboardCard {
  return {
    id,
    title: `card ${id}`,
    status: "open",
    assignee_id: "p1",
    laneId: "To do",
    completed_at: null,
    last_column_move_at: null,
    ...over,
  } as unknown as WorkboardCard;
}

const ids = (cards: WorkboardCard[]) => cards.map((c) => c.id).sort();

describe("personBoardState", () => {
  const cards = [
    card("todo"),
    card("doing", { laneId: "Doing" }),
    card("waiting", { laneId: "Waiting" }),
    // The row still says open, but the card sits in Done: the lane wins (W.111).
    card("in-done-lane", { laneId: "Done", last_column_move_at: new Date(NOW - DAY / 2).toISOString() }),
    // Marked done where it sat, never moved: its completion stamp counts.
    card("done-in-place", { laneId: "Doing", status: "done", completed_at: new Date(NOW - DAY / 2).toISOString() }),
    card("done-long-ago", { laneId: "Done", status: "done", completed_at: new Date(NOW - 10 * DAY).toISOString() }),
    card("not-doing", { laneId: "Not doing", status: "not_doing" }),
    card("someone-else", { laneId: "Doing", assignee_id: "p2" }),
  ];

  it("counts open work, splits it into doing and waiting, and leaves out done and Not Doing", () => {
    const s = personBoardState({ lanes: LANES, cards }, "p1", NOW - DAY);
    expect(ids(s.open)).toEqual(["doing", "todo", "waiting"]);
    expect(ids(s.doing)).toEqual(["doing"]);
    expect(ids(s.waiting)).toEqual(["todo", "waiting"]);
  });

  it("counts a card finished inside the window, whether it moved to Done or was completed where it sat", () => {
    expect(ids(personBoardState({ lanes: LANES, cards }, "p1", NOW - DAY).done)).toEqual(["done-in-place", "in-done-lane"]);
    expect(ids(personBoardState({ lanes: LANES, cards }, "p1", NOW - 14 * DAY).done)).toEqual([
      "done-in-place",
      "done-long-ago",
      "in-done-lane",
    ]);
  });

  it("never reads a Not Doing lane as work in progress, whatever it is called", () => {
    // The weekly summary used to match any lane name CONTAINING "doing".
    expect(isInProgressLane("Not doing")).toBe(false);
    expect(isInProgressLane("Doing review")).toBe(false);
    expect(isInProgressLane(" In progress ")).toBe(true);
    const lanes: WorkboardLane[] = [{ id: "Doing", name: "Doing", isDone: false, isNotDoing: true, wipLimit: null }];
    const s = personBoardState({ lanes, cards: [card("x", { laneId: "Doing" })] }, "p1", NOW - DAY);
    expect(s.doing).toEqual([]);
  });
});
