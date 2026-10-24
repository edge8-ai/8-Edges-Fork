import { requirePermission } from "@/kernel/identity/access-request";
import { selectEquipment } from "@/entities/org";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
// time_off is the time-off entity's table; its door hands back the builder.
import { selectTimeOff } from "@/entities/time-off";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Band } from "@/kernel/ui/Band";
import { BarChart } from "@/kernel/ui/charts/BarChart";
import { OfficeGoalsCard, getOfficeGoals, healthSummary, getSurveyScore, FIXED_VND_PER_USD } from "@/entities/org";
import { one, monthsThisYear, MS_DAY } from "@/entities/company-os";
import { formatDate, timeAgo } from "@/kernel/ui/format";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Operations cockpit",
  description: "Two bands: who's in and who's out, then the workplace and internal service.",
};

// Work-request statuses that are finished; anything else is still in flight.
const WR_TERMINAL = "(completed,rejected,cancelled,draft)";

type LeaveRow = {
  start_date: string;
  end_date: string;
  leave_type: string | null;
  team_members: unknown;
};
type RequestRow = { id: string; title: string | null; created_at: string };

export default async function OperationsCockpitPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.operations");
  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const today = now.toISOString().slice(0, 10);
  const date30 = new Date(now.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * MS_DAY).toISOString().slice(0, 10);
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();

  const [leaveRes, pendingRes, equipRes, botRes, reqRes, employeeScore, goals] = await Promise.all([
    selectTimeOff(`start_date, end_date, leave_type, team_members!team_member_id(people!person_id(${NAME_COLUMNS}))`)
      .eq("status", "approved")
      .gte("end_date", yearStart)
      .order("start_date"),
    selectTimeOff("id", { count: "exact", head: true }).eq("status", "requested"),
    selectEquipment("cost_vnd"),
    companyOs
      .from("assistant_conversations")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("last_message_at", iso30),
    companyOs
      .from("contractor_work_requests")
      .select("id, title, created_at")
      .not("status", "in", WR_TERMINAL)
      .order("created_at", { ascending: false })
      .limit(20),
    getSurveyScore("team-pulse"),
    getOfficeGoals(),
  ]);

  const err = leaveRes.error || equipRes.error || botRes.error || reqRes.error;

  // ── Time off: who's in and who's out ──
  const leave = (leaveRes.data as LeaveRow[] | null) ?? [];
  const daysOff30 = leave.filter((l) => l.start_date >= date30).length;
  const outToday = leave.filter((l) => l.start_date <= today && l.end_date >= today).length;
  const pending = pendingRes.count ?? 0;

  const leaveByMonth = monthsThisYear(now).map(({ label, from, to }) => ({
    label,
    value: leave.filter((l) => l.start_date >= from && l.start_date < to).length,
  }));

  const outThisWeek = leave
    .filter((l) => l.end_date >= today && l.start_date <= in7)
    .map((l) => {
      const person = one(one(l.team_members as { people: unknown } | null)?.people as (NamedPerson & { email: string }) | null);
      return {
        name: personName(person, "Unknown"),
        type: (l.leave_type ?? "leave").replace(/[_-]+/g, " "),
        start: l.start_date,
        end: l.end_date,
      };
    });

  // ── Workplace & service ──
  const equipUsd = ((equipRes.data as { cost_vnd: number | null }[] | null) ?? []).reduce(
    (s, e) => s + (e.cost_vnd ?? 0),
    0,
  ) / FIXED_VND_PER_USD;

  const botCount = botRes.count ?? 0;
  const requests = (reqRes.data as RequestRow[] | null) ?? [];

  const ops = goals.byOffice.operations;
  const chips = healthSummary(ops.health);

  return (
    <>
      <PageHead
        eyebrow="Four Offices · Operations"
        title="Operations cockpit"
        sub="Who's in and who's out, then the workplace and internal service."
      />

      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err.message}
        </div>
      )}

      {/* ── TIME OFF ── */}
      <Band
        label="Time off"
        note={pending > 0 ? `${pending} ${pending === 1 ? "request" : "requests"} pending` : "no pending requests"}
      />
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="Days off · 30d" value={daysOff30} sub="approved leave" href="/admin/operations/time-off/requests" />
        <MetricCard label="Out today" value={outToday} sub={outToday === 0 ? "everyone's in" : "on leave now"} href="/admin/operations/time-off/requests" />
        <MetricCard label="Pending requests" value={pending} sub="awaiting approval" href="/admin/operations/time-off/requests" />
      </div>
      <div className="admin-cockpit-cols u-mb-2">
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Days off by month · {year}</div>
          <BarChart data={leaveByMonth} ariaLabel="Approved time off by month" emptyText="No time off this year." />
        </div>
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Out this week</h2>
          {outThisWeek.length === 0 ? (
            <div className="admin-empty">Everyone&apos;s in this week.</div>
          ) : (
            <div className="admin-list">
              {outThisWeek.slice(0, 8).map((l, i) => (
                <div key={`${l.name}-${l.start}-${i}`} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{l.name}</div>
                    <div className="admin-list-sub">{l.type}</div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-list-sub">
                      {l.start <= today ? `back ${formatDate(l.end)}` : `${formatDate(l.start)} – ${formatDate(l.end)}`}
                    </span>
                  </div>
                </div>
              ))}
              <div className="u-pt-3">
                <Link href="/admin/operations/time-off/requests" className="admin-auth-link">
                  Open time off →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── WORKPLACE & SERVICE ── */}
      <Band label="Workplace & service" note={chips ? `goals: ${chips}` : undefined} />
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Equipment value"
          value={`$${Math.round(equipUsd).toLocaleString("en-US")}`}
          sub="on the register"
          href="/admin/operations/equipment"
        />
        <MetricCard label="Open requests" value={requests.length} sub="contractor + client" href="/admin/operations/contractor-requests" />
        <MetricCard label="Chat bot · 30d" value={botCount} sub="assistant conversations" />
        <MetricCard
          label="Employee feedback"
          value={employeeScore.avg != null ? `${employeeScore.avg} / ${employeeScore.scale}` : "—"}
          sub={employeeScore.responses > 0 ? `team pulse · ${employeeScore.responses} responses` : "no responses yet"}
          href="/admin/operations/surveys"
        />
        {/* Company docs tile joins this row when the Documents feature ships —
            a dead "coming later" tile wraps alone and breaks the band. */}
      </div>
      <div className="admin-cockpit-cols">
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Open requests</h2>
          {requests.length === 0 ? (
            <div className="admin-empty">No open work requests.</div>
          ) : (
            <div className="admin-list">
              {requests.slice(0, 8).map((r) => (
                <div key={r.id} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{r.title || "Untitled request"}</div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-list-sub">{timeAgo(r.created_at)}</span>
                  </div>
                </div>
              ))}
              <div className="u-pt-3">
                <Link href="/admin/operations/contractor-requests" className="admin-auth-link">
                  Open requests →
                </Link>
              </div>
            </div>
          )}
        </div>
        <OfficeGoalsCard snapshot={ops} quarterLabel={goals.quarter.label} />
      </div>
    </>
  );
}
