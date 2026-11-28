import { describe, expect, it } from "vitest";
import type { TaskPriority } from "@/entities/boards/lib/types";
import { manualOrderAllowed, sortCards, type SortableCard } from "./workboard-sort";

// What sorting promises (W.27): a column can be put in a real order, and a
// column that is in one never writes a manual rank — because a card dragged up
// a sorted column would spring straight back and the board would look broken.

type Row = SortableCard & { id: string };
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  due_date: null,
  priority: "p3" as TaskPriority,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("sortCards", () => {
  it("leaves manual order exactly as the board placed it", () => {
    const rows = [row("c"), row("a"), row("b")];
    expect(sortCards(rows, "manual")).toBe(rows);
  });

  it("puts the soonest due date first and a card with no due date last", () => {
    const rows = [row("none"), row("late", { due_date: "2026-12-01" }), row("soon", { due_date: "2026-02-01" })];
    expect(ids(sortCards(rows, "due"))).toEqual(["soon", "late", "none"]);
  });

  it("puts P1 first", () => {
    const rows = [row("three", { priority: "p3" }), row("one", { priority: "p1" }), row("two", { priority: "p2" })];
    expect(ids(sortCards(rows, "priority"))).toEqual(["one", "two", "three"]);
  });

  it("puts the oldest card first by date created", () => {
    const rows = [row("new", { created_at: "2026-09-01T00:00:00Z" }), row("old", { created_at: "2025-01-01T00:00:00Z" })];
    expect(ids(sortCards(rows, "created"))).toEqual(["old", "new"]);
  });

  it("keeps the board's own order for ties, so a sort never shuffles", () => {
    const rows = [row("b", { due_date: "2026-02-01" }), row("a", { due_date: "2026-02-01" })];
    expect(ids(sortCards(rows, "due"))).toEqual(["b", "a"]);
  });
});

describe("manualOrderAllowed", () => {
  it("allows a manual rank only on the lanes, in manual order", () => {
    expect(manualOrderAllowed("lane", "manual")).toBe(true);
  });

  it("refuses it under any sort — a rank the sort overrides is a rank nobody sees", () => {
    expect(manualOrderAllowed("lane", "due")).toBe(false);
    expect(manualOrderAllowed("lane", "priority")).toBe(false);
    expect(manualOrderAllowed("lane", "created")).toBe(false);
  });

  it("refuses it under any grouping but the lanes, because position is a rank WITHIN a lane", () => {
    expect(manualOrderAllowed("epic", "manual")).toBe(false);
    expect(manualOrderAllowed("assignee", "manual")).toBe(false);
    expect(manualOrderAllowed("priority", "manual")).toBe(false);
    expect(manualOrderAllowed("client", "manual")).toBe(false);
    expect(manualOrderAllowed("sprint", "manual")).toBe(false);
  });
});
