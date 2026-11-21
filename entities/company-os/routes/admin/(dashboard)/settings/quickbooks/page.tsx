import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { qboConfigured, type QboEntity } from "@/entities/finance";
import { formatDate, timeAgo } from "@/kernel/ui/format";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { nextWeeklySync, qboSyncOverview, type CompanySync, type RunMark } from "@/entities/company-os/lib/qbo-sync-overview";

const CONNECTIONS: { entity: QboEntity; label: string; sub: string }[] = [
  { entity: "edge8", label: "Edge8", sub: "Client billing and private retreats" },
  { entity: "aio", label: "AIO", sub: "Public retreats" },
];
const LABEL: Record<QboEntity, string> = { edge8: "Edge8", aio: "AIO" };

export const metadata = {
  title: "QuickBooks",
  description: "QuickBooks Online connection for automatic client invoicing.",
};

const STATUS_MESSAGE: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "QuickBooks connected. Check the company name below is the right one." },
  error: { tone: "err", text: "Connecting failed. Check the server logs and try again." },
  state_mismatch: { tone: "err", text: "The QuickBooks sign-in timed out or came back to a different address. Reconnect and finish within ten minutes." },
  missing_code: { tone: "err", text: "QuickBooks returned no authorization code. Reconnect to try again." },
  unconfigured: { tone: "err", text: "QBO env vars are missing (see setup notes below)." },
};

// Settings → QuickBooks. Each card leads with whether that company's invoices
// are syncing, which is the question this page is opened to answer, and names
// the QuickBooks company it is linked to rather than a realm number. A green
// "Connected" badge from the token row alone stayed green for five weeks while
// AIO was linked to Edge8's books and not syncing (2026-10-07 to 2026-11-13).
// Disconnected ≠ broken: billing degrades to a manual_required flag + an
// accountant email until reconnected.
const nextDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: BUSINESS_TIME_ZONE });
const nextTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });
export default async function QuickBooksSettingsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.settings");
  const searchParams = await props.searchParams;
  // A server render reads the clock once; new Date() keeps react-hooks/purity quiet.
  const now = new Date().getTime();
  const companies = await qboSyncOverview(CONNECTIONS.map((c) => c.entity), now);
  const flash = STATUS_MESSAGE[firstParam(searchParams.status) ?? ""] ?? null;
  const flashFor = firstParam(searchParams.entity) === "aio" ? "aio" : "edge8";
  const nextRun = nextWeeklySync(new Date(now));
  const next = { day: nextDay.format(nextRun), time: `${nextTime.format(nextRun)} GMT+7` };

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="QuickBooks"
        sub="Invoices sync from each company's QuickBooks every Monday. Edge8 covers client billing and private retreats, AIO covers public retreats."
      />

      {CONNECTIONS.map((conn, i) => (
        <CompanyCard
          key={conn.entity}
          conn={conn}
          sync={companies[i]}
          next={next}
          now={now}
          flash={flash && flashFor === conn.entity ? flash : null}
        />
      ))}

      <details className="admin-card admin-section-card admin-qbo-details">
        <summary>Connection details and setup</summary>
        {companies.map((c) => (
          <div key={c.entity} className="admin-qbo-details-block">
            <h3 className="admin-qbo-details-title">{LABEL[c.entity]}</h3>
            {c.connection.connected ? (
              <dl className="admin-kv">
                <dt>Realm</dt>
                <dd className="admin-cell-mono">{c.connection.realmId}</dd>
                <dt>Environment</dt>
                <dd>{c.connection.environment}</dd>
                <dt>Connected by</dt>
                <dd>{c.connection.connectedBy}</dd>
                <dt>Last token refresh</dt>
                <dd>{formatDate(c.connection.updatedAt)}</dd>
                <dt>Refresh token expires</dt>
                <dd>{formatDate(c.connection.refreshTokenExpiresAt)} (renewed weekly)</dd>
              </dl>
            ) : (
              <p className="admin-page-sub admin-page-sub--flush">Not connected.</p>
            )}
          </div>
        ))}
        <h3 className="admin-qbo-details-title">Setup</h3>
        <ul className="admin-notes-list">
          <li>
            Create an app at developer.intuit.com (Accounting scope) for your legal entity and set
            <span className="admin-cell-mono"> QBO_CLIENT_ID</span>,
            <span className="admin-cell-mono"> QBO_CLIENT_SECRET</span>,
            <span className="admin-cell-mono"> QBO_REDIRECT_URI</span> (= this site&apos;s /api/qbo/callback) and
            <span className="admin-cell-mono"> QBO_ENV</span> (sandbox first, then production).
            {qboConfigured() ? " Env vars are set." : " Env vars are currently missing."}
          </li>
          <li>
            Create a service item named &ldquo;Contractor Services&rdquo; in QuickBooks and set its id as
            <span className="admin-cell-mono"> QBO_SERVICE_ITEM_ID</span>. Invoices line against it.
          </li>
          <li>
            Set <span className="admin-cell-mono">ACCOUNTING_EMAIL</span>. Every automatic invoice (and every
            failure) is reported there.
          </li>
          <li>
            Map each client company to its QuickBooks customer (Revenue → Companies → QuickBooks mapping);
            unmapped companies degrade to manual invoicing.
          </li>
        </ul>
      </details>
    </>
  );
}

// The badge beside each card's headline, by tone.
const BADGE: Record<CompanySync["health"]["tone"], { tone: BadgeTone; text: string }> = {
  ok: { tone: "ok", text: "Syncing" },
  warn: { tone: "warn", text: "Check" },
  err: { tone: "err", text: "Not syncing" },
};

function CompanyCard({ conn, sync, next, now, flash }: {
  conn: { entity: QboEntity; label: string; sub: string };
  sync: CompanySync;
  next: { day: string; time: string };
  now: number;
  flash: { tone: "ok" | "err"; text: string } | null;
}) {
  const { health, mirror } = sync;
  const wrongBooks = Boolean(sync.sharedWith);
  const badge = BADGE[health.tone];
  return (
    <section className="admin-card admin-section-card admin-qbo-card" data-tone={health.tone}>
      <div className="admin-qbo-head">
        <div>
          <p className="admin-page-sub admin-page-sub--flush">{conn.label} · {conn.sub}</p>
          <h2 className="admin-card-title admin-card-title--tight">
            {health.headline} <Badge tone={badge.tone}>{badge.text}</Badge>
          </h2>
          <p className="admin-page-sub admin-page-sub--flush">{linkedLine(sync)}</p>
        </div>
        <div className="admin-qbo-actions">
          {sync.connected && !wrongBooks && (
            <a href="/admin/revenue/invoices" className="admin-btn admin-btn--sm">View invoices</a>
          )}
          <a
            href={`/api/qbo/connect?entity=${conn.entity}`}
            className={`admin-btn admin-btn--sm${health.tone === "ok" ? "" : " admin-btn--primary"}`}
          >
            {sync.connected ? `Reconnect ${conn.label}` : `Connect ${conn.label}`}
          </a>
        </div>
      </div>

      {flash && <div className={`admin-alert ${flash.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{flash.text}</div>}
      {wrongBooks && (
        <div className="admin-alert admin-alert--err">
          Sync is paused so {LABEL[sync.sharedWith ?? "edge8"]}&rsquo;s invoices aren&rsquo;t counted twice. Reconnect and pick{" "}
          {conn.label}&rsquo;s own company in the QuickBooks picker.
        </div>
      )}
      {!wrongBooks && health.tone === "err" && "error" in health && health.error && (
        <div className="admin-alert admin-alert--err">{health.error}</div>
      )}

      {sync.connected && (
        <dl className="admin-kv admin-qbo-facts">
          <dt>Last sync</dt>
          <dd>{mirror.lastSyncedAt ? `${formatDate(mirror.lastSyncedAt)} (${daysAgo(mirror.lastSyncedAt, now)})` : "Never"}</dd>
          <dt>Invoices</dt>
          <dd>
            {mirror.count}
            {mirror.newest && ` · newest #${mirror.newest.docNumber ?? "?"}, ${formatDate(mirror.newest.txnDate)}`}
          </dd>
          <dt>Next sync</dt>
          <dd>{wrongBooks ? "Paused until reconnected" : `${next.day}, ${next.time}`}</dd>
          {sync.runs.length > 0 && (
            <>
              <dt>Last {sync.runs.length} runs</dt>
              <dd className="admin-qbo-run-strip">
                {[...sync.runs].reverse().map((r) => (
                  <span key={r.startedAt} className={`admin-qbo-run admin-qbo-run--${r.outcome}`} title={runTitle(r)} />
                ))}
              </dd>
            </>
          )}
        </dl>
      )}
      {!sync.connected && (
        <p className="admin-page-sub admin-page-sub--flush">Connect, then pick the {conn.label} company in the QuickBooks picker.</p>
      )}
    </section>
  );
}

function daysAgo(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return days < 1 ? timeAgo(iso, now) : days === 1 ? "yesterday" : `${days} days ago`;
}

// "Linked to <company> in QuickBooks", or what we know when the name
// could not be read.
function linkedLine(sync: CompanySync): string {
  if (!sync.connected) return "No QuickBooks company linked";
  if (sync.sharedWith) {
    const name = sync.companyName ? sync.companyName : `${LABEL[sync.sharedWith]}'s company`;
    return `Linked to ${name}, the same books as ${LABEL[sync.sharedWith]}`;
  }
  return sync.companyName ? `Linked to ${sync.companyName} in QuickBooks` : "Linked company name could not be read from QuickBooks";
}

function runTitle(r: RunMark): string {
  const day = formatDate(r.startedAt);
  if (r.outcome === "ok") return `${day}: synced`;
  if (r.outcome === "off") return `${day}: not included`;
  return `${day}: failed${r.error ? ` (${r.error.slice(0, 120)})` : ""}`;
}
