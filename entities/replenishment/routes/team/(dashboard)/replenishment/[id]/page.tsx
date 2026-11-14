import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { initials } from "@/kernel/ui/format";
import { isUuid } from "@/kernel/config/slug";
import { jobsOfRun, listProfiles, operatorWords, readRun, runDate, shortDay } from "@/entities/replenishment";
import { completeJob, notYou, reopenJob } from "@/entities/replenishment/lib/job-actions";
import { OperatorCard } from "@/entities/replenishment/ui/OperatorCard";

export const metadata = {
  title: "Replenishment run",
  description: "Work a sent replenishment run on a scanner, one job at a time.",
};

// One sent run on a scanner (RP.5; the approved Operator board). The screen
// covers the Team hub's chrome (app/styles/replenishment-scanner.css), built
// for a handheld held in one hand: one job at a time, a scan finishes it.
// Everything is read from the stored rows and the run's own profile snapshot,
// so a profile edit never changes a run being worked. A draft has not been
// checked and a closed run is over, so neither opens here.

const BASE = "/team/replenishment";

export default async function ReplenishmentScannerPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("replenishment.work");
  const [actor, { id }] = await Promise.all([requireTeamMember(), props.params]);
  if (!isUuid(id)) notFound();
  const run = await readRun(id);
  if (!run) notFound();

  if (run.status !== "sent") {
    return (
      <>
        <PageHead eyebrow={<Link href={BASE}>Replenishment</Link>} title="This run is not on the scanners" />
        <section className="admin-card admin-section-card">
          <p>
            {run.status === "draft"
              ? "The warehouse manager has not sent it yet. It opens here once it has been checked and sent."
              : "It was closed, so its jobs can no longer change. The warehouse manager keeps it as the record of that week."}
          </p>
          <p className="u-mt-4">
            <Link href={BASE}>See the runs on the scanners</Link>
          </p>
        </section>
      </>
    );
  }

  const [jobs, profiles] = await Promise.all([jobsOfRun(run.id), listProfiles()]);
  const profileName = profiles.find((p) => p.id === run.profileId)?.name;
  const day = runDate(run.sentAt ?? run.uploadedAt);

  return (
    <OperatorCard
      run={{ title: profileName ? `Run ${day} · ${profileName}` : `Run ${day}`, truncated: run.truncated, dataRows: run.dataRows }}
      person={{ name: actor.displayName, initials: initials(actor.displayName), day: shortDay(new Date().toISOString()) }}
      words={operatorWords(run.snapshot)}
      // The scanner needs only whether a job is done, never who did it, so the
      // finisher's person id stays on the server instead of reaching the browser.
      jobs={jobs.map((job) => ({ ...job, doneBy: null }))}
      actions={{ completeJob, reopenJob, notYou }}
    />
  );
}
