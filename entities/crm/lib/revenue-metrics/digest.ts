import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyMarketing } from "@/kernel/messaging/lark";
import { formatValue } from "@/kernel/ui/dash/ticks";
import { periodLabelOf, targetFor, MONEY_METRICS, TARGET_LABELS, type TargetMetric, type TargetRow } from "./targets";
import { pctDelta } from "./shared";

// The month-end revenue digest (RF-9, 2026-09-14): the Overview's money strip,
// posted to the Revenue channel on the first of the month by the routine that
// already takes the nightly snapshot. No second schedule to keep, and no
// second set of figures — the numbers are the ones the snapshot just wrote.
//
// The month it REPORTS is the month that just ended, not the one that began
// hours ago. Posting "October" on 1 October with a day of data in it would be
// the most confusing message the hub could send, so `reportedMonth` steps back
// one month from `now` and every label in the message follows it.
//
// Everything here describes the business. There is no name in this message and
// no per-person figure, and the builder's input type has nowhere to put one.

// The first day of the month before `now`: the month the digest reports on.
export const reportedMonth = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

export type DigestFigures = {
  invoicedUsd: number;
  invoicedPriorUsd: number;
  recurringUsd: number;
  recurringPriorUsd: number;
  wonUsd: number;
  wonPriorUsd: number;
  openPipelineUsd: number;
  openWeightedUsd: number;
  openDeals: number;
  receivableUsd: number;
  overdueUsd: number;
  cash90Usd: number;
  inquiries30: number;
};

// The hub's own dollar compaction, so a figure reads the same in the chat as
// it does on the tile it came from. `formatValue` is the kernel's, shared with
// every chart axis; a second ladder here is how two "$88.1k" quietly become
// "$88.1k" and "$88k".
const money = (n: number): string => formatValue("usd", n);

// The change against last month. `pctDelta` returns null exactly when the
// prior figure was zero or less, in which case a percentage would be infinite
// or meaningless — so the message says there was no figure to compare against
// rather than printing "▲ ∞%".
function delta(current: number, prior: number, priorLabel: string): string {
  const d = pctDelta(current, prior);
  if (d == null) return `no ${priorLabel} figure`;
  if (d === 0) return `flat vs ${priorLabel}`;
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}% vs ${priorLabel}`;
}

// One "against target" clause per metric the digest has an ACTUAL for. A
// metric with a target but no figure — meetings held, which nothing in the
// snapshot measures — is left out entirely rather than reported as 0% of it,
// which would be a false figure wearing the same clothes as a real one. A
// metric with an actual but no target is named as having none, so a blank
// target reads as a decision not yet made rather than as silence.
function againstTarget(rows: TargetRow[], month: Date, actual: Partial<Record<TargetMetric, number>>): string {
  const measured = (Object.keys(actual) as TargetMetric[]).filter((m) => typeof actual[m] === "number");
  const parts = measured.map((metric) => {
    // The target of the month being reported, not of the month just begun.
    const t = targetFor(rows, metric, "month", month);
    const label = TARGET_LABELS[metric].replace(" (USD)", "").toLowerCase();
    if (!t || t.amount <= 0) return `${label} no target set`;
    const isMoney = MONEY_METRICS.has(metric);
    const shown = isMoney ? money(t.amount) : String(t.amount);
    return `${label} ${Math.round((100 * (actual[metric] as number)) / t.amount)}% of ${shown}`;
  });
  return `Against target: ${parts.join(" · ")}.`;
}

/**
 * The message, as plain text for a Lark webhook. Pure, so what gets posted is
 * exactly what the test pins.
 */
export function buildRevenueDigest(f: DigestFigures, targets: TargetRow[], now: Date, origin: string): string {
  const month = reportedMonth(now);
  const monthLabel = periodLabelOf("month", month);
  const priorLabel = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const lines = [
    `8E Revenue · ${monthLabel}`,
    "",
    `Invoiced ${money(f.invoicedUsd)} · ${delta(f.invoicedUsd, f.invoicedPriorUsd, priorLabel)}`,
    `Recurring ${money(f.recurringUsd)} · ${delta(f.recurringUsd, f.recurringPriorUsd, priorLabel)}`,
    `Won ${money(f.wonUsd)} · ${delta(f.wonUsd, f.wonPriorUsd, priorLabel)}`,
    `Open pipeline ${money(f.openPipelineUsd)} · ${f.openDeals} deals · ${money(f.openWeightedUsd)} weighted`,
    `Receivable ${money(f.receivableUsd)} · ${money(f.overdueUsd)} past due`,
    `Cash in · next 90 days ${money(f.cash90Usd)} forecast`,
    "",
    // No `meetings` figure: nothing in the nightly snapshot counts meetings
    // held, and reporting 0% of a meetings target would be a lie the reader
    // cannot tell from a real number.
    againstTarget(targets, month, { won_usd: f.wonUsd, invoiced_usd: f.invoicedUsd, inquiries: f.inquiries30 }),
    "",
    `Open the Revenue hub → ${origin}/admin/revenue`,
  ];
  return lines.join("\n");
}

/** The digest is a month-end summary, so it posts on the first and only then. */
export const isDigestDay = (now: Date): boolean => now.getUTCDate() === 1;

/** Why no digest went out on an ordinary night: by design, not a failure. */
export const NOT_DIGEST_DAY = "not the first of the month";

export type DigestOutcome = { posted: false; reason: string } | { posted: true };

/**
 * Post the digest when it is the first of the month. A webhook that is not
 * configured, or that rejects the message, is reported rather than thrown: the
 * snapshot behind it has already succeeded and must not be undone by a chat.
 */
export async function postRevenueDigest(f: DigestFigures, targets: TargetRow[], now: Date): Promise<DigestOutcome> {
  if (!isDigestDay(now)) return { posted: false, reason: NOT_DIGEST_DAY };
  const ok = await notifyMarketing(buildRevenueDigest(f, targets, now, await getSiteOrigin()));
  return ok ? { posted: true } : { posted: false, reason: "Lark did not accept the message (webhook unset or rejected)" };
}
