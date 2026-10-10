import { describe, expect, it } from "vitest";
import { cardDoneSuggested } from "./card-done";

describe("cardDoneSuggested", () => {
  it("says nothing when no linked card has finished", () => {
    expect(cardDoneSuggested({ cardDoneAt: null, status: "open" })).toBe(false);
  });

  it("offers the question on every status that still has an answer to give", () => {
    for (const status of ["open", "on_track", "needs_attention", "blocked"] as const) {
      expect(cardDoneSuggested({ cardDoneAt: "2026-09-18T03:00:00Z", status })).toBe(true);
    }
  });

  it("stays quiet once the owner has answered it", () => {
    // completed is the yes; asking again would be the board arguing with the
    // person whose promise it is.
    expect(cardDoneSuggested({ cardDoneAt: "2026-09-18T03:00:00Z", status: "completed" })).toBe(false);
  });

  it("stays quiet on a promise that was dropped", () => {
    expect(cardDoneSuggested({ cardDoneAt: "2026-09-18T03:00:00Z", status: "dropped" })).toBe(false);
  });
});
