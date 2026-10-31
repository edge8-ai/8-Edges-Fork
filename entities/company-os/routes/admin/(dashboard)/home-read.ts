// The Admin Home's reads (AH.2): each section asked of the entity that owns it,
// through its door, and turned into the plain input lib/admin-home.ts takes.
//
// A section is read only when the reader may open the page it links to (the
// page's own declared permission, ADR 0013), so Home is never a side door to
// what a page would refuse; and a deployment without an entity has no page to
// open, so its section is never asked for. Each read fails on its own: a
// failure costs that section, which says so, never the page.
import { addDays, saigonToday } from "@/kernel/config/dates";
import type { RequestAccess } from "@/kernel/identity/access-request";
import { mayOpen } from "@/kernel/identity/may-open";
import { teamSelfOf } from "@/kernel/identity/team-people";
import { timeAgo } from "@/kernel/ui/format";
import { myWeek, myWeekFocus, readMyWeek, sprintStartOf, weekLabel, type MyWeekRow } from "@/entities/boards";
import { isOpenCommitment, promisesMadeAsCoach } from "@/entities/coaching";
import { ownedDealsWithNextStepBy, pipelineStageNames } from "@/entities/crm";
import { activeApplicationDates } from "@/entities/hiring";
import { getOfficeGoals, getProbationRows } from "@/entities/org";
import { REVIEW_TYPE_LABEL, reviewFormHref, reviewsToWrite } from "@/entities/team";
import { upcomingHolidays, whoIsOutBetween } from "@/entities/time-off";
import { companyVitals } from "@/entities/company-os/lib/company-vitals";
import type { AdminHomeInput, CardIn, Loaded } from "@/entities/company-os/lib/admin-home-types";
import { readVitalsRows } from "./company-vitals-read";
import { waitingApprovals } from "./waiting-approvals";

const MY_WEEK = "/team/my-week";
const COACHING = "/team/coaching";
const PIPELINE = "/admin/revenue/deals";
const PEOPLE = "/admin/talent/team";
const PROBATION = "/admin/talent/probation";
const APPLICATIONS = "/admin/talent/applications";
const DASHBOARD = "/admin/company/dashboard";

// The week ahead the follow-ups count and the team's away list covers.
const AHEAD_DAYS = 7;

async function load<T>(where: string, read: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (err) {
    console.error(`[admin-home] ${where}`, err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/** A door read that answers `{ data, error }`: its error is a failed section, not an empty one. */
function rowsOf<T>(res: { data: T[] | null; error: { message: string } | null }, where: string): T[] {
  if (res.error) throw new Error(`${where}: ${res.error.message}`);
  return res.data ?? [];
}

/** Null-as-failure reads (the time-off door's): null is a failed read. */
function present<T>(value: T | null, where: string): T {
  if (value === null) throw new Error(`${where}: read failed`);
  return value;
}

const cardIn = (r: MyWeekRow): CardIn => ({ id: r.id, title: r.title, place: r.place, priority: r.priority, due: r.due, href: r.href });

export async function readAdminHome(access: RequestAccess, email: string): Promise<AdminHomeInput> {
  const today = saigonToday();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hour12: false }).format(new Date()));
  const may = (href: string) => mayOpen(access, href);
  const personId = access.personId;
  // An admin with no person record (the bootstrap allowlist) has no queue of
  // their own: Home is the company card and the team's week.
  const self = personId ? await load("self", () => teamSelfOf(personId)) : null;
  const teamMemberId = self?.ok ? self.value.teamMemberId : null;

  const week = personId && may(MY_WEEK) ? await load("my week", async () => myWeek(await readMyWeek(personId, sprintStartOf(today)), today)) : undefined;

  const [approvals, reviews, promises, deals, away, holidays, probation, applications, company] = await Promise.all([
    load("approvals", async () =>
      (await waitingApprovals(email)).map((a) => ({ id: a.id, label: a.label, kind: a.kind, askedAgo: timeAgo(a.createdAt), href: a.href })),
    ),
    // No page gate: the queue is the reader's own (keyed by their own team
    // member id), and each row links where /team/reviews already sends them.
    teamMemberId
      ? load("reviews", async () =>
          (await reviewsToWrite(teamMemberId)).map((r) => ({
            id: r.id,
            subjectName: r.subjectName,
            typeLabel: REVIEW_TYPE_LABEL[r.reviewType],
            self: r.raterKind === "self",
            manager: r.raterKind === "manager",
            draft: r.status === "draft",
            href: reviewFormHref(r),
          })),
        )
      : undefined,
    teamMemberId && may(COACHING)
      ? load("promises", async () => ({
          href: COACHING,
          rows: (await promisesMadeAsCoach(teamMemberId))
            .filter((p) => isOpenCommitment(p.status) || p.status === "blocked")
            .map((p) => ({ id: p.id, title: p.title, dueOn: p.dueOn, personName: p.personName, blocked: p.status === "blocked" })),
        }))
      : undefined,
    personId && may(PIPELINE)
      ? load("deals", async () => {
          const rows = rowsOf(await ownedDealsWithNextStepBy(personId, addDays(today, AHEAD_DAYS)), "owned deals");
          const stageIds = [...new Set(rows.map((d) => d.stage_id).filter((id): id is string => !!id))];
          const stages = new Map(stageIds.length ? rowsOf(await pipelineStageNames(stageIds), "stage names").map((s) => [s.id, s.name]) : []);
          return {
            pipelineHref: PIPELINE,
            href: (id: string) => `${PIPELINE}/${id}`,
            rows: rows
              .filter((d) => d.next_step_date)
              .map((d) => ({
                id: d.id,
                title: d.title,
                stage: (d.stage_id && stages.get(d.stage_id)) || null,
                amountUsdCents: d.amount_usd_cents,
                nextStep: d.next_step,
                nextStepDate: d.next_step_date!,
              })),
          };
        })
      : undefined,
    // Who is away names colleagues and their leave dates, so it is asked only
    // for a reader who may open People, as probation is: Admin view alone (a
    // hiring approver) does not see the team's leave anywhere else, and Home
    // must not be the side door. The next holiday travels with it.
    may(PEOPLE) ? load("away", async () => present(await whoIsOutBetween(today, addDays(today, AHEAD_DAYS - 1)), "away")) : undefined,
    may(PEOPLE) ? load("holidays", async () => present(await upcomingHolidays(today, 3), "holidays")) : undefined,
    may(PROBATION)
      ? load("probation", async () =>
          (await getProbationRows(today)).map((p) => ({ teamMemberId: p.teamMemberId, name: p.name, startDate: p.startDate, endsOn: p.endsOn, managerName: p.managerName })),
        )
      : undefined,
    may(APPLICATIONS)
      ? load("applications", async () => {
          const rows = rowsOf(await activeApplicationDates(), "applications in review");
          return { count: rows.length, newest: rows[0]?.applied_at ?? null, href: APPLICATIONS };
        })
      : undefined,
    may(DASHBOARD)
      ? load("company", async () => {
          const [{ invoicesRes, ordersRes, dealsRes, teamRes }, goals] = await Promise.all([readVitalsRows(), getOfficeGoals()]);
          return companyVitals(
            {
              invoices: rowsOf(invoicesRes, "invoices"),
              orders: rowsOf(ordersRes, "orders"),
              deals: rowsOf(dealsRes, "deals"),
              team: rowsOf(teamRes, "team"),
              openIssues: goals.openIssuesTotal,
            },
            new Date(),
          );
        })
      : undefined,
  ]);

  // Who the reader is on the team failed to load: their reviews and promises
  // are unknown, not none, so those cards say they failed.
  const selfFailed = self !== null && !self.ok;
  return {
    today,
    hour,
    addressedAs: self?.ok ? self.value.greeting : null,
    sprint: week?.ok ? { label: weekLabel(week.value.week), lastDay: week.value.isLastDay } : null,
    approvals,
    reviews: selfFailed ? { ok: false } : reviews,
    cards: week
      ? week.ok
        ? (() => {
            const focus = myWeekFocus(week.value);
            return {
              ok: true as const,
              value: {
                overdue: focus.overdue.map(cardIn),
                due: focus.due.flatMap((d) => d.rows).map(cardIn),
                laterNext: week.value.later[0] ? cardIn(week.value.later[0]) : null,
                myWeekHref: MY_WEEK,
              },
            };
          })()
        : { ok: false }
      : undefined,
    promises: selfFailed && may(COACHING) ? { ok: false } : promises,
    deals,
    team: { href: may(PEOPLE) ? PEOPLE : null, away, holidays, probation, applications },
    company: company ? { ...company, href: DASHBOARD } : undefined,
  };
}
