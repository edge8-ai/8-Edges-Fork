import { describe, expect, it } from "vitest";
import { daysSince, isHumanTouch, temperatureOf, type TemperatureFacts } from "./lead-temperature-rules";

const TODAY = "2026-10-26";

const base: TemperatureFacts = {
  isTeamMember: false,
  doNotContact: false,
  marketingConsent: "subscribed",
  persona: "prospect",
  atClientCompany: false,
  openDeals: [],
  lostDeals: [],
  lead: null,
  lastTouch: null,
};

describe("isHumanTouch", () => {
  it("counts calls, meetings, notes and chat", () => {
    for (const kind of ["call", "meeting", "note", "lark", "whatsapp"]) {
      expect(isHumanTouch({ kind, category: null, source: null })).toBe(true);
    }
  });
  it("never counts system rows or status changes", () => {
    expect(isHumanTouch({ kind: "system", category: null, source: null })).toBe(false);
    expect(isHumanTouch({ kind: "status_change", category: null, source: null })).toBe(false);
  });
  it("counts an email a person wrote, not a broadcast or a system email", () => {
    expect(isHumanTouch({ kind: "email", category: null, source: null })).toBe(true);
    expect(isHumanTouch({ kind: "email", category: "client", source: "crm" })).toBe(true);
    // The 2026-09-30 broadcast: kernel/messaging logs it under category marketing.
    expect(isHumanTouch({ kind: "email", category: "marketing", source: "marketing" })).toBe(false);
    expect(isHumanTouch({ kind: "email", category: null, source: "marketing_campaign" })).toBe(false);
    // A portal sign-in link.
    expect(isHumanTouch({ kind: "email", category: "account", source: "system" })).toBe(false);
  });
});

describe("temperatureOf: who is on no list", () => {
  it("keeps team, do-not-contact, unsubscribed and clients off every list, and says why", () => {
    expect(temperatureOf({ ...base, isTeamMember: true }, TODAY)).toEqual({ temperature: null, excluded: "team member" });
    expect(temperatureOf({ ...base, doNotContact: true }, TODAY)).toEqual({ temperature: null, excluded: "do not contact" });
    expect(temperatureOf({ ...base, marketingConsent: "unsubscribed" }, TODAY)).toEqual({ temperature: null, excluded: "unsubscribed" });
    expect(temperatureOf({ ...base, atClientCompany: true }, TODAY)).toEqual({ temperature: null, excluded: "client" });
    expect(temperatureOf({ ...base, atClientCompany: true, openDeals: [{ stage: "Contract Sent" }] }, TODAY)).toEqual({ temperature: null, excluded: "client with an open deal" });
    expect(temperatureOf({ ...base, persona: "client" }, TODAY)).toEqual({ temperature: null, excluded: "client" });
  });
  it("exclusion wins over every warm signal", () => {
    const warm = { ...base, openDeals: [{ stage: "Discovery" }], lastTouch: { kind: "call", at: "2026-10-25" } };
    expect(temperatureOf({ ...warm, doNotContact: true }, TODAY).temperature).toBeNull();
  });
});

describe("temperatureOf: warm", () => {
  it("an open deal, named by its stage", () => {
    expect(temperatureOf({ ...base, openDeals: [{ stage: "Contract Sent" }] }, TODAY)).toEqual({ temperature: "warm", reason: "open deal at Contract Sent" });
    expect(temperatureOf({ ...base, openDeals: [{ stage: null }] }, TODAY)).toEqual({ temperature: "warm", reason: "open deal" });
  });
  it("a lead being worked", () => {
    expect(temperatureOf({ ...base, lead: { status: "connected", disqualifiedReason: null, updatedAt: "2026-10-25" } }, TODAY)).toEqual({ temperature: "warm", reason: "lead connected" });
    expect(temperatureOf({ ...base, lead: { status: "meeting_booked", disqualifiedReason: null, updatedAt: "2026-10-25" } }, TODAY)).toEqual({ temperature: "warm", reason: "lead meeting booked" });
  });
  it("a human touch inside 90 days, even with no deal", () => {
    expect(temperatureOf({ ...base, lastTouch: { kind: "call", at: "2026-10-06T09:00:00Z" } }, TODAY)).toEqual({ temperature: "warm", reason: "call 2026-10-06" });
    expect(temperatureOf({ ...base, lastTouch: { kind: "meeting", at: "2026-07-28" } }, TODAY).temperature).toBe("warm");
  });
  it("a broadcast is not a touch, so the caller must filter it first", () => {
    // The caller passes only human touches; a person whose only touch was a
    // broadcast arrives with lastTouch null and lands on the mailing list.
    expect(temperatureOf({ ...base, lastTouch: null }, TODAY)).toEqual({ temperature: "other", reason: "subscribed, never spoken to" });
  });
});

describe("temperatureOf: gone cold", () => {
  it("a deal lost in the last year, with the reason and the age", () => {
    expect(temperatureOf({ ...base, lostDeals: [{ lostReason: "no_decision", closedAt: "2026-09-21" }] }, TODAY)).toEqual({ temperature: "cold", reason: "lost: no decision, 35 days" });
  });
  it("a deal lost more than a year ago no longer makes anyone cold", () => {
    expect(temperatureOf({ ...base, lostDeals: [{ lostReason: "ghosted", closedAt: "2025-01-01" }] }, TODAY).temperature).toBe("other");
  });
  it("a lead parked in nurture or unqualified", () => {
    expect(temperatureOf({ ...base, lead: { status: "nurture", disqualifiedReason: null, updatedAt: "2026-07-08" } }, TODAY)).toEqual({ temperature: "cold", reason: "lead nurture" });
    expect(temperatureOf({ ...base, lead: { status: "unqualified", disqualifiedReason: "bad_fit", updatedAt: "2026-07-08" } }, TODAY)).toEqual({ temperature: "cold", reason: "lead unqualified: bad fit" });
  });
  it("a human touch 90 to 365 days ago", () => {
    expect(temperatureOf({ ...base, lastTouch: { kind: "meeting", at: "2026-07-13" } }, TODAY)).toEqual({ temperature: "cold", reason: "meeting 2026-07-13, 105 days" });
  });
  it("an open deal beats a lost one, and a recent touch beats an old loss", () => {
    expect(temperatureOf({ ...base, openDeals: [{ stage: "Proposal" }], lostDeals: [{ lostReason: "competitor", closedAt: "2026-08-18" }] }, TODAY).temperature).toBe("warm");
    expect(temperatureOf({ ...base, lostDeals: [{ lostReason: "competitor", closedAt: "2026-08-18" }], lastTouch: { kind: "call", at: "2026-10-20" } }, TODAY).temperature).toBe("warm");
  });
});

describe("temperatureOf: everyone else", () => {
  it("subscribed with nothing on record, or a touch older than a year", () => {
    expect(temperatureOf(base, TODAY)).toEqual({ temperature: "other", reason: "subscribed, never spoken to" });
    expect(temperatureOf({ ...base, lastTouch: { kind: "call", at: "2025-03-01" } }, TODAY)).toEqual({ temperature: "other", reason: "subscribed; last touch 2025-03-01" });
  });
  it("never asked and nothing on record is on no list", () => {
    expect(temperatureOf({ ...base, marketingConsent: "never_asked" }, TODAY)).toEqual({ temperature: null, excluded: "no consent and nothing on record" });
  });
  it("never asked but spoken to is still warm or cold: consent gates the broadcasts, not a personal note", () => {
    expect(temperatureOf({ ...base, marketingConsent: "never_asked", lastTouch: { kind: "email", at: "2026-10-25" } }, TODAY).temperature).toBe("warm");
  });
});

describe("daysSince", () => {
  it("counts calendar days from a timestamp to today", () => {
    expect(daysSince("2026-10-06T23:59:00Z", TODAY)).toBe(20);
    expect(daysSince("2026-10-26", TODAY)).toBe(0);
  });
});
