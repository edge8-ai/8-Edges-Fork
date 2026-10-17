import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { listCoachingSessions, type CoachingSessionRow } from "@/entities/coaching/lib/sessions";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { formatDate } from "@/kernel/ui/format";
import { type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "AIO Group Coaching",
  description: "Program coaching recordings, transcripts, and our own actionable summaries.",
};

// Company-internal group coaching (e.g. a cohort programme). Not client-specific, so it
// lives here rather than under a client hub. Every team member can read it.
function minutes(seconds: number | null): string {
  return seconds ? `${Math.round(seconds / 60)} min` : "—";
}

export default async function CoachingSessionsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.sessions");
  const searchParams = await props.searchParams;
  await requireTeamMember();
  const rows = await listCoachingSessions();

  const columns: Column<CoachingSessionRow>[] = [
    {
      key: "started_at",
      header: "Date",
      cell: (s) => (s.startedAt ? formatDate(s.startedAt) : <span className="admin-cell-muted">{"—"}</span>),
    },
    {
      key: "title",
      header: "Session",
      cell: (s) => (
        <Link className="admin-cell-strong" href={`/team/coaching-sessions/${s.id}`}>
          {s.title || "Coaching session"}
        </Link>
      ),
    },
    {
      key: "length",
      header: "Length",
      cell: (s) => <span className="admin-cell-muted">{minutes(s.durationSeconds)}</span>,
    },
    {
      key: "participants",
      header: "Participants",
      cell: (s) => (
        <span className="admin-cell-muted">{s.speakers.length > 0 ? s.speakers.join(", ") : "—"}</span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      cell: (s) => <span className="admin-cell-muted">{s.hasSummary ? "Ready" : "Pending"}</span>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Coaching"
        title="AIO Group Coaching"
        sub={`${rows.length} program coaching session${rows.length === 1 ? "" : "s"}. Not client-specific.`}
      />
      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        basePath="/team/coaching-sessions"
        searchParams={searchParams}
        emptyText="No coaching sessions ingested yet."
      />
    </>
  );
}
