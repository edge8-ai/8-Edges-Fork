import { requirePermission } from "@/kernel/identity/access-request";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { surfaceBase } from "@/kernel/shell/surface";
import { saigonToday } from "@/kernel/config/dates";
import { loadAccountsNeedingAttention, type AttentionRow } from "@/entities/crm/lib/accounts-attention";
import { describeSignals } from "@/entities/crm/lib/account-health-score";
import { RENEWAL_SOON_DAYS, RENEWAL_STATUS_LABEL, renewalDistance } from "@/entities/crm/lib/renewal-vocab";

export const metadata = {
  title: "Accounts needing attention",
  description: "Client accounts by health, lowest first, with their renewal dates.",
};

// Revenue after the sale (S.6): every current client with last night's health
// reading and its renewal, lowest score first. Company-level only — each row is
// an account, and nothing on this screen is sliced by who owns it, because a
// metric describes the client outcome and never a person.

// Bands for the score badge. The number is always printed beside the colour,
// so the band is never the only thing that carries the meaning.
function scoreTone(score: number): BadgeTone {
  if (score < 50) return "err";
  if (score < 75) return "warn";
  return "ok";
}

function SignalsCell({ row }: { row: AttentionRow }) {
  if (!row.signals) return <span className="admin-cell-muted">{row.score === null ? "No reading yet" : "Signals unreadable"}</span>;
  const words = describeSignals(row.signals);
  return (
    <div className="u-stack u-sm">
      <span>{words.meeting}</span>
      <span>{words.invoices}</span>
      <span>{words.roadmap}</span>
      <span>{words.portal}</span>
    </div>
  );
}

export default async function AccountsNeedingAttentionPage(props: { searchParams: Promise<SearchParamsObj> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const today = saigonToday();
  const { rows: all, takenOn } = await loadAccountsNeedingAttention(today);
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const rows = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
  const soonCount = all.filter((r) => r.renewalSoon).length;

  const columns: Column<AttentionRow>[] = [
    {
      key: "name",
      header: "Account",
      cell: (r) => (
        <Link href={`/admin/revenue/companies/${r.id}`} className="admin-cell-strong">
          {r.name}
        </Link>
      ),
    },
    {
      key: "score",
      header: "Health",
      cell: (r) => (r.score === null ? <span className="admin-cell-muted">—</span> : <Badge tone={scoreTone(r.score)}>{r.score} / 100</Badge>),
    },
    { key: "signals", header: "Signals", cell: (r) => <SignalsCell row={r} /> },
    {
      key: "renewal",
      header: "Renewal",
      cell: (r) =>
        r.renewal ? (
          <div className="u-stack u-sm">
            <span>
              {formatDate(r.renewal.renews_on)} <span className="admin-cell-muted">({renewalDistance(r.renewal.renews_on, today)})</span>
            </span>
            {r.renewalSoon ? (
              <span>
                <Badge tone="warn">Renews within {RENEWAL_SOON_DAYS} days</Badge>
              </span>
            ) : (
              <span className="admin-cell-muted">{RENEWAL_STATUS_LABEL[r.renewal.status]}</span>
            )}
          </div>
        ) : (
          <span className="admin-cell-muted">Not set</span>
        ),
    },
  ];

  const sub = [
    `${all.length.toLocaleString()} ${all.length === 1 ? "account" : "accounts"}`,
    takenOn ? `health read ${formatDate(takenOn)}` : "no health reading yet — the routine runs nightly",
    soonCount > 0 ? `${soonCount} renewing within ${RENEWAL_SOON_DAYS} days` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHead eyebrow="Revenue" title="Accounts needing attention" sub={sub} />
      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        basePath={`${surface}/revenue/accounts`}
        searchParams={searchParams}
        searchPlaceholder="Search accounts…"
        emptyText={q ? "No accounts match." : "No current clients. An account is a company with client dates that cover today."}
      />
      <p className="admin-cell-muted u-sm u-mt-4">
        Health starts at 100: a last meeting over 30 days ago costs 20 (over 60, or never, 35); each overdue invoice 15, up to
        45; no roadmap moves in 30 days 15; no portal sign-in for 30 days 15. A signal that does not apply costs nothing.
      </p>
    </>
  );
}
