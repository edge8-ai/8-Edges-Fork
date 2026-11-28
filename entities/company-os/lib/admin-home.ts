// The Admin Home (AH.2, redrawn as AH.4 on 2026-11-13): what needs this admin
// today, the way My Week answers it for their cards.
//
// AH.4 changes the order of the page, not its sources. The five tiles went:
// each repeated the sentence under the greeting and the section below it, so
// every number showed three times. In their place "Do first" holds what is due
// today and only the reader can do; approvals of one kind fold into one row;
// late work says how late ("12 days late") rather than a date in red; deals
// lead with the biggest; and the team's dates became a strip of days
// (admin-home-week.ts).
//
// This module is the page as plain values: the route reads each source through
// its owner's door and hands the results here, and the UI draws what comes
// back, so the wording is tested without a database (admin-home.test.ts).
//
// Three rules hold throughout:
// - A section shows only when it has something in it. The route has already
//   left out what the reader may not open.
// - A section whose read failed says so instead of rendering empty, because an
//   empty "Decisions" reads as "nothing needs you".
// - Nothing here is a figure about another person: the reader's own queue, and
//   company events. Never someone's overdue count, activity or pace.
import { addDays, diffDays } from "@/kernel/config/dates";
import { formatCents, initials } from "@/kernel/ui/format";
import type { AdminHomeInput, AdminHomeModel, ApprovalIn, CardIn, DealIn, HomeBadge, HomeRow, ProbationIn } from "./admin-home-types";
import { dayLabel, longDate, weekday } from "./admin-home-dates";
import { homeWeek } from "./admin-home-week";

// How many rows each list shows before "N more" sends the reader to its page.
const LATE_CAP = 4;
const DUE_CAP = 3;
const DEAL_CAP = 4;
const DEAL_AHEAD_DAYS = 7;
const PROBATION_WARN_DAYS = 7;
// This many late cards at P2 or lower is a plan to redo, not a list to carry.
const LOW_PRIORITY_HINT = 3;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function row(r: Partial<HomeRow> & Pick<HomeRow, "key" | "title">): HomeRow {
  return { sub: null, href: null, badge: null, action: null, initials: null, act: null, children: null, ...r };
}

/** How late, not which date: "3 days late" reads at a glance, "29 Sep" makes the reader count. */
function dueBadge(due: string, today: string): HomeBadge {
  if (due < today) return { text: `${plural(diffDays(due, today), "day")} late`, tone: "err" };
  if (due === today) return { text: "Today", tone: "warn" };
  return { text: dayLabel(due), tone: "neutral" };
}

const priorityRank = (p: string) => {
  const n = Number(p.replace(/\D/g, ""));
  return Number.isFinite(n) && p ? n : 9;
};

function cardRow(c: CardIn, today: string): HomeRow {
  return row({ key: c.id, title: c.title, sub: [c.place, c.priority.toUpperCase()].filter(Boolean).join(" · "), href: c.href, badge: c.due ? dueBadge(c.due, today) : null, act: c.act ?? null });
}

function dealRow(d: DealIn, today: string, href: (id: string) => string, canLog: boolean): HomeRow {
  return row({
    act: canLog ? { kind: "deal", dealId: d.id, nextStep: d.nextStep, nextStepDate: d.nextStepDate, today } : null,
    key: d.id,
    title: d.title,
    sub: [d.amountUsdCents ? formatCents(d.amountUsdCents) : null, d.stage, d.nextStep ? clip(d.nextStep, 60) : null].filter(Boolean).join(" · "),
    href: href(d.id),
    badge: dueBadge(d.nextStepDate, today),
  });
}

function probationRow(p: ProbationIn, href: string | null, canDecide: boolean): HomeRow {
  return row({
    key: `prob:${p.teamMemberId}`,
    title: `${p.name}’s probation ends today`,
    sub: [p.startDate ? `Started ${dayLabel(p.startDate)}` : null, p.managerName ? `manager ${p.managerName}` : null].filter(Boolean).join(" · ") || null,
    initials: initials(p.name),
    href,
    action: href && !canDecide ? "Decide" : null,
    act: canDecide ? { kind: "probation", teamMemberId: p.teamMemberId } : null,
  });
}

/** Approvals of one kind fold into one row once there are two, so four claims are one decision to sit down to, not four rows. */
function approvalRows(approvals: ApprovalIn[]): HomeRow[] {
  const kinds = new Map<string, ApprovalIn[]>();
  for (const a of approvals) kinds.set(a.kind, [...(kinds.get(a.kind) ?? []), a]);
  return [...kinds.values()].map((group) => {
    const a = group[0];
    if (group.length === 1)
      return row({ key: `a:${a.id}`, title: a.label, sub: [a.amount, a.kind, `asked ${a.askedAgo}`].filter(Boolean).join(" · "), href: a.href, action: a.act ? null : "Decide", act: a.act ?? null });
    const prefixes = new Set(group.map((g) => (g.label.includes(": ") ? g.label.split(": ")[0] : null)));
    const shared = prefixes.size === 1 ? [...prefixes][0] : null;
    const names = group.map((g) => (shared ? g.label.slice(shared.length + 2) : g.label));
    const paths = new Set(group.map((g) => g.href.split("?")[0]));
    return row({
      key: `k:${a.kind}`,
      title: `${shared ?? a.kind} (${group.length})`,
      sub: clip(names.join(" · "), 110),
      href: paths.size === 1 ? [...paths][0] : a.href,
      action: `Review ${group.length}`,
      // Opened in place, each with its own buttons, so four claims are decided
      // here rather than on four pages.
      children: group.map((g, i) =>
        row({ key: `a:${g.id}`, title: names[i], sub: [g.amount, `asked ${g.askedAgo}`].filter(Boolean).join(" · "), href: g.href, action: g.act ? null : "Decide", act: g.act ?? null }),
      ),
    });
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
  const first: HomeRow[] = [];

  // Do first, probations: the decision is due today and waits on a person.
  const probations = input.team?.probation?.ok ? input.team.probation.value : [];
  const endingToday = probations.filter((p) => p.endsOn === today);
  first.push(...endingToday.map((p) => probationRow(p, input.team?.probationHref ?? null, Boolean(input.team?.canDecide))));
  const soon = probations.filter((p) => p.endsOn && p.endsOn > today && diffDays(today, p.endsOn) <= PROBATION_WARN_DAYS);

  // Decisions: approvals first (someone is waiting for a yes), then the
  // reviews the reader writes.
  const approvals = input.approvals;
  const reviews = input.reviews;
  let waiting: AdminHomeModel["waiting"] = null;
  let decideCount = 0;
  let reviewCount = 0;
  if (approvals || reviews) {
    const failed = (approvals && !approvals.ok) || (reviews && !reviews.ok);
    const aRows = approvals?.ok ? approvalRows(approvals.value) : [];
    const rRows = reviews?.ok
      ? reviews.value.map((r) =>
          row({
            key: `r:${r.id}`,
            title: r.self ? `Your ${r.typeLabel.toLowerCase()}: self-assessment` : `${r.subjectName}’s ${r.typeLabel.toLowerCase()}`,
            sub: [r.self ? "Self-assessment" : r.manager ? "Manager review" : "Reviewer feedback", r.draft ? "draft started" : null].filter(Boolean).join(" · "),
            href: r.href,
            initials: r.self ? null : initials(r.subjectName),
            action: r.draft ? "Continue" : "Write review",
          }),
        )
      : [];
    decideCount = approvals?.ok ? approvals.value.length : 0;
    reviewCount = rRows.length;
    if (failed) waiting = { failed: true };
    else if (aRows.length + rRows.length > 0)
      waiting = { failed: false, rows: [...aRows, ...rRows], note: approvals?.ok && approvals.value[0] ? `oldest asked ${approvals.value[0].askedAgo}` : null };
  }

  // Deal follow-ups: today's go to Do first; the late ones list here, biggest first.
  let deals: AdminHomeModel["deals"] = null;
  let dealsDue = 0;
  if (input.deals) {
    if (!input.deals.ok) deals = { failed: true };
    else {
      const { rows, href, pipelineHref } = input.deals.value;
      const canLog = Boolean(input.deals.value.canLog);
      const dueToday = rows.filter((d) => d.nextStepDate === today);
      first.push(...dueToday.map((d) => dealRow(d, today, href, canLog)));
      const late = rows.filter((d) => d.nextStepDate < today).sort((a, b) => (b.amountUsdCents ?? 0) - (a.amountUsdCents ?? 0) || a.nextStepDate.localeCompare(b.nextStepDate));
      const ahead = rows.filter((d) => d.nextStepDate > today && d.nextStepDate <= addDays(today, DEAL_AHEAD_DAYS));
      dealsDue = late.length + dueToday.length;
      const total = late.reduce((s, d) => s + (d.amountUsdCents ?? 0), 0);
      if (late.length > 0)
        deals = {
          failed: false,
          href: pipelineHref,
          note: total > 0 ? `${formatCents(total)} waiting on a next step` : `${plural(late.length, "next step")} late`,
          rows: late.slice(0, DEAL_CAP).map((d) => dealRow(d, today, href, canLog)),
          more:
            [late.length > DEAL_CAP ? `${late.length - DEAL_CAP} more late` : null, ahead.length > 0 ? `${plural(ahead.length, "more next step")} by ${dayLabel(addDays(today, DEAL_AHEAD_DAYS))}` : null]
              .filter(Boolean)
              .join(" · ") || null,
        };
    }
  }

  // Your cards: today's go to Do first; late ones lead, highest priority first.
  let cards: AdminHomeModel["cards"] = null;
  let overdueCount = 0;
  if (input.cards) {
    if (!input.cards.ok) cards = { failed: true };
    else {
      const { overdue, due, laterNext, myWeekHref } = input.cards.value;
      const todays = due.filter((c) => c.due === today);
      first.push(...todays.map((c) => cardRow(c, today)));
      const rest = due.filter((c) => c.due !== today);
      const late = [...overdue].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.due ?? "").localeCompare(b.due ?? ""));
      overdueCount = late.length;
      const hidden = Math.max(0, late.length - LATE_CAP) + Math.max(0, rest.length - DUE_CAP);
      const lowPriority = late.filter((c) => priorityRank(c.priority) >= 2).length;
      if (late.length + due.length > 0)
        cards = {
          failed: false,
          myWeekHref,
          note: [late.length > 0 ? `${late.length} late` : null, due.length > 0 ? `${due.length} this sprint` : null].filter(Boolean).join(" · "),
          late: late.slice(0, LATE_CAP).map((c) => cardRow(c, today)),
          lateCount: late.length,
          due: rest.slice(0, DUE_CAP).map((c) => cardRow(c, today)),
          dueCount: rest.length,
          more: hidden > 0 ? { label: `${hidden} more in My week`, href: myWeekHref } : null,
          quiet:
            rest.length === 0
              ? laterNext?.due
                ? `Nothing else is due this sprint. Next: ${laterNext.title}, ${dayLabel(laterNext.due)}.`
                : "Nothing else is due this sprint."
              : null,
          hint: lowPriority >= LOW_PRIORITY_HINT ? { label: `${lowPriority} late cards are P2 or lower. Re-plan them in My week`, href: myWeekHref } : null,
        };
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
          { label: "Revenue 30d", value: formatCents(v.cash30) },
          { label: "Open pipeline", value: formatCents(v.openPipeline) },
          { label: "Headcount", value: String(v.headcount) },
          { label: "Open issues", value: String(v.openIssues) },
        ],
      };
    }
  }

  // The sentence under the greeting: the things with a person on the other end
  // first, then the reader's own late work.
  const phrases = [
    endingToday.length === 1 ? "a probation to decide today" : endingToday.length > 1 ? `${endingToday.length} probations to decide today` : null,
    decideCount > 0 ? `${plural(decideCount, "approval")} to decide` : null,
    reviewCount > 0 ? `${plural(reviewCount, "review")} to write` : null,
    dealsDue > 0 ? `${plural(dealsDue, "deal follow-up")} due` : null,
    soon.length === 1 ? `a probation ending on ${weekday(soon[0].endsOn!)}` : soon.length > 1 ? `${soon.length} more probations ending this week` : null,
    overdueCount > 0 ? `${plural(overdueCount, "card")} past ${overdueCount === 1 ? "its" : "their"} date` : null,
  ].filter((p): p is string => p !== null);

  const salutation = input.hour < 12 ? "Good morning" : input.hour < 18 ? "Good afternoon" : "Good evening";
  return {
    eyebrow: ["Home", longDate(today), input.sprint?.lastDay ? `${input.sprint.label} ends today` : null].filter(Boolean).join(" · "),
    greeting: input.addressedAs ? `${salutation}, ${input.addressedAs}` : salutation,
    summary: joinPhrases(phrases),
    first,
    waiting,
    cards,
    deals,
    week: homeWeek(input),
    company,
  };
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}
