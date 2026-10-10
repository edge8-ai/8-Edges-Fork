import { describe, expect, it } from "vitest";
import { tickForRequest, tickKeyFor } from "@/kernel/audit/routine-tick";

// A cron's tick is the schedule slot the invocation belongs to: the latest
// slot of its cron expression at or before now, in UTC, formatted by cadence.
// A late fire maps to its own slot, not the next one, so a retry of a slow
// delivery and the delivery itself claim the same tick and only one runs.

const at = (iso: string) => new Date(iso);

describe("tickKeyFor", () => {
  it("names a daily cron's slot by its date", () => {
    expect(tickKeyFor("45 0 * * *", at("2026-09-28T00:50:00Z"))).toBe("2026-09-28");
  });

  it("maps a late fire to the slot it belongs to, not the next one", () => {
    // 23:00 slot on the 27th, delivered after midnight.
    expect(tickKeyFor("0 23 * * *", at("2026-09-28T00:10:00Z"))).toBe("2026-09-27");
  });

  it("names an hourly cron's slot by its hour", () => {
    expect(tickKeyFor("30 * * * *", at("2026-09-28T10:35:00Z"))).toBe("2026-09-28T10");
    expect(tickKeyFor("30 * * * *", at("2026-09-28T10:10:00Z"))).toBe("2026-09-28T09");
  });

  it("names a cron that fires more than hourly by its minute", () => {
    expect(tickKeyFor("*/15 * * * *", at("2026-09-28T10:37:12Z"))).toBe("2026-09-28T10:30");
    expect(tickKeyFor("5,20,35,50 * * * *", at("2026-09-28T10:30:00Z"))).toBe("2026-09-28T10:20");
  });

  it("names a once-a-week cron by its ISO week", () => {
    // Monday 28 September 2026 is in ISO week 40.
    expect(tickKeyFor("0 1 * * 1", at("2026-09-28T01:05:00Z"))).toBe("2026-W40");
    expect(tickKeyFor("0 1 * * 1", at("2026-09-28T00:30:00Z"))).toBe("2026-W39");
  });

  it("names a weekday or twice-weekly cron by its date", () => {
    // Saturday 3 October: the latest weekday slot is Friday's.
    expect(tickKeyFor("0 2 * * 1-5", at("2026-10-03T03:00:00Z"))).toBe("2026-10-02");
    expect(tickKeyFor("0 0 * * 1,4", at("2026-10-03T03:00:00Z"))).toBe("2026-10-01");
  });

  it("names a monthly cron by the date of its slot", () => {
    expect(tickKeyFor("0 6 1 * *", at("2026-09-28T12:00:00Z"))).toBe("2026-09-01");
  });

  it("returns null for an expression it cannot read", () => {
    expect(tickKeyFor("every day", at("2026-09-28T12:00:00Z"))).toBeNull();
    expect(tickKeyFor("0 25 * * *", at("2026-09-28T12:00:00Z"))).toBeNull();
  });
});

describe("tickForRequest", () => {
  const url = "https://example.test/api/cron/htt-refresh-summaries/";
  const routine = "/api/cron/htt-refresh-summaries/";
  // What Vercel Cron sends (Vercel docs, "Managing Cron Jobs"): a GET whose
  // x-vercel-cron-schedule header names the expression that fired it.
  const delivery = (method = "GET") =>
    new Request(url, { method, headers: { "x-vercel-cron-schedule": "40 23 * * *", "user-agent": "vercel-cron/1.0" } });
  // Everything else with the bearer: the runbook's curl, the Mac mini's
  // in-process call to the route's GET, a manual POST.
  const byHand = (method = "GET") => new Request(url, { method, headers: { authorization: "Bearer x" } });
  const now = at("2026-09-29T02:00:00Z");
  const fresh = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("keys Vercel Cron's delivery, a GET or the HEAD Next answers with it, by the slot", () => {
    expect(tickForRequest(routine, delivery("GET"), now)).toBe("2026-09-28");
    expect(tickForRequest(routine, delivery("HEAD"), now)).toBe("2026-09-28");
  });

  it("gives a GET without Vercel's schedule header a fresh tick each time, so a run by hand is never refused", () => {
    const a = tickForRequest(routine, byHand("GET"), now);
    const b = tickForRequest(routine, byHand("GET"), now);
    expect(a).toMatch(fresh);
    expect(b).toMatch(fresh);
    expect(a).not.toBe(b);
  });

  it("gives a manual POST to the same scheduled route a fresh tick each time", () => {
    const a = tickForRequest(routine, byHand("POST"), now);
    const b = tickForRequest(routine, byHand("POST"), now);
    expect(a).toMatch(fresh);
    expect(a).not.toBe(b);
  });
});
