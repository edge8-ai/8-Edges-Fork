import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { addDays, businessDate } from "@/kernel/config/dates";
import { one, type Embedded } from "@/kernel/config/embedded";
import { publish } from "@/kernel/events";

// The opening nudge (CR.3.5): a week before a framework's usual opening date,
// the person who opened its last cycle is told in their Inbox that the next
// one is due, so a client's review does not wait on someone remembering the
// month. Nothing is opened for them and nobody at the client hears anything:
// opening stays a decision of the person running the reviews.
//
// It runs inside the daily review routine (crons/performance-reviews), which
// declares its own schedule. The nudge is written once per framework per year,
// because the Inbox keys it on the framework and the opening's year; a run
// that is missed is made up by the next day's, as the window is the whole week.

/** How many days before the usual opening date the nudge goes. */
export const NUDGE_DAYS_BEFORE = 7;

/**
 * A cycle opened this close before the usual date counts as this round's
 * opening, so nobody is nudged to open one they already opened early.
 */
const ALREADY_OPENED_WITHIN_DAYS = 60;

export type FrameworkForNudge = {
  id: string;
  name: string;
  usualOpenMonth: number | null;
  usualOpenDay: number | null;
  archived: boolean;
};

/** The latest cycle opened on one framework, or across every framework. */
export type LastCycle = { frameworkId: string; openedBy: string; openedOn: string; clientName: string | null };

export type OpeningDue = {
  frameworkId: string;
  frameworkName: string;
  clientName: string | null;
  ownerPersonId: string;
  opensOn: string;
};

/**
 * The usual opening date in one year, as an ISO date. A 29 February in a year
 * without one falls back to the 28th, and a day the month does not have to
 * its last day, so a framework always has a date in every year.
 */
export function usualOpeningIn(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The frameworks whose nudge is due today, and who hears it. Pure.
 *
 * - A framework with no usual date, or an archived one, sends nothing.
 * - The window is the week before the opening date, up to the day before it.
 * - The person told is whoever opened the framework's last cycle. A framework
 *   never opened goes to whoever opened the latest client review cycle of
 *   all, the person running client reviews, since a framework belongs to no
 *   client; with no cycle anywhere, nobody is told.
 * - A cycle opened on the framework within sixty days before the date means
 *   this round is already open, and nothing is sent.
 */
export function openingNudgesDue(
  frameworks: readonly FrameworkForNudge[],
  lastByFramework: ReadonlyMap<string, LastCycle>,
  latestAnywhere: LastCycle | null,
  todayISO: string,
): OpeningDue[] {
  const year = Number(todayISO.slice(0, 4));
  const due: OpeningDue[] = [];
  for (const f of frameworks) {
    if (f.archived || !f.usualOpenMonth || !f.usualOpenDay) continue;
    // This year's date, or next year's when the week before it has started
    // in December for an opening in early January.
    const opensOn = [year, year + 1]
      .map((y) => usualOpeningIn(y, f.usualOpenMonth!, f.usualOpenDay!))
      .find((d) => todayISO >= addDays(d, -NUDGE_DAYS_BEFORE) && todayISO < d);
    if (!opensOn) continue;
    const last = lastByFramework.get(f.id) ?? null;
    if (last && last.openedOn >= addDays(opensOn, -ALREADY_OPENED_WITHIN_DAYS)) continue;
    const owner = last ?? latestAnywhere;
    if (!owner) continue;
    due.push({ frameworkId: f.id, frameworkName: f.name, clientName: owner.clientName, ownerPersonId: owner.openedBy, opensOn });
  }
  return due;
}

type CycleRow = { framework_id: string; opened_by: string; opened_at: string; companies: Embedded<{ name: string | null }> };

/**
 * Reads the frameworks and the cycles, and tells each person whose nudge is
 * due. Returns how many were due. A failed read throws, which the routine
 * records as a failed run rather than a quiet day.
 */
export async function nudgeClientReviewOpenings(todayISO: string, opts: { dryRun?: boolean } = {}): Promise<number> {
  const frameworks = (
    mustRows(
      await companyOs.from("review_frameworks").select("id, name, usual_open_month, usual_open_day, archived_at"),
      "[org/client-reviews] review_frameworks",
    ) as { id: string; name: string; usual_open_month: number | null; usual_open_day: number | null; archived_at: string | null }[]
  ).map((f): FrameworkForNudge => ({ id: f.id, name: f.name, usualOpenMonth: f.usual_open_month, usualOpenDay: f.usual_open_day, archived: f.archived_at !== null }));
  if (!frameworks.some((f) => !f.archived && f.usualOpenMonth && f.usualOpenDay)) return 0;

  const cycles = mustRows(
    await companyOs
      .from("review_cycles")
      .select("framework_id, opened_by, opened_at, companies:companies!company_id(name)")
      .order("opened_at", { ascending: false }),
    "[org/client-reviews] review_cycles",
  ) as unknown as CycleRow[];
  const toLast = (c: CycleRow): LastCycle => ({ frameworkId: c.framework_id, openedBy: c.opened_by, openedOn: businessDate(c.opened_at), clientName: one(c.companies)?.name ?? null });
  const lastByFramework = new Map<string, LastCycle>();
  for (const c of cycles) if (!lastByFramework.has(c.framework_id)) lastByFramework.set(c.framework_id, toLast(c));

  const due = openingNudgesDue(frameworks, lastByFramework, cycles[0] ? toLast(cycles[0]) : null, todayISO);
  if (!opts.dryRun) {
    for (const d of due) {
      await publish("review.framework.opening_due", {
        frameworkId: d.frameworkId,
        frameworkName: d.frameworkName,
        clientName: d.clientName,
        ownerPersonId: d.ownerPersonId,
        opensOn: d.opensOn,
        newCyclePath: "/admin/talent/reviews/clients/new",
      });
    }
  }
  return due.length;
}
