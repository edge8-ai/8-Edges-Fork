import { requirePermission } from "@/kernel/identity/access-request";
import { keyResultDeliveryMixes } from "@/entities/org";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { leadsCreatedSince } from "@/entities/crm";
import { liveSparkKinds } from "@/entities/ideas";
import { applicationDatesSince, countOpenRequisitions } from "@/entities/hiring";
// time_off is the time-off entity's table; its door hands back the builder.
import { countApprovedLeaveStartingSince } from "@/entities/time-off";
import { PageHead } from "@/kernel/ui/PageHead";
import { cashCounter, companyVitals } from "@/entities/company-os/lib/company-vitals";
import { readVitalsRows } from "@/entities/company-os/routes/admin/(dashboard)/company-vitals-read";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents } from "@/kernel/ui/format";
import { getOfficeGoals, krStatusTone, type OfficeKey, type OfficeSnapshot, KR_STATUSES, type KrStatus } from "@/entities/org";
import { compactUsd, vsPrior, MS_DAY } from "@/entities/company-os";
import { loadFlow, type BoardFlow } from "@/entities/boards";
import { countActiveProgramsByCompany } from "@/entities/portal";
import { mustRows } from "@/kernel/data/read";
import { selectCompanies } from "@/kernel/identity/reads";
import { mayOpen } from "@/kernel/identity/may-open";
import { ChartCard } from "@/kernel/ui/dash/StatTile";
import { Columns } from "@/kernel/ui/dash/Columns";
import { AtsSectionHead } from "@/kernel/ui/talent";
// The open work requests are the work-requests entity's (ADR 0025).
import { countOpenWorkRequests } from "@/entities/work-requests";

// Live operational data, read fresh on every request.
export const metadata = {
  title: "Company Dashboard",
  description: "How well the company is doing, office by office, and how the work is flowing.",
};

const STATUS_LABEL: Record<KrStatus, string> = {
  on_track: "on track",
  at_risk: "at risk",
  off_track: "off track",
  done: "done",
};

type OrderRow = { created_at: string; amount_usd_cents: number | null; status: string | null };
type DealRow = { status: string | null; amount_usd_cents: number | null; created_at: string; closed_at: string | null };

type Fact = { label: string; value: React.ReactNode; note?: string; href?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Human Tokens sit on a 0.05 grid; print them without trailing zeros.
const ht = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");

type ClientWork = { id: string; name: string; cards: number; priorCards: number; tokens: number; priorTokens: number; open: number; late: number; blocked: number };

// Productivity across the active AI Program clients (Edge8 and EO among them):
// each client's boards summed, so a client with several boards reads as one
// row. Effort is Human Tokens, never hours; the figures describe clients'
// work, never a person.
function workByClient(boards: BoardFlow[], live: Set<string>, names: Map<string, string>): ClientWork[] {
  const rows = new Map<string, ClientWork>();
  for (const b of boards) {
    if (!b.clientCompanyId || !live.has(b.clientCompanyId)) continue;
    const r = rows.get(b.clientCompanyId) ?? { id: b.clientCompanyId, name: names.get(b.clientCompanyId) ?? b.name, cards: 0, priorCards: 0, tokens: 0, priorTokens: 0, open: 0, late: 0, blocked: 0 };
    r.cards += b.finished.cards;
    r.priorCards += b.finished.priorCards;
    r.tokens += b.finished.tokens;
    r.priorTokens += b.finished.priorTokens;
    r.open += b.open;
    r.late += b.overdue;
    r.blocked += b.blocked;
    rows.set(b.clientCompanyId, r);
  }
  return [...rows.values()].sort((a, b) => b.tokens - a.tokens || b.cards - a.cards || a.name.localeCompare(b.name));
}

// One office: its figures as label and value at reading size (the Talent
// type scale), each linking to the page behind it, then the quarter's goal
// health. The Dashboard is the data page; what needs the reader lives on Home.
function OfficeSection({
  office,
  label,
  snapshot,
  quarterLabel,
  facts,
}: {
  office: OfficeKey;
  label: string;
  snapshot: OfficeSnapshot;
  quarterLabel: string;
  facts: Fact[];
}) {
  const chips = KR_STATUSES.filter((s) => snapshot.health[s] > 0);
  return (
    <section className="admin-card admin-section-card co-office" aria-label={label}>
      <AtsSectionHead
        k="Office"
        title={label}
        aside={
          <Link href={`/admin/${office}`} className="admin-auth-link">
            Cockpit →
          </Link>
        }
      />
      <dl className="co-facts">
        {facts.map((f) => (
          <div key={f.label} className="co-fact">
            <dt>{f.label}</dt>
            <dd>
              {f.href ? <Link href={f.href}>{f.value}</Link> : f.value}
              {f.note && <small>{f.note}</small>}
            </dd>
          </div>
        ))}
        <div className="co-fact">
          <dt>{quarterLabel} goals</dt>
          <dd className="co-fact-chips">
            {snapshot.health.total === 0 ? (
              <span className="admin-cell-muted">None set</span>
            ) : (
              chips.map((s) => (
                <Badge key={s} tone={krStatusTone(s)} dot>
                  {snapshot.health[s]} {STATUS_LABEL[s]}
                </Badge>
              ))
            )}
            {snapshot.openIssues > 0 && <Badge tone="err">{plural(snapshot.openIssues, "open issue")}</Badge>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default async function DashboardPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.admin");
  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const tomorrow = new Date(now.getTime() + MS_DAY).toISOString().slice(0, 10);
  const date30 = new Date(now.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  const iso60 = new Date(now.getTime() - 60 * MS_DAY).toISOString();
  const iso90 = new Date(now.getTime() - 90 * MS_DAY).toISOString();

  const [
    { invoicesRes, ordersRes, dealsRes, teamRes },
    leadsRes,
    openReqsRes,
    appsRes,
    daysOffRes,
    reqRes,
    botRes,
    ideasRes,
    krRes,
    goals,
  ] = await Promise.all([
    readVitalsRows(),
    leadsCreatedSince(iso90, 1000),
    countOpenRequisitions(),
    applicationDatesSince(iso60, 2000),
    countApprovedLeaveStartingSince(date30),
    countOpenWorkRequests(),
    companyOs.from("assistant_conversations").select("id", { count: "exact", head: true }).is("archived_at", null).gte("last_message_at", iso30),
    liveSparkKinds(),
    keyResultDeliveryMixes(),
    getOfficeGoals(),
  ]);

  const err =
    invoicesRes.error || ordersRes.error || dealsRes.error || leadsRes.error || teamRes.error ||
    appsRes.error || ideasRes.error || krRes.error;

  // ── Revenue ── The four vitals come from the arithmetic Home's Company card
  // shares (lib/company-vitals.ts), so the two screens agree.
  const invoices = invoicesRes.data ?? [];
  const orders = (ordersRes.data as OrderRow[] | null) ?? [];
  const deals: DealRow[] = dealsRes.data ?? [];
  const team = (teamRes.data as { status: string | null; start_date: string | null }[] | null) ?? [];
  const vitals = companyVitals({ invoices, orders, deals, team, openIssues: goals.openIssuesTotal }, now);
  const cashYtd = cashCounter(invoices, orders).cashBetween(yearStart, tomorrow);

  const leadDates = (leadsRes.data ?? []).map((l) => l.created_at);
  const newLeads30 = leadDates.filter((d) => d >= iso30).length;
  const newLeadsPrev30 = leadDates.filter((d) => d >= iso60 && d < iso30).length;
  const leads90 = leadDates.filter((d) => d >= iso90).length;
  const won90 = deals.filter((d) => d.status === "won" && d.closed_at && d.closed_at >= iso90).length;
  const conversion90 = leads90 ? Math.round((won90 / leads90) * 1000) / 10 : 0;

  // ── Talent ──
  const newHires = team.filter((t) => t.start_date && t.start_date >= yearStart).length;
  const apps = appsRes.data ?? [];
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
  const krs = krRes.data ?? [];
  const mixTotal = krs.length;
  const agentShare = mixTotal
    ? Math.round((krs.filter((k) => k.delivery_mix === "ai" || k.delivery_mix === "blended").length / mixTotal) * 100)
    : 0;

  const q = goals.quarter.label;

  // Work analytics in place of the Workboard (Dave, 17 Nov): the Flow view's
  // figures, for a reader who may open the Flow view itself.
  const flow = mayOpen(access, "/admin/edges/workboard/flow") ? await loadFlow(now) : null;
  const created12 = flow ? flow.weekly.reduce((n, w) => n + w.created, 0) : 0;
  const completed12 = flow ? flow.weekly.reduce((n, w) => n + w.completed, 0) : 0;
  const workingBoards = flow ? flow.perBoard.filter((b) => b.open > 0).length : 0;
  let clients: ClientWork[] = [];
  if (flow) {
    const live = await countActiveProgramsByCompany();
    const ids = [...new Set(flow.perBoard.map((b) => b.clientCompanyId).filter((id): id is string => !!id && live.has(id)))];
    const names = ids.length
      ? new Map(
          (mustRows(await selectCompanies("id, name").in("id", ids), "[dashboard] client names") as { id: string; name: string | null }[]).map(
            (c) => [c.id, c.name ?? "(no name)"],
          ),
        )
      : new Map<string, string>();
    clients = workByClient(flow.perBoard, new Set(live.keys()), names);
  }
  // The name links only for a reader the company page would let in.
  const mayOpenCompany = mayOpen(access, "/admin/revenue/companies");
  const sum = (k: "cards" | "priorCards" | "tokens" | "priorTokens") => clients.reduce((n, c) => n + c[k], 0);

  const offices = Object.values(goals.byOffice);
  const health = KR_STATUSES.filter((s) => s !== "done")
    .map((s) => ({ s, n: offices.reduce((sum, o) => sum + o.health[s], 0) }))
    .filter((h) => h.n > 0)
    .map((h) => `${h.n} ${STATUS_LABEL[h.s]}`)
    .join(", ");
  const title = `${compactUsd(vitals.cash30)} collected in the last 30 days, ${compactUsd(vitals.openPipeline)} in open pipeline.`;
  const sub = [
    `${plural(vitals.headcount, "full-time employee")}.`,
    health ? `${q} goals: ${health}.` : `No ${q} goals set.`,
    vitals.openIssues > 0 ? `${plural(vitals.openIssues, "open issue")} across the offices.` : "No open issues.",
  ].join(" ");

  return (
    <div className="ats">
      <PageHead eyebrow="Company" title={title} sub={sub} />

      {err && <div className="admin-alert admin-alert--err u-mb-4">{err.message}</div>}

      <div className="ats-two co-offices">
        <OfficeSection
          office="revenue"
          label="Revenue"
          snapshot={goals.byOffice.revenue}
          quarterLabel={q}
          facts={[
            { label: "Collected, 30 days", value: formatCents(vitals.cash30), note: `Edge8 ${compactUsd(vitals.cash30Edge8)}, AIO ${compactUsd(vitals.cash30Aio)}`, href: "/admin/revenue" },
            { label: "Open pipeline", value: formatCents(vitals.openPipeline), note: `${plural(vitals.openDeals, "open deal")}, ${vitals.dealsAdded30} added in 30 days`, href: "/admin/revenue/deals" },
            { label: `Collected in ${year}`, value: formatCents(cashYtd), href: "/admin/revenue" },
            { label: "New leads, 30 days", value: newLeads30, note: vsPrior(newLeads30, newLeadsPrev30), href: "/admin/revenue/leads" },
            { label: "Lead to won, 90 days", value: `${conversion90}%`, href: "/admin/revenue" },
          ]}
        />
        <OfficeSection
          office="talent"
          label="Talent"
          snapshot={goals.byOffice.talent}
          quarterLabel={q}
          facts={[
            { label: "Headcount", value: vitals.headcount, note: "full-time employees", href: "/admin/talent/team" },
            { label: "Open roles", value: openRoles, href: "/admin/talent/jobs" },
            { label: "Applications, 30 days", value: apps30, note: vsPrior(apps30, appsPrev30), href: "/admin/talent/jobs" },
            { label: `New hires in ${year}`, value: newHires, href: "/admin/talent" },
          ]}
        />
        <OfficeSection
          office="operations"
          label="Operations"
          snapshot={goals.byOffice.operations}
          quarterLabel={q}
          facts={[
            { label: "Days off, 30 days", value: daysOff30, note: "approved leave", href: "/admin/operations/time-off/requests" },
            { label: "Open requests", value: openRequests, note: "contractor and client", href: "/admin/operations/contractor-requests" },
            { label: "Assistant chats, 30 days", value: botCount, href: "/admin/operations" },
          ]}
        />
        <OfficeSection
          office="innovation"
          label="Innovation"
          snapshot={goals.byOffice.innovation}
          quarterLabel={q}
          facts={[
            { label: "Open build ideas", value: buildIdeas, href: "/admin/innovation" },
            { label: "Learnings, 30 days", value: learnings30, href: "/admin/innovation" },
            { label: "Agent-run key results", value: mixTotal ? `${agentShare}%` : "No key results yet", href: "/admin/innovation" },
          ]}
        />
      </div>

      {flow && (
        <section className="admin-card admin-section-card" aria-label="Work">
          <AtsSectionHead
            k="Work"
            title={`${plural(flow.open, "open card")} across ${plural(workingBoards, "board")}.`}
            aside={
              <Link href="/admin/edges/workboard/flow" className="admin-auth-link">
                Flow →
              </Link>
            }
          />
          <p className="co-work-sentence">
            {completed12.toLocaleString()} finished and {created12.toLocaleString()} started in the last 12 weeks. {flow.overdue.toLocaleString()} late, {flow.blocked.toLocaleString()} blocked.
          </p>
          {clients.length > 0 && (
            <>
              <h3 className="co-work-h">
                Across {plural(clients.length, "active AI Program client")}: {plural(sum("cards"), "card")} and {ht(sum("tokens"))} Human Tokens finished in the
                last 4 weeks, against {sum("priorCards").toLocaleString()} and {ht(sum("priorTokens"))} in the 4 before.
              </h3>
              <div className="admin-table-wrap u-mb-4">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th className="u-right">Cards finished</th>
                      <th className="u-right">Human Tokens</th>
                      <th className="u-right">4 weeks before</th>
                      <th className="u-right">Open</th>
                      <th className="u-right">Late</th>
                      <th className="u-right">Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id}>
                        <td className="admin-cell-strong">
                          {mayOpenCompany ? <Link href={`/admin/revenue/companies/${c.id}?from=client-hubs`}>{c.name}</Link> : c.name}
                        </td>
                        <td className="u-right admin-cell-mono">{c.cards.toLocaleString()}</td>
                        <td className="u-right admin-cell-mono">{ht(c.tokens)}</td>
                        <td className="u-right admin-cell-mono admin-cell-muted">
                          {c.priorCards.toLocaleString()} cards, {ht(c.priorTokens)} HT
                        </td>
                        <td className="u-right admin-cell-mono">{c.open.toLocaleString()}</td>
                        <td className="u-right admin-cell-mono">{c.late > 0 ? <Badge tone="warn">{c.late}</Badge> : 0}</td>
                        <td className="u-right admin-cell-mono">{c.blocked > 0 ? <Badge tone="err">{c.blocked}</Badge> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="dash-grid">
            <ChartCard title="Cards started and finished, by week" span={12} meta="last 12 weeks">
              <Columns
                labels={flow.weekly.map((w) => w.label)}
                series={[
                  { name: "started", values: flow.weekly.map((w) => w.created) },
                  { name: "finished", values: flow.weekly.map((w) => w.completed), tone: "ok" },
                ]}
              />
            </ChartCard>
          </div>
        </section>
      )}
    </div>
  );
}
