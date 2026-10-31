import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { listProfiles, listRuns, runDay, runTime } from "@/entities/replenishment";

export const metadata = {
  title: "Replenishment",
  description: "The replenishment runs sent to the scanners.",
};

// /team/replenishment (RP.5; spec "On the scanner", story 47): the runs sent
// to the scanners, newest first. With only one sent, the scanner opens it
// straight away, so an operator starts without looking for it.

const BASE = "/team/replenishment";

export default async function ReplenishmentRunsForScannersPage() {
  await requirePermission("replenishment.work");
  const [runs, profiles] = await Promise.all([listRuns("sent"), listProfiles()]);
  if (runs.length === 1) redirect(`${BASE}/${runs[0].id}`);
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  const newestFirst = [...runs].sort((a, b) => (b.sentAt ?? b.uploadedAt).localeCompare(a.sentAt ?? a.uploadedAt));

  return (
    <>
      <PageHead title="Replenishment" sub="The runs sent to the scanners, newest first. Open one to work its jobs." />
      <section className="admin-card admin-section-card">
        {newestFirst.length === 0 ? (
          <div className="admin-empty">No run has been sent to the scanners. The warehouse manager sends each week&apos;s run when it has been checked.</div>
        ) : (
          <ul className="u-list-plain admin-list">
            {newestFirst.map((run) => (
              <li key={run.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    <Link href={`${BASE}/${run.id}`}>{runDay(run.sentAt ?? run.uploadedAt)}</Link>
                  </div>
                  <div className="admin-list-sub">
                    {names.get(run.profileId) ?? "An archived profile"} · sent {runTime(run.sentAt ?? run.uploadedAt)}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <span className="u-tabular">
                    {run.done} of {run.jobs} done
                  </span>
                  {run.truncated && <Badge tone="warn">Export may be cut off</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
