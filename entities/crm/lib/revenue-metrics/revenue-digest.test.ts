import { describe, expect, it } from "vitest";
import { buildRevenueDigest, isDigestDay, reportedMonth, type DigestFigures } from "./digest";
import { aggregateCollections, chaseTone, CHASE_STALE_DAYS, type ChaseRow } from "./collections";
import type { OverdueRow } from "./billing";
import { periodLabelOf, periodProgress, periodStart, type TargetRow } from "./targets";

// RF-9 and RF-5. Both are about saying the true thing when the data is thin:
// a digest posted on the first must report the month that ENDED, and an
// invoice nobody has chased must look worse than one chased last week.

const FIRST_OF_OCTOBER = new Date("2026-10-01T00:30:00Z");

const figures = (o: Partial<DigestFigures> = {}): DigestFigures => ({
  invoicedUsd: 88_100, invoicedPriorUsd: 108_800, recurringUsd: 73_100, recurringPriorUsd: 70_200,
  wonUsd: 5_000, wonPriorUsd: 41_000, openPipelineUsd: 800_000, openWeightedUsd: 49_000, openDeals: 12,
  receivableUsd: 51_900, overdueUsd: 5_200, cash90Usd: 318_000, inquiries30: 77, ...o,
});

const target = (metric: string, amount: number, periodStart: string): TargetRow => ({
  id: metric, metric, period_kind: "month", period_start: periodStart, amount, note: null, updated_at: "",
});

describe("RF-9 · when the digest goes out", () => {
  it("posts on the first of the month and on no other day", () => {
    expect(isDigestDay(FIRST_OF_OCTOBER)).toBe(true);
    expect(isDigestDay(new Date("2026-10-02T00:30:00Z"))).toBe(false);
    expect(isDigestDay(new Date("2026-09-30T23:30:00Z"))).toBe(false);
  });

  it("reports the month that ended, not the one that began hours ago", () => {
    expect(reportedMonth(FIRST_OF_OCTOBER).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(buildRevenueDigest(figures(), [], FIRST_OF_OCTOBER, "https://x")).toContain("8E Revenue · September 2026");
  });

  it("steps back across a year boundary", () => {
    expect(reportedMonth(new Date("2027-01-01T00:30:00Z")).toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(buildRevenueDigest(figures(), [], new Date("2027-01-01T00:30:00Z"), "https://x")).toContain("December 2026");
  });
});

describe("RF-9 · what the digest says", () => {
  const build = (f = figures(), targets: TargetRow[] = []) => buildRevenueDigest(f, targets, FIRST_OF_OCTOBER, "https://example.test");

  it("names the six figures with their deltas against the month before", () => {
    const text = build();
    expect(text).toContain("Invoiced $88.1k · ▼ 19% vs Aug");
    expect(text).toContain("Recurring $73.1k · ▲ 4% vs Aug");
    expect(text).toContain("Won $5.0k · ▼ 88% vs Aug");
    expect(text).toContain("Open pipeline $800k · 12 deals · $49.0k weighted");
    expect(text).toContain("Receivable $51.9k · $5.2k past due");
    expect(text).toContain("Cash in · next 90 days $318k forecast");
  });

  it("links the hub", () => {
    expect(build()).toContain("https://example.test/admin/revenue");
  });

  it("names the prior figure instead of an impossible percentage when there was nothing to compare", () => {
    const text = build(figures({ wonUsd: 5_000, wonPriorUsd: 0 }));
    expect(text).toContain("Won $5.0k · no Aug figure");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("NaN");
  });

  it("says flat rather than an arrow with a zero", () => {
    expect(build(figures({ wonUsd: 100, wonPriorUsd: 100 }))).toContain("Won $100 · flat vs Aug");
  });

  it("reads the target of the month it reports, not of the month just begun", () => {
    const text = build(figures(), [target("invoiced_usd", 100_000, "2026-09-01"), target("invoiced_usd", 999_999, "2026-10-01")]);
    expect(text).toContain("invoiced 88% of $100k");
    expect(text).not.toContain("999");
  });

  it("says a target is not set rather than dropping the metric or printing NaN", () => {
    const text = build(figures(), []);
    expect(text).toContain("won no target set");
    expect(text).toContain("invoiced no target set");
    expect(text).not.toContain("NaN");
  });

  it("carries no person's name and no per-person figure", () => {
    const text = build(figures(), [target("won_usd", 150_000, "2026-09-01")]);
    for (const word of ["owner", "assignee", "rep", "by "]) expect(text.toLowerCase()).not.toContain(word);
  });

  it("leaves out a metric it has no actual for, rather than reporting 0% of its target", () => {
    // `meetings` is a settable target and nothing in the snapshot counts
    // meetings held; "meetings held 0% of 20" would be a false figure wearing
    // the same clothes as a real one.
    const text = build(figures(), [target("meetings", 20, "2026-09-01"), target("won_usd", 150_000, "2026-09-01")]);
    expect(text).not.toContain("meetings");
    expect(text).toContain("won 3% of $150k");
  });
});

describe("RF-6 · target periods", () => {
  it("starts each period on the right day, in every quarter", () => {
    for (const [iso, q] of [["2026-01-15", "2026-01-01"], ["2026-04-01", "2026-04-01"], ["2026-08-31", "2026-07-01"], ["2026-12-31", "2026-10-01"]] as const) {
      expect(periodStart("quarter", new Date(`${iso}T12:00:00Z`))).toBe(q);
    }
    expect(periodStart("month", new Date("2026-08-31T12:00:00Z"))).toBe("2026-08-01");
    expect(periodStart("year", new Date("2026-08-31T12:00:00Z"))).toBe("2026-01-01");
  });

  it("reads a year boundary as the new period, not the old one", () => {
    const justAfter = new Date("2027-01-01T00:00:01Z");
    expect(periodStart("year", justAfter)).toBe("2027-01-01");
    expect(periodStart("quarter", justAfter)).toBe("2027-01-01");
    expect(periodProgress("year", justAfter)).toBeLessThan(0.001);
    expect(periodProgress("quarter", justAfter)).toBeLessThan(0.002);
  });

  it("measures progress through a leap February as a whole month, not 28 days of one", () => {
    // 2028 is a leap year: 29 February is the LAST day, so the month is
    // essentially over. A 28-day divisor would report progress above 1.
    const leapEnd = new Date("2028-02-29T12:00:00Z");
    const p = periodProgress("month", leapEnd);
    expect(p).toBeGreaterThan(0.9);
    expect(p).toBeLessThanOrEqual(1);
    expect(periodStart("month", leapEnd)).toBe("2028-02-01");
  });

  it("keeps progress inside 0..1 for every kind, at the first instant and the last", () => {
    for (const kind of ["month", "quarter", "year"] as const) {
      for (const iso of ["2026-01-01T00:00:00Z", "2026-06-15T12:00:00Z", "2026-12-31T23:59:59Z"]) {
        const p = periodProgress(kind, new Date(iso));
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("names each period the way the tiles say it", () => {
    const d = new Date("2026-11-14T12:00:00Z");
    expect(periodLabelOf("month", d)).toBe("November 2026");
    expect(periodLabelOf("quarter", d)).toBe("Q4 2026");
    expect(periodLabelOf("year", d)).toBe("2026");
  });
});

describe("RF-5 · the collections queue", () => {
  const NOW = new Date("2026-09-14T12:00:00Z");
  const overdue = (o: Partial<OverdueRow> & { id: string }): OverdueRow => ({
    companyId: "c1", docNumber: "1001", customer: "Acme", balance: 500, dueDate: "2026-08-01", daysOverdue: 44, ...o,
  });
  const chase = (o: Partial<ChaseRow> = {}): ChaseRow => ({ company_id: "c1", occurred_at: "2026-09-10T00:00:00Z", body: "Client promised payment", subject: "call", metadata: { channel: "call" }, ...o });

  it("marks an invoice nobody has ever chased as the worst case", () => {
    expect(chaseTone(null, NOW)).toBe("err");
  });

  it("marks a stale chase amber and a recent one not at all", () => {
    expect(chaseTone("2026-08-01T00:00:00Z", NOW)).toBe("warn");
    expect(chaseTone("2026-09-10T00:00:00Z", NOW)).toBeUndefined();
  });

  it("treats a chase exactly on the boundary as still fresh", () => {
    const boundary = new Date(NOW.getTime() - CHASE_STALE_DAYS * 86_400_000).toISOString();
    expect(chaseTone(boundary, NOW)).toBeUndefined();
  });

  it("reads the latest chase back onto the row regardless of the order it arrives in", () => {
    const c = aggregateCollections([overdue({ id: "i1" })], [chase({ occurred_at: "2026-06-01T00:00:00Z", body: "old" }), chase({ occurred_at: "2026-09-10T00:00:00Z", body: "new" })], NOW);
    expect(c.rows[0].nextStep).toBe("new");
    expect(c.rows[0].daysSinceChase).toBe(4);
  });

  it("does not let one client's chase colour another client's invoice", () => {
    const c = aggregateCollections([overdue({ id: "i1", companyId: "c1" }), overdue({ id: "i2", companyId: "c2" })], [chase({ company_id: "c1" })], NOW);
    expect(c.rows[0].tone).toBeUndefined();
    expect(c.rows[1].tone).toBe("err");
    expect(c.neverChased).toBe(1);
  });

  it("leaves an invoice with no mapped client un-chased rather than matching it to nothing", () => {
    const c = aggregateCollections([overdue({ id: "i1", companyId: null })], [chase({ company_id: null })], NOW);
    expect(c.rows[0].lastChasedAt).toBeNull();
    expect(c.rows[0].tone).toBe("err");
  });

  it("counts nothing when nothing is overdue", () => {
    const c = aggregateCollections([], [chase()], NOW);
    expect(c.rows).toEqual([]);
    expect(c.neverChased).toBe(0);
    expect(c.stale).toBe(0);
  });

  it("exposes no person on any row", () => {
    const c = aggregateCollections([overdue({ id: "i1" })], [chase()], NOW);
    const keys = Object.keys(c.rows[0]);
    for (const banned of ["ownerId", "owner_id", "personId", "assignee", "chasedBy"]) expect(keys).not.toContain(banned);
  });
});
