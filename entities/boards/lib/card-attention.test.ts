import { describe, expect, it } from "vitest";
import { isBlocked, needsAttention } from "./card-attention";

// W.121. The Flow tiles link to the board's Attention filter, so the rules
// behind "Blocked: 5" and "Overdue: 3" must be the ones the filter applies.

const TODAY = "2026-09-23";
const card = (over: Partial<{ status: string; due_date: string | null; blockers: { resolved: boolean }[] }> = {}) => ({
  status: "open",
  due_date: null as string | null,
  blockers: [] as { resolved: boolean }[],
  ...over,
});

describe("isBlocked", () => {
  it("counts an open card with an unresolved blocker", () => {
    expect(isBlocked(card({ blockers: [{ resolved: true }, { resolved: false }] }))).toBe(true);
    expect(isBlocked(card({ blockers: [{ resolved: true }] }))).toBe(false);
    expect(isBlocked(card())).toBe(false);
  });

  it("never counts a finished card", () => {
    expect(isBlocked(card({ status: "done", blockers: [{ resolved: false }] }))).toBe(false);
  });
});

describe("needsAttention", () => {
  const blocked = card({ blockers: [{ resolved: false }] });
  const overdue = card({ due_date: "2026-09-01" });
  const calm = card({ due_date: "2026-10-01" });

  it("keeps every card when nothing is chosen", () => {
    expect([blocked, overdue, calm].every((c) => needsAttention(c, [], TODAY))).toBe(true);
  });

  it("keeps the cards of the one kind chosen", () => {
    expect([blocked, overdue, calm].map((c) => needsAttention(c, ["blocked"], TODAY))).toEqual([true, false, false]);
    expect([blocked, overdue, calm].map((c) => needsAttention(c, ["overdue"], TODAY))).toEqual([false, true, false]);
  });

  it("reads two kinds as either, like any other picker", () => {
    expect([blocked, overdue, calm].map((c) => needsAttention(c, ["blocked", "overdue"], TODAY))).toEqual([true, true, false]);
  });
});
