import { describe, expect, it } from "vitest";
import { capReason, startOfCompanyDay } from "./send-cap";

// 09:00 in Ho Chi Minh City on 18 September 2026 is 02:00 UTC.
const now = new Date("2026-09-18T02:00:00Z");

describe("capReason, personal", () => {
  it("lets a personal email go when nothing else went or goes today", () => {
    expect(capReason("personal", { sentAt: ["2026-09-17T01:00:00Z"], pendingBroadcast: [] }, now)).toBeNull();
  });
  it("holds when a broadcast or a personal email already went today, in company time", () => {
    // 18:30 UTC on the 17th is 01:30 on the 18th in company time: today.
    expect(capReason("personal", { sentAt: ["2026-09-17T18:30:00Z"], pendingBroadcast: [] }, now)).toBe("emailed today");
  });
  it("yields to a broadcast that goes to the person today", () => {
    expect(capReason("personal", { sentAt: [], pendingBroadcast: [{ sendAfter: "2026-09-18T03:00:00Z" }] }, now)).toBe("a broadcast goes to them today");
    expect(capReason("personal", { sentAt: [], pendingBroadcast: [{ sendAfter: null }] }, now)).toBe("a broadcast goes to them today");
  });
  it("does not yield to a broadcast that goes tomorrow", () => {
    expect(capReason("personal", { sentAt: [], pendingBroadcast: [{ sendAfter: "2026-09-19T01:00:00Z" }] }, now)).toBeNull();
  });
});

describe("capReason, broadcast", () => {
  // The half that did not exist before A.15: the broadcast cron never asked,
  // so a personal message sent at 08:20 did not stop a broadcast at 08:30.
  it("holds a broadcast when a personal message already went to them today", () => {
    expect(capReason("broadcast", { sentAt: ["2026-09-17T18:30:00Z"], pendingBroadcast: [] }, now)).toBe("emailed today");
  });
  it("holds a broadcast when another broadcast already went to them today", () => {
    expect(capReason("broadcast", { sentAt: ["2026-09-18T01:00:00Z"], pendingBroadcast: [] }, now)).toBe("emailed today");
  });
  it("lets a broadcast go when nothing went today", () => {
    expect(capReason("broadcast", { sentAt: ["2026-09-17T01:00:00Z"], pendingBroadcast: [] }, now)).toBeNull();
  });
  it("does NOT yield to a pending broadcast — the batch it is in is that broadcast", () => {
    // If this yielded, every campaign would defer itself forever: its own
    // recipient rows are the pending broadcast the evidence reports.
    expect(capReason("broadcast", { sentAt: [], pendingBroadcast: [{ sendAfter: null }] }, now)).toBeNull();
    expect(capReason("broadcast", { sentAt: [], pendingBroadcast: [{ sendAfter: "2026-09-18T03:00:00Z" }] }, now)).toBeNull();
  });
});

describe("the invariant the cron claims", () => {
  // "one marketing email per person per company day across both kinds".
  // Whichever kind sends first, the other is held for the rest of the day.
  const sentToday = ["2026-09-18T01:00:00Z"];
  it("holds in both directions once anything has been sent today", () => {
    expect(capReason("broadcast", { sentAt: sentToday, pendingBroadcast: [] }, now)).toBe("emailed today");
    expect(capReason("personal", { sentAt: sentToday, pendingBroadcast: [] }, now)).toBe("emailed today");
  });
});

describe("startOfCompanyDay", () => {
  it("is midnight in Ho Chi Minh City, 17:00 UTC the evening before", () => {
    expect(startOfCompanyDay(now).toISOString()).toBe("2026-09-17T17:00:00.000Z");
  });
});
