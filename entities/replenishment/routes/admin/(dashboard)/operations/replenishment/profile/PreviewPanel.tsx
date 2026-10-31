// The Profile board's preview (RP.6; stories 22-24): what the draft makes of
// the last stored export, recounted as the manager edits. It shows the job
// count and how it differs from the saved profile, the jobs of each band, the
// items left out with their reasons, and the first jobs in walking order.
import Link from "next/link";
import { jobsChange, type Preview, type Profile } from "@/entities/replenishment/client";
import type { LastExport } from "@/entities/replenishment/lib/preview-actions";

/** Where the preview's export stands: being read, absent (no run yet), unreadable, or read. */
export type ExportState = { status: "loading" } | { status: "none" } | { status: "failed"; error: string } | { status: "ready"; lastExport: LastExport };

type Outcome = { ok: true; preview: Preview } | { ok: false; error: string };

type Props = {
  source: ExportState;
  /** The last valid draft's preview, null until the export is read. */
  draft: Outcome | null;
  saved: Outcome | null;
  /** The draft fails its checks, so the preview is of the last version that passed. */
  stale: boolean;
  profile: Profile;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function PreviewPanel({ source, draft, saved, stale, profile }: Props) {
  const { words } = profile;
  return (
    <section className="admin-card admin-section-card" aria-live="polite">
      <div className="admin-eyebrow">Preview</div>
      {source.status === "loading" && <p className="admin-cell-muted">Reading the last export…</p>}
      {source.status === "none" && (
        <p className="admin-cell-muted">
          No run yet, so there is no export to preview against. Upload this week&apos;s export on{" "}
          <Link href="/admin/operations/replenishment/runs">Replenishment runs</Link> and the preview will recount against it.
        </p>
      )}
      {source.status === "failed" && <div className="admin-alert admin-alert--err" role="alert">{source.error}</div>}
      {source.status === "ready" && (
        <>
          <h2 className="admin-card-title admin-card-title--compact">Against the export of {source.lastExport.uploadedOn}</h2>
          <p className="admin-hint u-m-0">{source.lastExport.fileName}</p>
          {stale && <div className="admin-alert admin-alert--warn u-mt-1">The draft has a problem, so this shows the last version of it that passed its checks.</div>}
          {draft && !draft.ok && <div className="admin-alert admin-alert--err u-mt-1">This draft cannot read the export: {draft.error}</div>}
          {draft?.ok && <Figures preview={draft.preview} saved={saved?.ok ? saved.preview : null} profile={profile} />}
          {draft?.ok && draft.preview.truncated && (
            <p className="admin-hint u-warn">Only {plural(draft.preview.dataRows, "row", "rows")}: the operator would be warned the export may be cut off.</p>
          )}
          {draft?.ok && draft.preview.firstJobs.length > 0 && (
            <>
              <h3 className="admin-label u-mt-4">First jobs, in walking order</h3>
              <ol className="u-list-plain rp-profile-jobs">
                {draft.preview.firstJobs.map((job) => (
                  <li key={job.item}>
                    <div className="u-between">
                      <strong className="u-break-all">{job.item}</strong>
                      <span className="u-accent u-strong u-nowrap">Move {job.move}</span>
                    </div>
                    <div className="admin-hint">
                      {job.band} · {words.pick} {job.pick} · {words.reserve} {job.reserve} · from {job.collect[0]?.location ?? "–"}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Figures({ preview, saved, profile }: { preview: Preview; saved: Preview | null; profile: Profile }) {
  const bands = profile.rules.flatMap((rule, r) =>
    rule.enabled ? rule.bands.map((band, b) => ({ key: `${rule.id}.${b}`, label: `${rule.label} ${band.label}`, jobs: preview.bandJobs[r]?.[b] ?? 0 })) : [],
  );
  return (
    <>
      <p className="admin-hint u-mt-1 u-m-0">{plural(preview.dataRows, "row", "rows")} read</p>
      <div className="u-row u-items-baseline u-mt-1">
        <span className="admin-kpi-val u-tabular">{preview.jobs.toLocaleString("en-US")}</span>
        <span className="admin-cell-muted">{preview.jobs === 1 ? "job" : "jobs"} for the operator</span>
      </div>
      {saved && <p className={preview.jobs === saved.jobs ? "admin-hint u-m-0" : "u-accent u-m-0"}>{jobsChange(preview.jobs, saved.jobs)}</p>}

      <h3 className="admin-label u-mt-4">Jobs by band</h3>
      <ul className="u-list-plain rp-profile-counts">
        {bands.map((band) => (
          <li key={band.key}>
            <span>{band.label}</span>
            <span className="u-strong u-tabular">{band.jobs}</span>
          </li>
        ))}
      </ul>

      <h3 className="admin-label u-mt-4">Left out, with the reason ({preview.leftOut.toLocaleString("en-US")})</h3>
      {preview.reasons.length === 0 ? (
        <p className="admin-hint u-m-0">Every item held in {profile.words.reserve} was read.</p>
      ) : (
        <ul className="u-list-plain rp-profile-counts">
          {preview.reasons.map((reason) => (
            <li key={reason.reason}>
              <span>{reason.reason}</span>
              <span className="u-strong u-tabular">{reason.count}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
