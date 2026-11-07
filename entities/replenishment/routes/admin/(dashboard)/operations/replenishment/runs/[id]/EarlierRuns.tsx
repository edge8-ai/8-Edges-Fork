import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { runDay, statusWords, workedByWords, type RunSummary } from "@/entities/replenishment";

// Earlier runs (RP.7; the approved Run board): the runs of the same profile
// before this one, with how many of their jobs were done and by whom, so a
// manager sees whether rounds are being finished. Each opens its own page,
// where the BINs used are listed job by job.

const BASE = "/admin/operations/replenishment/runs";

export function EarlierRuns({ runs, people }: { runs: RunSummary[]; people: ReadonlyMap<string, { name: string }> }) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Earlier runs</h2>
        <Link href={BASE} className="admin-cell-muted">
          Every run
        </Link>
      </div>
      {runs.length === 0 ? (
        <div className="admin-empty">This is the first run of this profile.</div>
      ) : (
        <div className="admin-table-wrap admin-table-wrap--flat">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Export</th>
                  <th>Status</th>
                  <th className="u-right">Jobs</th>
                  <th className="u-right">Done</th>
                  <th>Worked by</th>
                  <th>BINs used</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const status = statusWords(run.status);
                  return (
                    <tr key={run.id}>
                      <td className="admin-cell-strong">{runDay(run.uploadedAt)}</td>
                      <td>
                        <Badge tone={status.tone}>{status.text}</Badge>
                      </td>
                      <td className="u-right u-tabular">{run.jobs}</td>
                      <td className="u-right u-tabular">{run.done}</td>
                      <td>{workedByWords(run.workedBy, people)}</td>
                      <td>
                        <Link href={`${BASE}/${run.id}?jobs=done`}>View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
