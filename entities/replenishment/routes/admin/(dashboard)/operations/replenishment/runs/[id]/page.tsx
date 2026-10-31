import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { Badge } from "@/kernel/ui/Badge";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { isUuid } from "@/kernel/config/slug";
import {
  bandCounts,
  binWords,
  earlierRuns,
  finishedBy,
  jobProgress,
  jobsFilterOf,
  jobsOfRun,
  jobsShown,
  listProfiles,
  readRun,
  runChecks,
  runDay,
  runTime,
  statusWords,
  type StoredJob,
} from "@/entities/replenishment";
import { EarlierRuns } from "./EarlierRuns";
import { RunControls } from "./RunControls";

export const metadata = {
  title: "Replenishment run",
  description: "A run's checks, its jobs in walking order and the items left out.",
};

// One run (RP.4; the approved Run board): the checks the upload passed, how
// many jobs each band produced, every job in walking order (where to collect
// from, how much to move, which BINs to try) and every item left out with its
// reason. A draft is sent from here. Everything is read from the stored rows;
// nothing re-runs the engine.
//
// Tracking (RP.7): how far the round has got, and for every finished job the
// BIN the operator scanned, who it was and when, filterable to the open or the
// done jobs; the earlier runs of the same profile with their counts; closing
// the run and downloading its offline copy.

const PAGE_SIZE = 50;

const listed = (values: string[]) => (values.length === 0 ? "—" : values.join(", "));

export default async function ReplenishmentRunPage(props: { params: Promise<{ id: string }>; searchParams: Promise<SearchParamsObj> }) {
  const access = await requirePermission("replenishment.runs");
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  if (!isUuid(id)) notFound();
  const run = await readRun(id);
  if (!run) notFound();
  const [jobs, profiles, earlier] = await Promise.all([jobsOfRun(run.id), listProfiles(), earlierRuns(run)]);
  const people = await peopleOnRecord(
    [run.uploadedBy, run.sentBy, run.closedBy, ...jobs.map((j) => j.doneBy), ...earlier.flatMap((r) => r.workedBy)].filter((p): p is string => p !== null),
  );
  const name = (person: string | null) => (person ? people.get(person)?.name ?? null : null);
  const words = binWords(run.snapshot);
  const status = statusWords(run.status);
  const profileName = profiles.find((p) => p.id === run.profileId)?.name ?? "an archived profile";
  const base = `/admin/operations/replenishment/runs/${run.id}`;

  const progress = jobProgress(jobs);
  const filter = jobsFilterOf(firstParam(searchParams.jobs));
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const shown = jobsShown(jobs, filter).filter((j) => !q || j.item.toLowerCase().includes(q) || j.description.toLowerCase().includes(q));
  const page = Math.max(1, Number(firstParam(searchParams.page)) || 1);

  const columns: Column<StoredJob>[] = [
    { key: "position", header: "#", cell: (j) => <span className="admin-cell-muted u-tabular">{j.position}</span> },
    {
      key: "item",
      header: "Item",
      cell: (j) => (
        <div className="admin-cell-stack">
          <span className="admin-cell-strong">{j.item}</span>
          <span className="admin-cell-muted">{j.description}</span>
        </div>
      ),
    },
    { key: "band", header: "Band", cell: (j) => <span className="u-nowrap">{j.band}</span> },
    { key: "pick", header: words.pick, align: "right", cell: (j) => <span className="u-tabular">{j.pick}</span> },
    { key: "reserve", header: words.reserve, align: "right", cell: (j) => <span className="u-tabular">{j.reserve}</span> },
    { key: "move", header: "Move", align: "right", cell: (j) => <span className="admin-cell-strong u-accent u-nowrap">{j.move}</span> },
    { key: "collect", header: "Collect from", cell: (j) => <span className="admin-cell-muted">{listed(j.collect.map((c) => `${c.location} (${c.qty})`))}</span> },
    { key: "destinations", header: "Suggested BINs", cell: (j) => <span className="admin-cell-muted">{listed(j.destinations)}</span> },
    {
      key: "done",
      header: "Done",
      cell: (j) => {
        const done = finishedBy(j, people);
        if (!done) return <Badge tone="neutral">Open</Badge>;
        return (
          <div className="admin-cell-stack">
            <span className="admin-cell-strong u-nowrap">BIN {done.bin}</span>
            <span className="admin-cell-muted u-nowrap">
              {done.who} · {done.when}
            </span>
          </div>
        );
      },
    },
  ];

  const uploader = name(run.uploadedBy);
  const sender = name(run.sentBy);
  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/operations/replenishment/runs">Operations · Warehouse · Runs</Link>}
        title={runDay(run.uploadedAt)}
        sub={
          <>
            {run.fileName} · uploaded {runTime(run.uploadedAt)}
            {uploader ? ` by ${uploader}` : ""} · profile {profileName} v{run.profileVersion}
            {run.sentAt ? ` · sent ${runDay(run.sentAt)} ${runTime(run.sentAt)}${sender ? ` by ${sender}` : ""}` : ""}
          </>
        }
        action={<RunControls may={mayProp(access, ["replenishment.runs"])} runId={run.id} status={run.status} jobs={jobs.length} offlineHref={`${base}/offline`} />}
      />

      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Checks</h2>
          <Badge tone={status.tone}>{status.text}</Badge>
        </div>
        <ul className="u-list-plain admin-notes-list">
          {runChecks(run, words).map((check) => (
            <li key={check.text} className={check.ok ? undefined : "u-warn"}>
              <Badge tone={check.ok ? "ok" : "warn"} dot>
                {check.ok ? "OK" : "Check"}
              </Badge>{" "}
              {check.text}
            </li>
          ))}
        </ul>
        <div className="admin-kpi-grid u-mt-4">
          <div className="admin-kpi">
            <div className="admin-kpi-label">Jobs</div>
            <div className="admin-kpi-val">{jobs.length}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Done</div>
            <div className="admin-kpi-val">
              {progress.done} <span className="admin-cell-muted">of {progress.total}</span>
            </div>
            <div className="admin-progress u-mt-2" role="progressbar" aria-label="Jobs done" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
              <div className="admin-progress-fill" data-p={String(progress.step)} />
            </div>
          </div>
          {bandCounts(run.snapshot, jobs).map((band) => (
            <div key={band.label} className="admin-kpi">
              <div className="admin-kpi-label">{band.label}</div>
              <div className="admin-kpi-val">{band.jobs}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Jobs, in walking order</h2>
          <span className="admin-cell-muted">
            {progress.done} done · {progress.open} open
          </span>
        </div>
        {jobs.length === 0 ? (
          <div className="admin-empty">No replenishment required: no item in this export is below its band&apos;s level with stock in {words.reserve}.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            total={shown.length}
            page={page}
            pageSize={PAGE_SIZE}
            basePath={base}
            searchParams={searchParams}
            searchPlaceholder="Search by item or description"
            emptyText={q ? "No job matches that search." : filter === "done" ? "No job is done yet." : "Every job is done."}
            filterBar={
              <FilterBar
                basePath={base}
                searchParams={searchParams}
                filters={[{ key: "jobs", label: "Jobs", options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }] }]}
              />
            }
          />
        )}
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Left out of this run</h2>
          <span className="admin-cell-muted">
            {run.leftOut.length} {run.leftOut.length === 1 ? "item" : "items"} held in {words.reserve}
          </span>
        </div>
        <p className="admin-cell-muted">
          Items the profile could not read are listed with the reason, so a missing size or a new product line is visible instead of silently dropped.
        </p>
        {run.leftOut.length === 0 ? (
          <div className="admin-empty">Nothing was left out.</div>
        ) : (
          <div className="admin-table-wrap admin-table-wrap--flat">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {run.leftOut.map((item) => (
                    <tr key={item.item}>
                      <td className="admin-cell-strong">{item.item}</td>
                      <td className="admin-cell-muted">{item.description}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <EarlierRuns runs={earlier} people={people} />
    </>
  );
}
