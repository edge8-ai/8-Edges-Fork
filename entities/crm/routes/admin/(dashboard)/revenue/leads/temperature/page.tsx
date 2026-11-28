import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { loadLeadTemperatures, type Temperature, type TemperatureRow } from "@/entities/crm/lib/lead-temperature";

export const metadata = {
  title: "Lead temperature",
  description: "Every prospect on one of three lists: warm, gone cold, everyone else.",
};

// The three lists behind the weekly personal emails (docs/plans/
// 2026-10-26-weekly-personal-emails.md, PR 2). The temperature is computed on
// the way out from deals, the lead satellite, human touches and client
// status; nothing here is stored, so the page is the one place to check the
// rules against real people before anything sends.

const BASE = "/admin/revenue/leads/temperature";
const PAGE_SIZE = 50;

const LABEL: Record<Temperature, string> = { warm: "Warm", cold: "Gone cold", other: "Everyone else" };
const TONE: Record<Temperature, "ok" | "warn" | "neutral"> = { warm: "ok", cold: "warn", other: "neutral" };

const TEMPERATURE_OPTIONS = (Object.keys(LABEL) as Temperature[]).map((value) => ({ value, label: LABEL[value] }));

function isTemperature(value: string | undefined): value is Temperature {
  return value === "warm" || value === "cold" || value === "other";
}

export default async function LeadTemperaturePage(props: { searchParams: Promise<SearchParamsObj> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const temperatureParam = firstParam(searchParams.temperature);
  const temperature = isTemperature(temperatureParam) ? temperatureParam : null;

  const { rows: all, counts, excluded } = await loadLeadTemperatures();

  const filtered = all.filter(
    (r) =>
      (!temperature || r.temperature === temperature) &&
      (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.company ?? "").toLowerCase().includes(q)),
  );
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<TemperatureRow>[] = [
    {
      key: "name",
      header: "Person",
      cell: (r) => (
        <>
          <Link href={`/admin/contacts/${r.id}`} className="admin-cell-strong">
            {r.name}
          </Link>
          <div className="admin-cell-muted u-sm">{r.email}</div>
        </>
      ),
    },
    { key: "company", header: "Company", cell: (r) => r.company ?? <span className="admin-cell-muted">—</span> },
    { key: "temperature", header: "Temperature", cell: (r) => <Badge tone={TONE[r.temperature]}>{LABEL[r.temperature]}</Badge> },
    { key: "reason", header: "Why", cell: (r) => <span className="admin-cell-muted">{r.reason}</span> },
    {
      key: "lastTouch",
      header: "Last human touch",
      cell: (r) => (r.lastTouch ? `${r.lastTouch.kind} · ${formatDate(r.lastTouch.at)}` : <span className="admin-cell-muted">none</span>),
    },
  ];

  const excludedNote = Object.entries(excluded)
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${n} ${why}`)
    .join(" · ");

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/leads">← Leads</Link> · Temperature
          </>
        }
        title="Lead temperature"
        sub="Computed from deals, the lead queue, human touches and client status; broadcasts and system emails never count as a touch. Nothing here is stored."
      />
      <div className="admin-kpi-grid u-mb-4">
        {(Object.keys(LABEL) as Temperature[]).map((t) => (
          <MetricCard key={t} label={LABEL[t]} value={counts[t]} href={`${BASE}?temperature=${t}`} sub={temperature === t ? "showing" : undefined} />
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={filtered.length}
        page={page}
        pageSize={PAGE_SIZE}
        basePath={BASE}
        searchParams={searchParams}
        searchPlaceholder="Search name, email or company…"
        emptyText="Nobody matches."
        filterBar={<FilterBar basePath={BASE} searchParams={searchParams} filters={[{ key: "temperature", label: "Temperature", options: TEMPERATURE_OPTIONS }]} />}
      />
      {excludedNote && <p className="admin-cell-muted u-mt-3">On no list: {excludedNote}.</p>}
    </>
  );
}
