import { requirePermission } from "@/kernel/identity/access-request";
import { mustRows } from "@/kernel/data/read";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { byFirstName, personName } from "@/kernel/config/people-name";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { countWorkingDays, formatLeaveBalance, listHolidayDates } from "@/entities/time-off";
import { ViewToggle } from "@/kernel/ui/ViewToggle";
import { TimeOffCalendar, type CalendarEntry } from "@/entities/time-off";
import { approvedByPolicy, humanDeciders } from "@/entities/time-off/lib/leave-approvals";
import { TimeOffBoard, type MemberOption, type RequestRow, type LeaderRow } from "./TimeOffBoard";
import { one, type Embedded } from "@/kernel/config/embedded";
import { saigonToday } from "@/kernel/config/dates";

// Belt-and-braces: this repo has seen supabase fetches cache-frozen on Vercel
// despite force-dynamic (see the stats route). A stale requests board means an
// admin misses new leave, so pin the data cache off explicitly.
// Operations → Time Off. Employees self-serve in /team/time-off; their leave
// policy decides the path (Edge8 Core Team auto-approves, On Target is manual).
// This board is awareness-first: upcoming and pending leave up top with the
// decision controls (approve/reject pending, deny an auto-approval), 2026
// usage cards, then the full log. The admin "log time off for someone" form is
// deliberately secondary — admins rarely file leave on someone's behalf.

type Person = { full_name: string | null; email: string };
type MemberEmbed = { id: string; people: Embedded<Person> };

type TeamRow = { id: string; people: Embedded<Person> };
type TimeOffRow = {
  id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  reason: string | null;
  days: number | string | null;
  created_at: string;
  approved_at: string | null;
  external_source: string | null;
  team_members: Embedded<MemberEmbed>;
};

// Prefer the recorded day count — an imported row's already excluded its
// holidays, and since T.1 an in-app row stores the count it was agreed at.
// Rows that predate the column fall back to a fresh count, which now subtracts
// office closures too.
function daysOf(r: TimeOffRow, holidays: string[]): number {
  const n = r.days === null || r.days === undefined ? NaN : Number(r.days);
  return Number.isFinite(n) ? n : countWorkingDays(r.start_date, r.end_date, r.is_half_day, holidays);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function TimeOffPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("time-off.manage");
  const [teamRes, offRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select("id, people!person_id(display_name, preferred_name, full_name, email)")
      .eq("status", "active"),
    companyOs
      .from("time_off")
      .select(
        "id, leave_type, status, start_date, end_date, is_half_day, reason, days, created_at, approved_at, external_source, team_members!team_member_id(id, people!person_id(display_name, preferred_name, full_name, email))",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const members: MemberOption[] = ((teamRes.data ?? []) as TeamRow[])
    .map((t) => ({ id: t.id, name: personName(one(t.people)) }))
    .sort((a, b) => byFirstName(a.name, b.name));

  const raw = (offRes.data ?? []) as TimeOffRow[];

  const today = saigonToday();

  // The office-closure calendar covering every row this board renders a count
  // for, plus next year so the "log time off" form previews future dates right.
  const oldest = raw.reduce<string>((min, r) => (r.start_date < min ? r.start_date : min), today);
  const holidays = await listHolidayDates(oldest, `${Number(today.slice(0, 4)) + 1}-12-31`);

  // Who decided each request lives on its approval (S.5 contract), not on the
  // leave row. Read whole rather than by a thousand-id filter, a page at a time:
  // PostgREST returns at most a thousand rows, and a decision cut off would read
  // as approved by policy. A failed page raises for the same reason (S.19.11).
  const decisions: { subject_id: string; decided_by: string | null; metadata: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = mustRows(
      await companyOs
        .from("approvals")
        .select("subject_id, decided_by, metadata")
        .eq("subject_type", "time_off")
        .in("state", ["approved", "rejected"])
        .order("decided_at", { ascending: true })
        .order("id")
        .range(from, from + 999),
      "[operations/time-off] leave decisions",
    );
    decisions.push(...page);
    if (page.length < 1000) break;
  }
  // Oldest first above, so a request decided twice keeps its latest decider.
  // A policy approval is nobody's decision and is left out (A.30).
  const deciderByRequest = humanDeciders(decisions);
  // A decider who is not an Edge8 team member is a client manager, deciding in
  // the portal; the board names them, as it named client_approved_by before.
  const deciderIds = [...new Set(decisions.map((d) => d.decided_by).filter((id): id is string => !!id))];
  const deciders = deciderIds.length
    ? mustRows(
        await companyOs.from("people").select("id, display_name, preferred_name, full_name, email, is_team_member").in("id", deciderIds),
        "[operations/time-off] deciders",
      )
    : [];
  const clientNameById = new Map(deciders.filter((p) => !p.is_team_member).map((p) => [p.id, personName(p)]));
  const rows: RequestRow[] = raw.map((r) => ({
    id: r.id,
    memberName: personName(one(one(r.team_members)?.people ?? null)),
    leaveType: r.leave_type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
    reason: r.reason,
    days: daysOf(r, holidays),
    requestedAt: r.created_at,
    // Approved by policy, not by a person: no human decider among its
    // approvals, and not imported.
    isAutoApproved: approvedByPolicy(r, deciderByRequest),
    clientApproverName: clientNameById.get(deciderByRequest.get(r.id) ?? "") ?? null,
  }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // The primary table: anything still needing attention — pending requests
  // (whatever their dates) and approved leave that hasn't finished yet.
  const upcoming = rows
    .filter((r) => r.status === "requested" || (r.status === "approved" && r.endDate >= today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const pending = rows.filter((r) => r.status === "requested").length;
  const newThisWeek = rows.filter((r) => r.requestedAt >= weekAgo).length;

  const counted = (r: RequestRow) =>
    (r.status === "approved" || r.status === "taken") && r.startDate.startsWith("2026");
  const total2026 = round1(rows.filter(counted).reduce((s, r) => s + r.days, 0));

  // Days off per ACTIVE member in 2026, zeros included — the bottom five is the
  // "who isn't taking any leave" signal, so absence of rows must still rank.
  const byMember = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const r of raw) {
    if (!(r.status === "approved" || r.status === "taken")) continue;
    if (!r.start_date.startsWith("2026")) continue;
    const m = one(r.team_members);
    if (!m || !byMember.has(m.id)) continue;
    byMember.set(m.id, (byMember.get(m.id) ?? 0) + daysOf(r, holidays));
  }
  const leaders: LeaderRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    days: round1(byMember.get(m.id) ?? 0),
  }));
  const topFive = [...leaders].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)).slice(0, 5);
  const bottomFive = [...leaders].sort((a, b) => a.days - b.days || a.name.localeCompare(b.name)).slice(0, 5);

  const error = teamRes.error?.message ?? offRes.error?.message ?? null;

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Time Off"
        sub="Edge8 policy auto-approves; On Target waits for a decision. Deny anything that doesn't work."
        action={
          <div className="u-row">
            <Link href="/admin/operations/time-off/policies" className="admin-btn">
              Policies
            </Link>
          </div>
        }
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Pending approval" value={pending} />
        <MetricCard label="New this week" value={newThisWeek} />
        <MetricCard label="Days off in 2026" value={formatLeaveBalance(total2026)} />
      </div>

      <ViewToggle
        views={[
          {
            key: "board",
            label: "Board",
            content: (
              <TimeOffBoard
                members={members}
                upcoming={upcoming}
                all={rows}
                topFive={topFive}
                bottomFive={bottomFive}
                holidays={holidays}
              />
            ),
          },
          {
            key: "calendar",
            label: "Calendar",
            content: (
              <div className="admin-card admin-section-card">
                <h2 className="admin-card-title">Team calendar</h2>
                <TimeOffCalendar
                  entries={rows.map(
                    (r): CalendarEntry => ({
                      id: r.id,
                      name: r.memberName,
                      leaveType: r.leaveType,
                      status: r.status,
                      startDate: r.startDate,
                      endDate: r.endDate,
                      isHalfDay: r.isHalfDay,
                    }),
                  )}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
