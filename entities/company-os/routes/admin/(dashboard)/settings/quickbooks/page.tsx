import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { getQboConnectionStatus, qboConfigured, type QboEntity } from "@/entities/company-os/lib/qbo";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { LEGAL_ENTITY_NAME } from "@/kernel/config/organisation";

const CONNECTIONS: { entity: QboEntity; label: string; sub: string }[] = [
  { entity: "edge8", label: LEGAL_ENTITY_NAME ? `Edge8 (${LEGAL_ENTITY_NAME})` : "Edge8", sub: "Private retreats + client work-request billing." },
  { entity: "aio", label: "AIO", sub: "Public retreats." },
];

export const metadata = {
  title: "QuickBooks",
  description: "QuickBooks Online connection for automatic client invoicing.",
};

const STATUS_MESSAGE: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "QuickBooks connected." },
  error: { tone: "err", text: "Connecting failed — check the server logs and try again." },
  state_mismatch: { tone: "err", text: "The sign-in flow expired — try Connect again." },
  missing_code: { tone: "err", text: "Intuit returned no authorization code — try Connect again." },
  unconfigured: { tone: "err", text: "QBO env vars are missing (see setup notes below)." },
};

// Settings → QuickBooks. One connection: when a client
// accepts finished contractor work in the portal, the app creates the QBO
// invoice at the contractor's billable rate and QBO emails it to the client.
// Disconnected ≠ broken: billing degrades to a manual_required flag + an
// accountant email until reconnected.
export default async function QuickBooksSettingsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.settings");
  const searchParams = await props.searchParams;
  const statuses = await Promise.all(CONNECTIONS.map((c) => getQboConnectionStatus(c.entity)));
  const flash = STATUS_MESSAGE[firstParam(searchParams.status) ?? ""] ?? null;

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="QuickBooks"
        sub="One connection per company: Edge8 for client billing and private retreats, AIO for public retreats."
      />

      {flash && (
        <div className={`admin-alert admin-alert--lead ${flash.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>
          {flash.text}
        </div>
      )}

      {CONNECTIONS.map((conn, i) => {
        const status = statuses[i];
        return (
          <div key={conn.entity} className="admin-card admin-section-card">
            <h2 className="admin-card-title admin-card-title--tight">
              {conn.label} {status.connected ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Not connected</Badge>}
            </h2>
            <p className="admin-page-sub admin-page-sub--card">{conn.sub}</p>
            {status.connected ? (
              <dl className="admin-kv">
                <dt>Realm</dt>
                <dd className="admin-cell-mono">{status.realmId}</dd>
                <dt>Environment</dt>
                <dd>{status.environment}</dd>
                <dt>Connected by</dt>
                <dd>{status.connectedBy}</dd>
                <dt>Last token refresh</dt>
                <dd>{formatDate(status.updatedAt)}</dd>
                <dt>Refresh token expires</dt>
                <dd>{formatDate(status.refreshTokenExpiresAt)} (auto-renewed weekly)</dd>
              </dl>
            ) : (
              <p className="admin-page-sub admin-page-sub--flush">
                Not connected. Click Connect and pick the {conn.label} company in Intuit&rsquo;s picker.
              </p>
            )}
            <div className="admin-card-actions">
              <a href={`/api/qbo/connect?entity=${conn.entity}`} className="admin-btn admin-btn--primary">
                {status.connected ? "Reconnect" : "Connect QuickBooks"}
              </a>
            </div>
          </div>
        );
      })}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title admin-card-title--compact">Setup notes</h2>
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
            <span className="admin-cell-mono"> QBO_SERVICE_ITEM_ID</span> — invoices line against it.
          </li>
          <li>
            Set <span className="admin-cell-mono">ACCOUNTING_EMAIL</span> — every automatic invoice (and every
            failure) is reported there.
          </li>
          <li>
            Map each client company to its QuickBooks customer (Revenue → Companies → QuickBooks mapping);
            unmapped companies degrade to manual invoicing.
          </li>
        </ul>
      </div>
    </>
  );
}
