// The payment run's calendar and arithmetic (design §1.7), pure: which days
// are run days, where a run's cut-off falls, and what a run pays each person.
// The cron, the payer's "Build the run" action and the run pages all ask these,
// so the cut-off a claim is judged by is written once.
//
// Client-safe: no import reaches the server.

/** The days a run is built on: the 1st and the 15th of every month. */
export function isRunDay(date: string): boolean {
  return /^\d{4}-\d{2}-(01|15)$/.test(date);
}

/**
 * The run's cut-off: 00:00 Asia/Ho_Chi_Minh on its own date, as a UTC instant.
 * A claim approved before it is in the run; one approved after it waits for the
 * next. Vietnam keeps UTC+7 all year, so the offset is fixed.
 */
export function cutoffOf(runDate: string): string {
  return new Date(`${runDate}T00:00:00+07:00`).toISOString();
}

/** The run date a payer most likely means on `today` (a Vietnam date): today on a run day, else the last 1st or 15th. */
export function latestRunDate(today: string): string {
  const day = Number(today.slice(8, 10));
  return `${today.slice(0, 8)}${day >= 15 ? "15" : "01"}`;
}

/** What the payer's "Build the run" button hears back. */
export type BuildAnswerView = { ok: true; built: boolean; message: string; runId: string | null } | { ok: false; error: string };

/** One claim in a run, as the run's arithmetic sees it. */
export type RunClaim = { id: string; personId: string; approvedTotalVnd: number };

/** One transfer to make: a person, their claims in the run, and the sum of the totals frozen at approval. */
export type PaymentGroup = { personId: string; claimIds: string[]; amountVnd: number };

/** A run's claims grouped by person, in the order each person first appears. The run never recomputes a total. */
export function paymentsOf(claims: RunClaim[]): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();
  for (const c of claims) {
    const g = groups.get(c.personId) ?? { personId: c.personId, claimIds: [], amountVnd: 0 };
    g.claimIds.push(c.id);
    g.amountVnd += c.approvedTotalVnd;
    groups.set(c.personId, g);
  }
  return [...groups.values()];
}

/** The run row's counts, as its columns are named. */
export function runTotalsOf(claims: { personId: string; approvedTotalVnd: number }[]): { claims_count: number; people_count: number; total_vnd: number } {
  return {
    claims_count: claims.length,
    people_count: new Set(claims.map((c) => c.personId)).size,
    total_vnd: claims.reduce((sum, c) => sum + c.approvedTotalVnd, 0),
  };
}
