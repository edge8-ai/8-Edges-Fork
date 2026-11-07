import { z } from "zod";

// Account health (S.6): what a client account's four company-level signals
// add up to. Pure, so the rule is tested without a database and the nightly
// routine and the screen can never disagree about what a reading means.
//
// Every signal describes the COMPANY — when we last met it, what it owes, how
// its roadmap is moving, whether its people use the portal. None is sliced by
// who owns the account, because a metric describes the work or the client
// outcome and never a person.
//
// A null signal is one that could not be computed (no roadmap to move, no
// portal members to sign in), and it costs nothing: an account is not marked
// down for a thing it does not have. "Never" is not null. An account nobody has
// ever met, or whose portal members have never signed in, is the worst case of
// that signal, so it carries its own flag rather than hiding behind a null.

export const healthSignalsSchema = z.object({
  /** Whole days since the most recent past meeting; null when there is none. */
  daysSinceMeeting: z.number().int().nullable(),
  /** No meeting with this company has ever been recorded. */
  neverMet: z.boolean(),
  /** Invoices past due with a balance still owed, voided ones excluded. */
  overdueInvoices: z.number().int().nullable(),
  /** Roadmap items updated in the last 30 days; null when there is no roadmap. */
  roadmapMoves30d: z.number().int().nullable(),
  /** Whole days since the latest portal sign-in among the company's members. */
  portalSignInDays: z.number().int().nullable(),
  /** The company has portal members and none of them has ever signed in. */
  portalNeverSignedIn: z.boolean(),
});

export type HealthSignals = z.infer<typeof healthSignalsSchema>;

// The weights, named once so the test and a reader see the same numbers.
const MEETING_STALE_DAYS = 30;
const MEETING_COLD_DAYS = 60;
const MEETING_STALE_COST = 20;
const MEETING_COLD_COST = 35;
const OVERDUE_COST_EACH = 15;
const OVERDUE_COST_CAP = 45;
const ROADMAP_STILL_COST = 15;
const PORTAL_STALE_DAYS = 30;
const PORTAL_STALE_COST = 15;

/** Health from 0 to 100, higher is healthier. */
export function scoreHealth(s: HealthSignals): number {
  let score = 100;
  if (s.neverMet || (s.daysSinceMeeting !== null && s.daysSinceMeeting > MEETING_COLD_DAYS)) {
    score -= MEETING_COLD_COST;
  } else if (s.daysSinceMeeting !== null && s.daysSinceMeeting > MEETING_STALE_DAYS) {
    score -= MEETING_STALE_COST;
  }
  if (s.overdueInvoices !== null) score -= Math.min(OVERDUE_COST_CAP, OVERDUE_COST_EACH * s.overdueInvoices);
  if (s.roadmapMoves30d === 0) score -= ROADMAP_STILL_COST;
  if (s.portalNeverSignedIn || (s.portalSignInDays !== null && s.portalSignInDays > PORTAL_STALE_DAYS)) {
    score -= PORTAL_STALE_COST;
  }
  return Math.max(0, Math.min(100, score));
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** The four signals in words, for the screen. Every case says something; none is a blank. */
export function describeSignals(s: HealthSignals): { meeting: string; invoices: string; roadmap: string; portal: string } {
  const meeting = s.neverMet
    ? "Never met"
    : s.daysSinceMeeting === null
      ? "Meetings unknown"
      : s.daysSinceMeeting === 0
        ? "Met today"
        : `Last met ${days(s.daysSinceMeeting)} ago`;
  const invoices =
    s.overdueInvoices === null
      ? "Invoices unknown"
      : s.overdueInvoices === 0
        ? "No overdue invoices"
        : `${s.overdueInvoices} overdue invoice${s.overdueInvoices === 1 ? "" : "s"}`;
  const roadmap =
    s.roadmapMoves30d === null
      ? "No roadmap"
      : s.roadmapMoves30d === 0
        ? "No roadmap moves in 30 days"
        : `${s.roadmapMoves30d} roadmap move${s.roadmapMoves30d === 1 ? "" : "s"} in 30 days`;
  const portal = s.portalNeverSignedIn
    ? "Portal never signed in"
    : s.portalSignInDays === null
      ? "No portal members"
      : s.portalSignInDays === 0
        ? "Portal sign-in today"
        : `Portal sign-in ${days(s.portalSignInDays)} ago`;
  return { meeting, invoices, roadmap, portal };
}
