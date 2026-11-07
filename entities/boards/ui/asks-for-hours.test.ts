import { describe, expect, it } from "vitest";
import { asksForHours } from "./useWorkboardDrag";

// The Contractors board's hours prompt opens for the contractor dragging their
// own request's card into Done, and for nobody and nothing else.
const card = (assignee_id: string | null, subject_type: string | null = "contractor_work_request") => ({ subject_type, assignee_id });

describe("asksForHours", () => {
  it("asks the assigned contractor moving their request's card into Done", () => {
    expect(asksForHours(card("ginny"), true, "ginny")).toBe(true);
  });

  it("does not ask for a move into any other lane", () => {
    expect(asksForHours(card("ginny"), false, "ginny")).toBe(false);
  });

  it("does not ask anyone but the assignee, an admin included", () => {
    expect(asksForHours(card("ginny"), true, "dave")).toBe(false);
    expect(asksForHours(card(null), true, null)).toBe(false);
  });

  it("does not ask for a card that is not a work request", () => {
    expect(asksForHours(card("ginny", null), true, "ginny")).toBe(false);
    expect(asksForHours(card("ginny", "coaching_commitment"), true, "ginny")).toBe(false);
  });
});
