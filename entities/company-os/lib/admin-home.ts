// The Admin Home (AH.2, approved on the AH.1 canvas 2026-10-27): what needs
// this admin today, the way My Week answers it for their cards. The admins
// asked for it because /admin opened on the whole company and nothing on it
// was theirs.
//
// This module is the page as plain values: the route reads each source through
// its owner's door and hands the results here, and the UI draws what comes
// back. So which section shows, what each tile says and how each row is worded
// is tested without a database (admin-home.test.ts).
//
// Three rules hold throughout:
// - A section shows only when it has something in it. The route has already
//   left out what the reader may not open, by the permission of the page each
//   section links to.
// - A section whose read failed says so instead of rendering empty, because an
//   empty "Waiting on you" reads as "nothing needs you".
// - Nothing here is a figure about another person: the reader's own queue, and
//   company events (time off, probation dates, holidays). Never someone's
//   overdue count, activity or pace.
import { addDays, diffDays } from "@/kernel/config/dates";
import { formatCents, initials } from "@/kernel/ui/format";
import type { AdminHomeInput, AdminHomeModel, ApprovalIn, AwayIn, CardIn, DealIn, HolidayIn, HomeBadge, HomeLink, HomeRow, HomeTile, Loaded, ProbationIn, PromiseIn, ReviewIn, Section, Tone, VitalsIn } from "./admin-home-types";
import { dayLabel, longDate, shortDate, weekday } from "./admin-home-dates";


// How many rows a list shows before "N more" sends the reader to its page.
const LIST_CAP = 5;
const PROMISE_CAP = 4;
// A probation inside this many days is the one date worth colour; the group
// lists those ending inside the window.
const PROBATION_WARN_DAYS = 7;
const PROBATION_WINDOW_DAYS = 30;
const NEW_JOINER_DAYS = 30;
const HOLIDAY_WINDOW_DAYS = 45;
const DEAL_AHEAD_DAYS = 7;
const MAX_TILES = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function row(r: Partial<HomeRow> & Pick<HomeRow, "key" | "title">): HomeRow {
  return { sub: null, href: null, badge: null, action: null, initials: null, ...r };
}

function dueBadge(due: string, today: string): HomeBadge {
  if (due < today) return { text: shortDate(due), tone: "err" };
  if (due === today) return { text: "Today", tone: "warn" };
  return { text: dayLabel(due), tone: "neutral" };
}

function cardRow(c: CardIn, today: string): HomeRow {
  return row({
    key: c.id,
    title: c.title,
    sub: [c.place, c.priority.toUpperCase()].filter(Boolean).join(" · "),
    href: c.href,
    badge: c.due ? dueBadge(c.due, today) : null,
  });
}

function joinPhrases(parts: string[]): string {
  if (parts.length === 0) return "Nothing needs you today.";
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

// ── The page ──

export function adminHome(input: AdminHomeInput): AdminHomeModel {
  const { today } = input;

  // Waiting on you: approvals first (someone is waiting for a yes), then the
  // reviews the reader writes, oldest cycles as the review screen orders them.
  const approvals = input.approvals;
  const reviews = input.reviews;
  let waiting: AdminHomeModel["waiting"] = null;
  let decideCount = 0;
  let reviewCount = 0;
  if (approvals || reviews) {
    if ((approvals && !approvals.ok) || (reviews && !reviews.ok)) waiting = { failed: true };
    const approvalRows = approvals?.ok
      ? approvals.value.map((a) => row({ key: `a:${a.id}`, title: a.label, sub: `${a.kind} · asked ${a.askedAgo}`, href: a.href, action: "Decide" }))
      : [];
    const reviewRows = reviews?.ok
      ? reviews.value.map((r) =>
          row({
            key: `r:${r.id}`,
            title: r.self ? `Your ${r.typeLabel.toLowerCase()}: self-assessment` : `${r.subjectName}’s ${r.typeLabel.toLowerCase()}`,
            sub: [r.self ? "Self-assessment" : r.manager ? "Manager review" : "Reviewer feedback", r.draft ? "draft started" : null]
              .filter(Boolean)
              .join(" · "),
            href: r.href,
            action: r.draft ? "Continue" : "Write review",
          }),
        )
      : [];
    decideCount = approvalRows.length;
    reviewCount = reviewRows.length;
    if (!waiting && approvalRows.length + reviewRows.length > 0) waiting = { failed: false, rows: [...approvalRows, ...reviewRows] };
  }

  // Your cards: My Week's Overdue and Due-this-sprint answers, capped.
  let cards: AdminHomeModel["cards"] = null;
  let overdueCount = 0;
  let dueCount = 0;
  let dueToday = 0;
  let oldestOverdue: string | null = null;
  let nextDue: string | null = null;
  if (input.cards) {
    if (!input.cards.ok) cards = { failed: true };
    else {
      const { overdue, due, laterNext, myWeekHref } = input.cards.value;
      overdueCount = overdue.length;
      dueCount = due.length;
      dueToday = due.filter((c) => c.due === today).length;
      // Oldest first: the one that has waited longest leads.
      const late = [...overdue].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
      oldestOverdue = late[0]?.due ?? null;
      nextDue = due[0]?.due ?? null;
      if (overdueCount + dueCount > 0) {
        cards = {
          failed: false,
          myWeekHref,
          overdue: late.slice(0, LIST_CAP).map((c) => cardRow(c, today)),
          overdueCount,
          overdueMore: overdueCount > LIST_CAP ? { label: `${overdueCount - LIST_CAP} more overdue in My week`, href: myWeekHref } : null,
          due: due.slice(0, LIST_CAP).map((c) => cardRow(c, today)),
          dueCount,
          dueMore: dueCount > LIST_CAP ? { label: `${dueCount - LIST_CAP} more due this sprint in My week`, href: myWeekHref } : null,
          dueQuiet:
            dueCount === 0
              ? laterNext?.due
                ? `Nothing else is due this sprint. Next: ${laterNext.title}, ${dayLabel(laterNext.due)}.`
                : "Nothing else is due this sprint."
              : null,
        };
      }
    }
  }

  // Your promises from 1-1s: what the reader promised the people they coach.
  let promises: AdminHomeModel["promises"] = null;
  let promisesOpen = 0;
  let promisesLate = 0;
  if (input.promises) {
    if (!input.promises.ok) promises = { failed: true };
    else {
      const { rows, href } = input.promises.value;
      promisesOpen = rows.length;
      const late = rows.filter((p) => !p.blocked && p.dueOn !== null && p.dueOn < today).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
      promisesLate = late.length;
      const blocked = rows.filter((p) => p.blocked).length;
      const shown = late.length > 0 ? late : rows.filter((p) => !p.blocked).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
      const listed = shown.slice(0, PROMISE_CAP);
      const rest = rows.length - listed.length;
      const restWords = [rest - blocked > 0 ? `${rest - blocked} more open` : null, blocked > 0 ? `${blocked} blocked` : null].filter(Boolean);
      if (rows.length > 0) {
        promises = {
          failed: false,
          href,
          heading: late.length > 0 ? "Past their date" : "Next due",
          headingCount: late.length > 0 ? late.length : listed.length,
          late: late.length > 0,
          rows: listed.map((p) =>
            row({
              key: p.id,
              title: p.title,
              sub: p.personName ? `1-1 with ${p.personName}` : null,
              href,
              badge: p.dueOn ? dueBadge(p.dueOn, today) : null,
            }),
          ),
          more: restWords.length > 0 ? { label: `${restWords.join(" and ")} in Coaching`, href } : null,
        };
      }
    }
  }

  // Deal follow-ups: the reader's open deals whose next step is due today or
  // earlier; the week ahead is a count, because it is not yet due.
  let deals: AdminHomeModel["deals"] = null;
  let dealsDue = 0;
  if (input.deals) {
    if (!input.deals.ok) deals = { failed: true };
    else {
      const { rows, href } = input.deals.value;
      const due = rows.filter((d) => d.nextStepDate <= today);
      const ahead = rows.filter((d) => d.nextStepDate > today && d.nextStepDate <= addDays(today, DEAL_AHEAD_DAYS));
      dealsDue = due.length;
      if (due.length > 0) {
        deals = {
          failed: false,
          href: input.deals.value.pipelineHref,
          rows: due.slice(0, LIST_CAP).map((d) =>
            row({
              key: d.id,
              title: d.title,
              sub: [d.stage, d.amountUsdCents ? formatCents(d.amountUsdCents) : null, d.nextStep ? clip(d.nextStep, 70) : null].filter(Boolean).join(" · "),
              href: href(d.id),
              badge: dueBadge(d.nextStepDate, today),
            }),
          ),
          more:
            [due.length > LIST_CAP ? `${due.length - LIST_CAP} more due` : null, ahead.length > 0 ? `${plural(ahead.length, "more next step")} by ${dayLabel(addDays(today, DEAL_AHEAD_DAYS))}` : null]
              .filter(Boolean)
              .join(" · ") || null,
        };
      }
    }
  }

  // Team this week: company events, grouped. Each group is there only when the
  // route passed it (the reader may open its page) and it holds something.
  let team: AdminHomeModel["team"] = null;
  let awayThisWeek: AwayIn[] = [];
  let probationSoon: ProbationIn[] = [];
  if (input.team) {
    const t = input.team;
    const parts = [t.away, t.probation, t.holidays, t.applications].filter((x) => x !== undefined);
    if (parts.some((p) => !p.ok)) team = { failed: true };
    else {
      const groups: { label: string; rows: HomeRow[] }[] = [];
      if (t.away?.ok) {
        awayThisWeek = [...t.away.value].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
        if (awayThisWeek.length > 0)
          groups.push({
            label: "Away",
            rows: awayThisWeek.map((a) =>
              row({
                key: `away:${a.personId}:${a.start}`,
                title: a.name,
                sub: "Time off",
                initials: initials(a.name),
                badge: { text: a.start === a.end ? dayLabel(a.start) : `${dayLabel(a.start)} – ${dayLabel(a.end)}`, tone: "neutral" },
              }),
            ),
          });
      }
      if (t.probation?.ok) {
        const ending = t.probation.value
          .filter((p) => p.endsOn && p.endsOn >= today && diffDays(today, p.endsOn) <= PROBATION_WINDOW_DAYS)
          .sort((a, b) => a.endsOn!.localeCompare(b.endsOn!));
        probationSoon = ending;
        if (ending.length > 0)
          groups.push({
            label: "Probation ends",
            rows: ending.map((p) =>
              row({
                key: `prob:${p.teamMemberId}`,
                title: p.name,
                sub: [p.startDate ? `Started ${shortDate(p.startDate)}` : null, p.managerName ? `manager ${p.managerName}` : null].filter(Boolean).join(" · ") || null,
                initials: initials(p.name),
                badge: { text: dayLabel(p.endsOn!), tone: diffDays(today, p.endsOn!) <= PROBATION_WARN_DAYS ? "warn" : "neutral" },
              }),
            ),
          });
        const fresh = t.probation.value
          .filter((p) => p.startDate && p.startDate <= today && diffDays(p.startDate, today) < NEW_JOINER_DAYS)
          .sort((a, b) => b.startDate!.localeCompare(a.startDate!));
        if (fresh.length > 0)
          groups.push({
            label: "New",
            rows: fresh.map((p) => {
              const day = diffDays(p.startDate!, today) + 1;
              return row({
                key: `new:${p.teamMemberId}`,
                title: p.name,
                sub: `Started ${dayLabel(p.startDate!)} · day ${day}`,
                initials: initials(p.name),
                badge: { text: `Week ${Math.floor((day - 1) / 7) + 1}`, tone: "neutral" },
              });
            }),
          });
      }
      if (t.holidays?.ok) {
        const next = t.holidays.value.find((h) => h.date >= today && diffDays(today, h.date) <= HOLIDAY_WINDOW_DAYS);
        if (next)
          groups.push({
            label: "Holiday",
            rows: [row({ key: `hol:${next.date}`, title: next.name, sub: next.closed ? "Company closed" : "Company holiday", badge: { text: dayLabel(next.date), tone: "neutral" } })],
          });
      }
      if (t.applications?.ok && t.applications.value.count > 0) {
        const a = t.applications.value;
        groups.push({
          label: "Hiring",
          rows: [
            row({
              key: "hiring",
              title: `${plural(a.count, "application")} in review`,
              sub: a.newest ? `Newest ${dayLabel(a.newest.slice(0, 10))}` : null,
              href: a.href,
            }),
          ],
        });
      }
      if (groups.length > 0) team = { failed: false, href: t.href, groups };
    }
  }

  let company: AdminHomeModel["company"] = null;
  if (input.company) {
    if (!input.company.ok) company = { failed: true };
    else {
      const v = input.company.value;
      company = {
        failed: false,
        href: input.company.href ?? "/admin/company/dashboard",
        rows: [
          { label: "Revenue · 30d", value: formatCents(v.cash30) },
          { label: "Pipeline · open", value: formatCents(v.openPipeline) },
          { label: "Headcount", value: String(v.headcount) },
          { label: "Open issues", value: String(v.openIssues) },
        ],
      };
    }
  }

  // Tiles: one per section that holds something for the reader, in the order
  // the reader acts on them, at most five. Each is a way into its section.
  const candidates: (HomeTile | null)[] = [
    decideCount + reviewCount > 0
      ? {
          label: "To decide",
          value: String(decideCount + reviewCount),
          note: [decideCount > 0 ? plural(decideCount, "approval") : null, reviewCount > 0 ? `${plural(reviewCount, "review")} to write` : null].filter(Boolean).join(" · "),
          href: "#waiting",
        }
      : null,
    overdueCount > 0 ? { label: "Overdue cards", value: String(overdueCount), note: oldestOverdue ? `oldest from ${shortDate(oldestOverdue)}` : "past their date", href: "#cards" } : null,
    dueCount > 0
      ? { label: "Due this sprint", value: String(dueCount), note: dueToday > 0 ? `${dueToday} due today` : nextDue ? `next ${dayLabel(nextDue)}` : "this sprint", href: "#cards" }
      : null,
    dealsDue > 0 ? { label: "Deal follow-ups", value: String(dealsDue), note: "next steps due", href: "#deals" } : null,
    promisesOpen > 0
      ? { label: "1-1 promises", value: String(promisesOpen), note: promisesLate > 0 ? `${promisesLate} past their date` : "none past their date", href: "#promises" }
      : null,
    probationSoon.length > 0
      ? { label: "Probation ends", value: String(probationSoon.length), note: `next: ${probationSoon[0].name}, ${dayLabel(probationSoon[0].endsOn!)}`, href: "#team" }
      : null,
    awayThisWeek.length > 0
      ? {
          label: "Away this week",
          value: String(awayThisWeek.length),
          note: awayThisWeek.length === 1 ? `${awayThisWeek[0].name}, ${dayLabel(awayThisWeek[0].start)}` : "see Team this week",
          href: "#team",
        }
      : null,
  ];
  const tiles = candidates.filter((t): t is HomeTile => t !== null).slice(0, MAX_TILES);

  // The sentence under the greeting: the things with a person on the other end
  // first, then the reader's own late work.
  const soon = probationSoon.filter((p) => diffDays(today, p.endsOn!) <= PROBATION_WARN_DAYS);
  const phrases = [
    decideCount > 0 ? `${plural(decideCount, "approval")} to decide` : null,
    reviewCount > 0 ? `${plural(reviewCount, "review")} to write` : null,
    dealsDue > 0 ? `${plural(dealsDue, "deal follow-up")} due` : null,
    soon.length === 1
      ? `a probation ending ${diffDays(today, soon[0].endsOn!) === 0 ? "today" : `on ${weekday(soon[0].endsOn!)}`}`
      : soon.length > 1
        ? `${soon.length} probations ending this week`
        : null,
    overdueCount > 0 ? `${plural(overdueCount, "card")} past ${overdueCount === 1 ? "its" : "their"} date` : null,
  ].filter((p): p is string => p !== null);

  const salutation = input.hour < 12 ? "Good morning" : input.hour < 18 ? "Good afternoon" : "Good evening";
  return {
    eyebrow: ["Home", longDate(today), input.sprint?.lastDay ? `${input.sprint.label} ends today` : null].filter(Boolean).join(" · "),
    greeting: input.addressedAs ? `${salutation}, ${input.addressedAs}` : salutation,
    summary: joinPhrases(phrases),
    tiles,
    waiting,
    cards,
    promises,
    deals,
    team,
    company,
  };
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}
