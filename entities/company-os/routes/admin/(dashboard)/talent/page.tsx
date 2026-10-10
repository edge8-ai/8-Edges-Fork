import { requirePermission } from "@/kernel/identity/access-request";
import { selectOnboardingPlans } from "@/entities/onboarding";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { selectApplications, selectJobRequisitions } from "@/entities/hiring";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Band } from "@/kernel/ui/Band";
import { BarChart } from "@/kernel/ui/charts/BarChart";
import { DonutChart } from "@/kernel/ui/charts/DonutChart";
import { OfficeGoalsCard, getOfficeGoals, healthSummary } from "@/entities/org";
import { one, vsPrior, monthsThisYear, MS_DAY } from "@/entities/company-os";

// Live operational data; never serve a frozen render after a write elsewhere.
export const metadata = {
  title: "Talent cockpit",
  description: "The Talent office in two bands: the team we have, and the hiring that grows it.",
};

type TeamRow = { status: string | null; start_date: string | null; end_date: string | null; departments: unknown };
type AppRow = { status: string | null; applied_at: string | null; decided_at: string | null; job_requisition_id: string | null };
type ReqRow = { id: string; title: string | null; status: string | null; opened_at: string | null; closed_at: string | null };

// 2026-07-08: the ATS import cleanup swept ~25 long-stale reqs to "filled" in
// one batch, so their closed_at is the sweep date, not a hire date. Excluded
// from days-to-hire so one cleanup doesn't read as 350-day hiring.
const ATS_CLEANUP_SWEEP_DATE = "2026-07-08";

export default async function TalentCockpitPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.admin");
  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  const iso60 = new Date(now.getTime() - 60 * MS_DAY).toISOString();

  const [teamRes, appsRes, openReqsRes, onboardingRes, goals] = await Promise.all([
    companyOs.from("team_members").select("status, start_date, end_date, departments!department_id(name)").limit(1000),
    selectApplications("status, applied_at, decided_at, job_requisition_id").limit(3000),
    selectJobRequisitions("id, title, status, opened_at, closed_at")
      .in("status", ["open", "filled"])
      .order("opened_at", { ascending: false }),
    selectOnboardingPlans("stage"),
    getOfficeGoals(),
  ]);

  const err = teamRes.error || appsRes.error || openReqsRes.error || onboardingRes.error;

  // ── Team: the people we have ──
  const team = (teamRes.data as TeamRow[] | null) ?? [];
  const active = team.filter((t) => t.status === "active");
  const headcount = active.length;
  // Turnover counts departures by end_date — but most imported terminated/
  // alumni rows carry no end_date, so surface the undated count rather than
  // silently undercounting. Backfill lives on /admin/talent/team (Past tab).
  const departed = team.filter((t) => t.status === "terminated" || t.status === "alumni");
  const turnover = departed.filter((t) => t.end_date && t.end_date >= yearStart).length;
  const undatedDepartures = departed.filter((t) => !t.end_date).length;
  const newHires = team.filter((t) => t.start_date && t.start_date >= yearStart).length;

  const byDept = new Map<string, number>();
  for (const t of active) {
    const name = one(t.departments as { name: string | null } | null)?.name ?? "Uncategorized";
    byDept.set(name, (byDept.get(name) ?? 0) + 1);
  }
  const deptChart = [...byDept.entries()].map(([label, value]) => ({ label, value }));

  const onboarding = ((onboardingRes.data as { stage: string | null }[] | null) ?? []).filter(
    (p) => p.stage && p.stage !== "complete",
  ).length;

  // ── Hiring: the people we're getting ──
  const apps = (appsRes.data as AppRow[] | null) ?? [];
  const activeApps = apps.filter((a) => a.status === "active").length;
  const apps30 = apps.filter((a) => a.applied_at && a.applied_at >= iso30).length;
  const appsPrev30 = apps.filter((a) => a.applied_at && a.applied_at >= iso60 && a.applied_at < iso30).length;

  const conversion = apps.length ? Math.round((apps.filter((a) => a.status === "hired").length / apps.length) * 1000) / 10 : 0;

  // Days to hire: per ROLE, opened_at → closed_at over filled requisitions.
  // Excludes the cleanup-sweep batch (closed_at is the sweep date, not a hire)
  // and retro-created reqs (opened = closed same day: no real search ran).
  const allReqs = (openReqsRes.data as ReqRow[] | null) ?? [];
  const filledOrganic = allReqs.filter(
    (r) =>
      r.status === "filled" &&
      r.opened_at &&
      r.closed_at &&
      r.closed_at.slice(0, 10) !== ATS_CLEANUP_SWEEP_DATE &&
      r.closed_at.slice(0, 10) > r.opened_at.slice(0, 10),
  );
  const daysToHire = filledOrganic.length
    ? Math.round(
        filledOrganic.reduce(
          (s, r) => s + (new Date(r.closed_at!).getTime() - new Date(r.opened_at!).getTime()) / MS_DAY,
          0,
        ) / filledOrganic.length,
      )
    : null;

  const appsByMonth = monthsThisYear(now).map(({ label, from, to }) => ({
    label,
    value: apps.filter((a) => a.applied_at && a.applied_at >= from && a.applied_at < to).length,
  }));

  // Hiring pipeline: open reqs with their count of active applications.
  const openReqs = allReqs.filter((r) => r.status === "open");
  const activeByReq = new Map<string, number>();
  for (const a of apps) {
    if (a.status === "active" && a.job_requisition_id) {
      activeByReq.set(a.job_requisition_id, (activeByReq.get(a.job_requisition_id) ?? 0) + 1);
    }
  }
  const pipeline = openReqs
    .map((r) => ({ id: r.id, title: r.title ?? "Untitled role", active: activeByReq.get(r.id) ?? 0 }))
    .sort((a, b) => b.active - a.active);

  const talent = goals.byOffice.talent;
  const chips = healthSummary(talent.health);

  return (
    <>
      <PageHead
        eyebrow="Four Offices · Talent"
        title="Talent cockpit"
        sub="The team we have, and the hiring that grows it."
      />

      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err.message}
        </div>
      )}

      {/* ── TEAM ── */}
      <Band label="Team" note={chips ? `goals: ${chips}` : undefined} />
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="Headcount" value={headcount} sub="active team members" href="/admin/talent/team" />
        <MetricCard label={`New hires · ${year}`} value={newHires} sub="joined this year" href="/admin/talent/team" />
        <MetricCard
          label={`Turnover · ${year}`}
          value={turnover}
          sub={
            undatedDepartures > 0
              ? `+${undatedDepartures} departures missing an end date`
              : "left this year"
          }
          href="/admin/talent/team"
        />
        <MetricCard label="Onboarding" value={onboarding} sub="in cycle now" href="/admin/talent/onboarding" />
      </div>
      <div className="admin-cockpit-cols u-mb-2">
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Headcount by department</div>
          <DonutChart data={deptChart} centerLabel="people" ariaLabel="Active team members by department" />
        </div>
        <OfficeGoalsCard snapshot={talent} quarterLabel={goals.quarter.label} />
      </div>

      {/* ── HIRING ── */}
      <Band label="Hiring" note={`${openReqs.length} open ${openReqs.length === 1 ? "role" : "roles"} · ${activeApps} active applications`} />
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="Open roles" value={openReqs.length} sub="hiring now" href="/admin/talent/jobs" />
        <MetricCard label="Applications · 30d" value={apps30} sub={vsPrior(apps30, appsPrev30)} href="/admin/talent/applications" />
        <MetricCard
          label="Days to hire"
          value={daysToHire ?? "—"}
          sub={`avg per role · ${filledOrganic.length} filled`}
          href="/admin/talent/jobs"
        />
        <MetricCard label="Conversion" value={`${conversion}%`} sub="application → hire" href="/admin/talent/applications" />
      </div>
      <div className="admin-cockpit-cols">
        <div className="admin-card admin-chart-card">
          <div className="admin-kpi-label">Applications by month · {year}</div>
          <BarChart data={appsByMonth} ariaLabel="Job applications received by month" emptyText="No applications this year." />
        </div>
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Hiring pipeline</h2>
          {pipeline.length === 0 ? (
            <div className="admin-empty">No open roles.</div>
          ) : (
            <div className="admin-list">
              {pipeline.slice(0, 8).map((r) => (
                <div key={r.id} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">
                      <Link href={`/admin/talent/jobs/${r.id}`}>{r.title}</Link>
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-list-sub">{r.active} active</span>
                  </div>
                </div>
              ))}
              <div className="u-pt-3">
                <Link href="/admin/talent/jobs" className="admin-auth-link">
                  Open job reqs →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
