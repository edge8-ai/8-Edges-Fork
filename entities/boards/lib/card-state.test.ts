import { describe, expect, it } from "vitest";
import { cardSnoozedUntil, cardStuck, isSnoozed } from "./types";

// tasks.metadata is jsonb with no constraint (W.54, W.62 both chose that
// deliberately over a migration). The readers are therefore the place where a
// malformed value is caught, and these tests are the runtime proof the house
// rule asks for: a schema literal that nothing enforces needs a test showing
// what the reader does with everything the column can actually hold.

const meta = (metadata: Record<string, unknown>) => ({ metadata });

describe("cardSnoozedUntil (W.54)", () => {
  it("reads a YYYY-MM-DD date", () => {
    expect(cardSnoozedUntil(meta({ snoozed_until: "2026-10-03" }))).toBe("2026-10-03");
  });

  it("refuses anything that is not one, so a bad value can never hide a card for good", () => {
    for (const bad of [undefined, null, "", "soon", "2026-10-3", 20261003, { d: "2026-10-03" }, ["2026-10-03"], true]) {
      expect(cardSnoozedUntil(meta({ snoozed_until: bad }))).toBeNull();
    }
  });

  it("a card with no metadata at all is not snoozed", () => {
    expect(cardSnoozedUntil(meta({}))).toBeNull();
  });
});

describe("isSnoozed", () => {
  it("is asleep before its date and awake on it", () => {
    const card = meta({ snoozed_until: "2026-10-03" });
    expect(isSnoozed(card, "2026-10-02")).toBe(true);
    // Wakes ON the day, which is how a person means "not until the 3rd".
    expect(isSnoozed(card, "2026-10-03")).toBe(false);
    expect(isSnoozed(card, "2026-10-04")).toBe(false);
  });

  it("wakes by itself: nothing has to run for the date to arrive", () => {
    const card = meta({ snoozed_until: "2026-10-03" });
    expect(isSnoozed(card, "2026-09-21")).toBe(true);
    expect(isSnoozed(card, "2026-12-01")).toBe(false);
  });
});

describe("cardStuck (W.62)", () => {
  it("reads the since and the note", () => {
    expect(cardStuck(meta({ stuck: { since: "2026-09-20T09:00:00Z", note: "waiting on the schema" } }))).toEqual({
      since: "2026-09-20T09:00:00Z",
      note: "waiting on the schema",
    });
  });

  it("an empty note is still a request: the raising is the message", () => {
    expect(cardStuck(meta({ stuck: { since: "2026-09-20T09:00:00Z" } }))).toEqual({ since: "2026-09-20T09:00:00Z", note: "" });
  });

  it("refuses a shape it cannot read rather than half-rendering it", () => {
    for (const bad of [true, "stuck", 1, [], {}, { note: "no since" }, null]) {
      expect(cardStuck(meta({ stuck: bad }))).toBeNull();
    }
  });
});
