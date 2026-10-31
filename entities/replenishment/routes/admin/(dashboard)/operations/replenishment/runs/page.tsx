import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { listProfiles, listRuns, runDay, runTime, statusWords, workedByWords, type RunSummary } from "@/entities/replenishment";
import { UploadExport } from "./UploadExport";

export const metadata = {
  title: "Replenishment runs",
  description: "Upload the week's stock export, check the jobs, then send them to the scanners.",
};

// Operations → Warehouse → Runs (RP.4; spec 2026-10-28, "Surfaces"): the
// upload, and every run newest first with its status, its job and done counts
// and who worked it (RP.7). Opening a run shows its checks, jobs and left-out
// items, and sends it.

const PAGE_SIZE = 25;
const BASE = "/admin/operations/replenishment/runs";

type Row = RunSummary & { profileName: string; workedByNames: string };

const columns: Column<Row>[] = [
  {
    key: "export",
    header: "Export",
    cell: (run) => (
      <div className="admin-cell-stack">
        <Link href={`${BASE}/${run.id}`} className="admin-cell-strong">
          {runDay(run.uploadedAt)}
        </Link>
        <span className="admin-cell-muted u-break-all">
          {run.fileName} · {runTime(run.uploadedAt)}
        </span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (run) => {
      const words = statusWords(run.status);
      return <Badge tone={words.tone}>{words.text}</Badge>;
    },
  },
  { key: "profile", header: "Profile", cell: (run) => `${run.profileName} v${run.profileVersion}` },
  { key: "rows", header: "Rows", align: "right", cell: (run) => <span className="u-tabular">{run.dataRows.toLocaleString("en-US")}</span> },
  { key: "jobs", header: "Jobs", align: "right", cell: (run) => <span className="u-tabular">{run.jobs}</span> },
  { key: "done", header: "Done", align: "right", cell: (run) => <span className="u-tabular">{run.done}</span> },
  { key: "worked", header: "Worked by", cell: (run) => <span className="admin-cell-muted">{run.workedByNames}</span> },
];

export default async function ReplenishmentRunsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  const access = await requirePermission("replenishment.runs");
  const searchParams = await props.searchParams;
  const [profiles, runs] = await Promise.all([listProfiles(), listRuns()]);
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  const people = await peopleOnRecord(runs.flatMap((run) => run.workedBy));
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const rows: Row[] = runs
    .map((run) => ({ ...run, profileName: names.get(run.profileId) ?? "An archived profile", workedByNames: workedByWords(run.workedBy, people) }))
    .filter((run) => !q || run.fileName.toLowerCase().includes(q) || run.profileName.toLowerCase().includes(q));
  const page = Math.max(1, Number(firstParam(searchParams.page)) || 1);

  return (
    <>
      <PageHead eyebrow="Operations · Warehouse" title="Replenishment runs" sub="Upload the week's stock export, check the jobs, then send them to the scanners." />

      {profiles.length === 0 ? (
        <div className="admin-alert admin-alert--info u-mb-3">
          A run is read with a profile, and there is none yet.{" "}
          <Link href="/admin/operations/replenishment/profile">Import the warehouse&apos;s profile</Link> first.
        </div>
      ) : (
        <UploadExport may={mayProp(access, ["replenishment.runs"])} profiles={profiles.map(({ id, name, warehouse }) => ({ id, name, warehouse }))} />
      )}

      <div className="u-mt-4">
        <DataTable
          columns={columns}
          rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
          total={rows.length}
          page={page}
          pageSize={PAGE_SIZE}
          basePath={BASE}
          searchParams={searchParams}
          searchPlaceholder="Search by file or profile"
          emptyText="No runs yet. Upload this week's export to make the first."
        />
      </div>
    </>
  );
}
