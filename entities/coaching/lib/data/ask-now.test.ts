import { describe, expect, it } from "vitest";
import { canAskNow } from "./ask-now";

// The once-per-card-per-day rule (K.22). The day that counts is the Saigon
// calendar day, because that is the day the member clicking is living in.
describe("canAskNow", () => {
  it("allows the first ask on a card", () => {
    expect(canAskNow({ askNowSentAt: null, todayISO: "2026-09-17" })).toBe(true);
  });

  it("refuses a second ask on the same Saigon day", () => {
    // 02:00Z on the 17th is 09:00 Saigon on the 17th.
    expect(canAskNow({ askNowSentAt: "2026-09-17T02:00:00Z", todayISO: "2026-09-17" })).toBe(false);
  });

  it("allows the ask again the next day", () => {
    expect(canAskNow({ askNowSentAt: "2026-09-16T02:00:00Z", todayISO: "2026-09-17" })).toBe(true);
  });

  it("counts a late-evening UTC stamp as the next Saigon day", () => {
    // 18:00Z on the 16th is 01:00 Saigon on the 17th, so the card has already
    // been asked about "today" even though the UTC date says yesterday.
    expect(canAskNow({ askNowSentAt: "2026-09-16T18:00:00Z", todayISO: "2026-09-17" })).toBe(false);
  });

  it("treats a stamp from an earlier Saigon day as spent", () => {
    // 16:00Z on the 16th is 23:00 Saigon on the 16th — yesterday, so the member
    // may ask once more.
    expect(canAskNow({ askNowSentAt: "2026-09-16T16:00:00Z", todayISO: "2026-09-17" })).toBe(true);
  });
});
