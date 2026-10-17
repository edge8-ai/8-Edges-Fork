import { describe, expect, it } from "vitest";
import { latestWords } from "./roster-signals";

// The home card leads with the person's own latest words (K.82).
const checkin = (o: Partial<{ moved_md: string | null; stuck_md: string | null; talk_md: string | null }>) => ({
  responded_at: "2026-10-05T09:00:00Z",
  moved_md: null,
  stuck_md: null,
  talk_md: null,
  ...o,
});

describe("latestWords", () => {
  it("prefers what they want to talk about, then what moved, then what is stuck", () => {
    expect(latestWords(checkin({ talk_md: "Lead the cutover?", moved_md: "Tests pass" }), null)).toEqual(
      expect.objectContaining({ text: "Lead the cutover?", label: "wants to talk about", source: "check-in", on: "2026-10-05" }),
    );
    expect(latestWords(checkin({ moved_md: "Tests pass", stuck_md: "Quan away" }), null)?.label).toBe("what moved");
    expect(latestWords(checkin({ stuck_md: "Quan away" }), null)?.label).toBe("stuck on");
  });

  it("falls back to the last session's note, first line, without markdown", () => {
    expect(latestWords(null, { held_on: "2026-09-24", shared_summary_markdown: "\n- **Agreed** the cutover date\n- More" })).toEqual(
      expect.objectContaining({ text: "Agreed the cutover date", source: "note", on: "2026-09-24" }),
    );
  });

  it("uses the note when the check-in has nothing written, and says nothing when neither exists", () => {
    expect(latestWords(checkin({}), { held_on: "2026-09-24", shared_summary_markdown: "Good week." })?.source).toBe("note");
    expect(latestWords(null, null)).toBeNull();
  });

  it("cuts a long line to a card's length", () => {
    const text = latestWords(checkin({ talk_md: "x".repeat(300) }), null)?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(140);
    expect(text.endsWith("…")).toBe(true);
  });
});
