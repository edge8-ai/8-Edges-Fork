import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { listEightEdgesInstalls, summarizeInstalls } from "@/entities/crm/lib/installs";
import { INSTALL_SOURCE_LABEL, INSTALL_STATUS_LABEL, type InstallStatus } from "@/entities/crm/lib/installs-shapes";
import { InstallRowControls, RecordInstallForm } from "./InstallsControls";

export const metadata = {
  title: "Installs",
  description: "Every Eight Edges open source download and install, by company.",
};

// The company key result "88 installations by Dec 31" counts the Installed
// rows here, read nightly by the Key result sync. Downloads are recorded the
// day they happen so a download can be followed to an install.
const KR_TARGET = 88;

const TONE: Record<InstallStatus, "ok" | "info" | "neutral"> = {
  installed: "ok",
  downloaded: "info",
  abandoned: "neutral",
};

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function InstallsPage() {
  const access = await requirePermission("crm.pipeline");
  const rows = await listEightEdgesInstalls();
  const today = saigonToday();
  const year = Number(today.slice(0, 4));
  const summary = summarizeInstalls(rows, year);
  const may = mayProp(access, ["crm.pipeline"]);

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Installs"
        sub="Eight Edges open source. An install runs on the company's own accounts for its own business; workshop practice sites are not recorded."
      />

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Installs counted" value={summary.installed} sub={`of ${KR_TARGET} by 31 Dec; the key result syncs nightly`} />
        <MetricCard label={`Downloads in ${year}`} value={summary.downloadsThisYear} sub="every record, any status" />
        <MetricCard label="Waiting to install" value={summary.waiting} sub="downloaded, not yet running" />
      </div>

      <RecordInstallForm may={may} today={today} />

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Downloaded</th>
              <th>Source</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-cell-muted u-p-5 u-center-text">
                  No downloads or installs recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="admin-cell-strong">{r.company?.name ?? "Unknown company"}</span>
                    {r.evidenceUrl && (
                      <div className="admin-cell-muted">
                        <ExternalLink href={r.evidenceUrl}>{r.evidenceUrl.replace(/^https?:\/\//i, "")}</ExternalLink>
                      </div>
                    )}
                    {r.notes && <div className="admin-cell-muted">{r.notes}</div>}
                  </td>
                  <td>
                    {r.person?.name ?? "Unknown"}
                    {r.person?.email && r.person.email !== r.person.name && <div className="admin-cell-muted">{r.person.email}</div>}
                  </td>
                  <td>{shortDate(r.downloadedOn)}</td>
                  <td>{INSTALL_SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td>
                    <Badge tone={TONE[r.status]}>{INSTALL_STATUS_LABEL[r.status]}</Badge>
                    {r.installedOn && <div className="admin-cell-muted">{shortDate(r.installedOn)}</div>}
                  </td>
                  <td>
                    <InstallRowControls
                      may={may}
                      id={r.id}
                      label={r.company?.name ?? "this record"}
                      status={r.status}
                      downloadedOn={r.downloadedOn}
                      installedOn={r.installedOn}
                      evidenceUrl={r.evidenceUrl}
                      today={today}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
