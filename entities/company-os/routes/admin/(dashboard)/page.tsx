import { requirePermission } from "@/kernel/identity/access-request";
import { selectKeyResults } from "@/entities/org";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { selectDeals, selectLead } from "@/entities/crm";
import { selectIdeas } from "@/entities/ideas";
import { selectApplications, selectJobRequisitions } from "@/entities/hiring";
import { INVOICE_VOIDED, invoiceUsd, selectInvoices } from "@/entities/finance";
// time_off is the time-off entity's table; its door hands back the builder.
import { selectTimeOff } from "@/entities/time-off";
import { PageHead } from "@/kernel/ui/PageHead";
import { WaitingOnYou } from "./WaitingOnYou";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents } from "@/kernel/ui/format";
import { getOfficeGoals, krStatusTone, type OfficeKey, type OfficeSnapshot, KR_STATUSES, type KrStatus } from "@/entities/org";
import { compactUsd, vsPrior, MS_DAY } from "@/entities/company-os";
import { getWorkboard, listBoardManageOptions } from "@/entities/boards";
import { Workboard } from "@/entities/boards";
import { moveCardColumn } from "@/entities/boards";

// Live operational data, read fresh on every request.
export const metadata = {
  title: "Company Dashboard",
  description: "The company at a glance, one panel per office. Each office's full picture lives on its cockpit.",
};

// Work-request statuses that are finished; anything else is still in flight.
const WR_TERMINAL = "(completed,rejected,cancelled,draft)";

const STATUS_LABEL: Record<KrStatus, string> = {
  on_track: "on track",
  at_risk: "at risk",
  off_track: "off track",
  done: "done",
};

type InvoiceRow = { txn_date: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; entity: string };
type OrderRow = { created_at: string; amount_usd_cents: number | null; status: string | null };
type DealRow = { status: string | null; amount_usd_cents: number | null; created_at: string; closed_at: string | null };

type Stat = { label: string; value: React.ReactNode; sub: string; href?: string };

function OfficeStat({ label, value, sub, href }: Stat) {
  const inner = (
    <>
      <div className="admin-office-stat-label">{label}</div>
      <div className="admin-office-stat-val">{value}</div>
      <div className="admin-office-stat-sub">{sub}</div>
    </>
  );
  return href ? (
    <Link href={href} className="admin-office-stat">
      {inner}
    </Link>
  ) : (
    <div className="admin-office-stat">{inner}</div>
  );
}

// One office card: header (accent dot + name + cockpit link), three KPI tiles,
// and that office's goal-health chips pinned to the bottom.
function OfficePanel({
  office,
  label,
  snapshot,
  quarterLabel,
  stats,
}: {
  office: OfficeKey;
  label: string;
  snapshot: OfficeSnapshot;
  quarterLabel: string;
  stats: Stat[];
}) {
  const chips = KR_STATUSES.filter((s) => snapshot.health[s] > 0);
  const noGoals = snapshot.health.total === 0;
  return (
    <section className={`admin-office-panel admin-office-panel--${office}`}>
      <div className="admin-office-head">
        <div className="admin-office-title">
          <span className="admin-office-dot" aria-hidden />
          <span className="admin-office-name">{label}</span>
        </div>
        <Link href={`/admin/${office}`} className="admin-auth-link">
          Cockpit →
        </Link>
      </div>
      <div className="admin-office-kpis">
        {stats.map((s) => (
          <OfficeStat key={s.label} {...s} />
        ))}
      </div>
      <div className="admin-office-goals">
        <span className="admin-office-goals-label">{quarterLabel} goals</span>
        {noGoals ? (
          <span className="admin-office-stat-sub">none set</span>
        ) : (
          chips.map((s) => (
            <Badge key={s} tone={krStatusTone(s)} dot>
              {snapshot.health[s]} {STATUS_LABEL[s]}
            </Badge>
          ))
        )}
        {snapshot.openIssues > 0 && (
          <Badge tone="err">
            {snapshot.openIssues} open {snapshot.openIssues === 1 ? "issue" : "issues"}
          </Badge>
        )}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  // The page's declared permission (ADR 0013).
  const { user: admin } = await requirePermission("surface.admin");
  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const tomorrow = new Date(now.getTime() + MS_DAY).toISOString().slice(0, 10);
  const date30 = new Date(now.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  const iso60 = new Date(now.getTime() - 60 * MS_DAY).toISOString();
  const iso90 = new Date(now.getTime() - 90 * MS_DAY).toISOString();

  const [
    invoicesRes,
    ordersRes,
    dealsRes,
    leadsRes,
    teamRes,
    openReqsRes,
    appsRes,
    daysOffRes,
    reqRes,
    botRes,
    ideasRes,
    krRes,
    goals,
  ] = await Promise.all([
    selectInvoices("txn_date, amount_cents, amount_usd_cents, currency, status, entity").neq("status", INVOICE_VOIDED).limit(2000),
    companyOs.from("orders").select("created_at, amount_usd_cents, status").limit(2000),
    selectDeals("status, amount_usd_cents, created_at, closed_at").is("archived_at", null).limit(2000),
    selectLead("created_at").gte("created_at", iso90).limit(1000),
    companyOs.from("team_members").select("status, start_date").limit(1000),
    selectJobRequisitions("id", { count: "exact", head: true }).eq("status", "open"),
    selectApplications("applied_at").gte("applied_at", iso60).limit(2000),
    selectTimeOff("id", { count: "exact", head: true }).eq("status", "approved").gte("start_date", date30),
    companyOs.from("contractor_work_requests").select("id", { count: "exact", head: true }).not("status", "in", WR_TERMINAL),
    companyOs.from("assistant_conversations").select("id", { count: "exact", head: true }).is("archived_at", null).gte("last_message_at", iso30),
    selectIdeas("kind, created_at").neq("status", "archived").limit(1000),
    selectKeyResults("delivery_mix"),
    getOfficeGoals(),
  ]);

  const err =
    invoicesRes.error || ordersRes.error || dealsRes.error || leadsRes.error || teamRes.error ||
    appsRes.error || ideasRes.error || krRes.error;

  // ── Revenue ──
  const invoices = ((invoicesRes.data as InvoiceRow[] | null) ?? []).filter((i) => i.txn_date);
  const paidOrders = ((ordersRes.data as OrderRow[] | null) ?? []).filter((o) => o.status === "paid");
  const invoiceCash = (from: string, to: string, entity?: "edge8" | "aio") =>
    invoices.reduce(
      (s, i) => (i.txn_date! >= from && i.txn_date! < to && (!entity || i.entity === entity) ? s + invoiceUsd(i) : s),
      0,
    );
  const stripeCash = (from: string, to: string) =>
    paidOrders.reduce((s, o) => {
      const d = o.created_at.slice(0, 10);
      return d >= from && d < to ? s + (o.amount_usd_cents ?? 0) : s;
    }, 0);
  const cashBetween = (from: string, to: string) => invoiceCash(from, to) + stripeCash(from, to);

  const cash30 = cashBetween(date30, tomorrow);
  const cashYtd = cashBetween(yearStart, tomorrow);
  const rev30Edge8 = invoiceCash(date30, tomorrow, "edge8") + stripeCash(date30, tomorrow);
  const rev30Aio = invoiceCash(date30, tomorrow, "aio");

  const deals = (dealsRes.data as DealRow[] | null) ?? [];
  const openDeals = deals.filter((d) => d.status === "open");
  const openPipeline = openDeals.reduce((s, d) => s + (d.amount_usd_cents ?? 0), 0);
  const dealsAdded30 = deals.filter((d) => d.created_at >= iso30).length;

  const leadDates = ((leadsRes.data as { created_at: string }[] | null) ?? []).map((l) => l.created_at);
  const newLeads30 = leadDates.filter((d) => d >= iso30).length;
  const newLeadsPrev30 = leadDates.filter((d) => d >= iso60 && d < iso30).length;
  const leads90 = leadDates.filter((d) => d >= iso90).length;
  const won90 = deals.filter((d) => d.status === "won" && d.closed_at && d.closed_at >= iso90).length;
  const conversion90 = leads90 ? Math.round((won90 / leads90) * 1000) / 10 : 0;

  // ── Talent ──
  const team = (teamRes.data as { status: string | null; start_date: string | null }[] | null) ?? [];
  const headcount = team.filter((t) => t.status === "active").length;
  const newHires = team.filter((t) => t.start_date && t.start_date >= yearStart).length;
  const apps = (appsRes.data as { applied_at: string | null }[] | null) ?? [];
  const apps30 = apps.filter((a) => a.applied_at && a.applied_at >= iso30).length;
  const appsPrev30 = apps.filter((a) => a.applied_at && a.applied_at >= iso60 && a.applied_at < iso30).length;
  const openRoles = openReqsRes.count ?? 0;

  // ── Operations ──
  const daysOff30 = daysOffRes.count ?? 0;
  const openRequests = reqRes.count ?? 0;
  const botCount = botRes.count ?? 0;

  // ── Innovation ──
  const ideas = (ideasRes.data as { kind: string | null; created_at: string }[] | null) ?? [];
  const buildIdeas = ideas.filter((i) => i.kind === "build").length;
  const learnings30 = ideas.filter((i) => i.kind === "learning" && i.created_at >= iso30).length;
  const krs = (krRes.data as { delivery_mix: string | null }[] | null) ?? [];
  const mixTotal = krs.length;
  const agentShare = mixTotal
    ? Math.round((krs.filter((k) => k.delivery_mix === "ai" || k.delivery_mix === "blended").length / mixTotal) * 100)
    : 0;

  const q = goals.quarter.label;

  // The company Workboard: every open card on every active board (WB-02).
  // The admin's own person row marks cards freshly assigned to them as New.
  const [workboard, boardOptions] = await Promise.all([
    getWorkboard({ scope: { kind: "all" } }),
    listBoardManageOptions(),
  ]);
  let viewerPersonId: string | null = null;
  if (admin) {
    const { data: viewer, error: viewerError } = await companyOs
      .from("people")
      .select("id")
      .eq("email", admin.email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (viewerError) console.error("[dashboard] viewer lookup failed:", viewerError.message);
    viewerPersonId = (viewer as { id: string } | null)?.id ?? null;
  }

  return (
    <>
      <PageHead
        eyebrow="Company OS"
        title="Company Dashboard"
        sub="The company at a glance, one panel per office. Open a cockpit for the full picture."
      />

      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err.message}
        </div>
      )}

      {/* ── Vitals ── */}
      <div className="admin-kpi-grid">
        <MetricCard
          label="Revenue · 30d"
          value={formatCents(cash30)}
          sub={
            <>
              <div>Edge8 {compactUsd(rev30Edge8)}</div>
              <div>AIO {compactUsd(rev30Aio)}</div>
            </>
          }
        />
        <MetricCard label="Pipeline · 30d" value={formatCents(openPipeline)} sub={`${openDeals.length} open · ${dealsAdded30} added`} href="/admin/revenue/deals" />
        <MetricCard label="Headcount" value={headcount} sub="active team members" href="/admin/talent" />
        <MetricCard
          label="Open issues"
          value={goals.openIssuesTotal}
          sub={goals.openIssuesTotal === 0 ? "nothing on the board" : "across the offices"}
          href="/admin/edges/issues"
        />
      </div>

      {/* ── Four offices ── */}
      <div className="admin-office-grid">
        <OfficePanel
          office="revenue"
          label="Revenue"
          snapshot={goals.byOffice.revenue}
          quarterLabel={q}
          stats={[
            { label: "Revenue · YTD", value: formatCents(cashYtd), sub: `${year} to date`, href: "/admin/revenue" },
            { label: "New leads · 30d", value: newLeads30, sub: vsPrior(newLeads30, newLeadsPrev30), href: "/admin/revenue/leads" },
            { label: "Conversion · 90d", value: `${conversion90}%`, sub: "lead → won", href: "/admin/revenue" },
          ]}
        />
        <OfficePanel
          office="talent"
          label="Talent"
          snapshot={goals.byOffice.talent}
          quarterLabel={q}
          stats={[
            { label: "Open roles", value: openRoles, sub: "hiring now", href: "/admin/talent/jobs" },
            { label: "Applications · 30d", value: apps30, sub: vsPrior(apps30, appsPrev30), href: "/admin/talent/applications" },
            { label: `New hires · ${year}`, value: newHires, sub: "joined this year", href: "/admin/talent" },
          ]}
        />
        <OfficePanel
          office="operations"
          label="Operations"
          snapshot={goals.byOffice.operations}
          quarterLabel={q}
          stats={[
            { label: "Days off · 30d", value: daysOff30, sub: "approved leave", href: "/admin/operations/time-off/requests" },
            { label: "Open requests", value: openRequests, sub: "contractor + client", href: "/admin/operations/contractor-requests" },
            { label: "Chat bot · 30d", value: botCount, sub: "assistant chats", href: "/admin/operations" },
          ]}
        />
        <OfficePanel
          office="innovation"
          label="Innovation"
          snapshot={goals.byOffice.innovation}
          quarterLabel={q}
          stats={[
            { label: "Ideas", value: buildIdeas, sub: "open build ideas", href: "/admin/innovation" },
            { label: "Learning · 30d", value: learnings30, sub: "learnings logged", href: "/admin/innovation" },
            { label: "AI delivery mix", value: `${agentShare}%`, sub: mixTotal ? "agent-run KRs" : "no KRs yet", href: "/admin/innovation" },
          ]}
        />
      </div>

      {admin && <WaitingOnYou email={admin.email} />}

      {/* ── Workboard ── */}
      <section className="admin-card admin-section-card u-mt-5">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Workboard</h2>
          <span className="admin-cell-muted u-sm">
            {workboard.cards.length} {workboard.cards.length === 1 ? "card" : "cards"} across {workboard.boards.length}{" "}
            {workboard.boards.length === 1 ? "board" : "boards"}
          </span>
        </div>
        <Workboard
          data={workboard}
          onMove={moveCardColumn}
          viewerPersonId={viewerPersonId}
          teamOptions={boardOptions.team}
          clientOptions={boardOptions.clients}
          programOptions={boardOptions.programs}
        />
      </section>
    </>
  );
}
