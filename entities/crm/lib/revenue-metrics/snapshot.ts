import { companyOs } from "@/kernel/data/supabase";
import { loadPipeline } from "./pipeline";
import { loadBilling } from "./billing";
import { loadDemand } from "./demand";
import { loadTargets } from "./targets";
import { NOT_DIGEST_DAY, isDigestDay, postRevenueDigest, type DigestOutcome } from "./digest";

// One nightly reading of the figures the hub renders, so they can be charted
// over time (2026-09-13). The routine reads the same aggregates as the tabs,
// so a snapshot is by definition what the hub would have shown that night.
// Upserts on the day, so a re-run replaces rather than duplicates.
//
// On the first of the month it also posts the month-end digest to the Revenue
// Lark channel (RF-9). That is deliberately here and not on a schedule of its
// own: the figures are already loaded, and a second cron would be a second
// thing to keep in step with this one.

export type SnapshotResult =
  | { ok: true; takenOn: string; openDeals: number; openUsdCents: number; digest: DigestOutcome }
  | { ok: false; error: string };

export async function takeRevenueSnapshot(now = new Date()): Promise<SnapshotResult> {
  const [p, b, d] = await Promise.all([loadPipeline("12m", now), loadBilling("12m", now), loadDemand("3m", now)]);
  const errors = [...p.errors, ...b.errors, ...d.errors];
  // A snapshot of a half-loaded hub would be a wrong reading forever; refuse.
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  const takenOn = now.toISOString().slice(0, 10);
  const thisMonth = p.closedByMonth[p.closedByMonth.length - 1];
  // The digest reports the month that just ended, so it reads one step back on
  // both axes: the last COMPLETE month, against the one before it. The
  // snapshot row itself still records the month in progress, which is what a
  // nightly reading means.
  const wonReported = p.closedByMonth[p.closedByMonth.length - 2];
  const wonPrior = p.closedByMonth[p.closedByMonth.length - 3];
  const invReported = b.byMonth[b.byMonth.length - 2];
  const invPrior = b.byMonth[b.byMonth.length - 3];
  const last30 = d.byMonth.slice(-1)[0]?.count ?? 0;
  // The digest reports a completed month, so its inquiry count is that month's
  // too. Reading the month in progress would compare a day of arrivals against
  // a whole month's target and post "0% of 50" every single time.
  const inquiriesReported = d.byMonth[d.byMonth.length - 2]?.count ?? 0;
  const overdueCents = b.overdue.reduce((a, o) => a + o.balance, 0) * 100;
  const row = {
    taken_on: takenOn,
    open_deals: p.open,
    open_usd_cents: p.openUsd * 100,
    open_weighted_usd_cents: p.openWeightedUsd * 100,
    won_mtd_usd_cents: (thisMonth?.wonUsd ?? 0) * 100,
    receivable_cents: b.openBalance * 100,
    overdue_cents: overdueCents,
    cash_90d_cents: b.cash.total * 100,
    inquiries_30d: last30,
    by_stage: p.byStage.map((s) => ({ stage: s.stage, count: s.count, usd: s.usd })),
  };
  const { error } = await companyOs.from("revenue_snapshots").upsert(row, { onConflict: "taken_on" });
  if (error) return { ok: false, error: error.message };

  // The digest comes after the write and never before it: a message quoting a
  // reading that failed to save would outlive the reading. A digest that does
  // not go out is reported in the result, not thrown — the snapshot succeeded.
  // The day check comes first, so thirty nights in thirty-one neither read the
  // targets nor report a targets failure as the reason a digest did not go out.
  const done = { ok: true as const, takenOn, openDeals: p.open, openUsdCents: row.open_usd_cents };
  if (!isDigestDay(now)) return { ...done, digest: { posted: false, reason: NOT_DIGEST_DAY } };
  const targets = await loadTargets();
  // A failed targets read would post "no target set" to a company channel,
  // which reads as a decision nobody made rather than as a broken query. The
  // digest is skipped instead, and the result says so.
  if (targets.errors.length > 0) {
    return { ...done, digest: { posted: false, reason: `targets unavailable: ${targets.errors.join("; ")}` } };
  }
  const digest = await postRevenueDigest(
    {
      invoicedUsd: invReported?.amount ?? 0,
      invoicedPriorUsd: invPrior?.amount ?? 0,
      recurringUsd: invReported?.recurring ?? 0,
      recurringPriorUsd: invPrior?.recurring ?? 0,
      wonUsd: wonReported?.wonUsd ?? 0,
      wonPriorUsd: wonPrior?.wonUsd ?? 0,
      openPipelineUsd: p.openUsd,
      openWeightedUsd: p.openWeightedUsd,
      openDeals: p.open,
      receivableUsd: b.openBalance,
      overdueUsd: Math.round(overdueCents / 100),
      cash90Usd: b.cash.total,
      inquiries30: inquiriesReported,
    },
    targets.rows,
    now,
  );
  return { ...done, digest };
}
