import { describe, expect, it } from "vitest";
import { pickCompletedSince, MOVED_CARDS_LIMIT } from "./moved-cards";

const card = (id: string, title: string | null, completedAt: string | null) => ({
  id,
  title,
  completed_at: completedAt,
});

describe("pickCompletedSince", () => {
  it("keeps cards completed on or after the day of the last held 1-1", () => {
    const rows = [
      card("a", "Shipped the invoice export", "2026-09-16T04:00:00Z"),
      card("b", "Old thing already discussed", "2026-09-01T04:00:00Z"),
      card("c", "Closed on the day itself", "2026-09-10T23:00:00Z"),
    ];
    expect(pickCompletedSince(rows, "2026-09-10")).toEqual([
      "Shipped the invoice export",
      "Closed on the day itself",
    ]);
  });

  it("returns the newest cards first when no 1-1 has been held yet", () => {
    const rows = [card("a", "First", "2026-09-01T00:00:00Z"), card("b", "Second", "2026-09-05T00:00:00Z")];
    expect(pickCompletedSince(rows, null)).toEqual(["Second", "First"]);
  });

  it("drops a card with no completion date once there is a cut-off", () => {
    const rows = [card("a", "Undated", null), card("b", "Dated", "2026-09-12T00:00:00Z")];
    expect(pickCompletedSince(rows, "2026-09-10")).toEqual(["Dated"]);
    expect(pickCompletedSince(rows, null)).toEqual(["Dated", "Undated"]);
  });

  it("ignores a card with no usable title and trims the rest", () => {
    const rows = [card("a", "   ", "2026-09-12T00:00:00Z"), card("b", "  Kept  ", "2026-09-11T00:00:00Z"), card("c", null, "2026-09-13T00:00:00Z")];
    expect(pickCompletedSince(rows, "2026-09-10")).toEqual(["Kept"]);
  });

  it("caps the draft so it stays a prompt rather than a page", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      card(`c${i}`, `Card ${i}`, `2026-09-${String(10 + (i % 20)).padStart(2, "0")}T00:00:00Z`),
    );
    expect(pickCompletedSince(rows, null)).toHaveLength(MOVED_CARDS_LIMIT);
  });
});
