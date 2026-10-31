// /admin/talent/training: every class in the Admin view, under Talent ›
// People (Dave, 2026-10-26). A class is one lesson on a course. The list has
// one row per class, grouped by month and in date order, held and scheduled
// together: a scheduled class shows "Scheduled" and its lesson plan, which the
// instructor writes ahead of each class; a held one its recap, video and
// attendees. A row opens the class's own page (./classes/[id]), a full page
// with no side shelf. The course is a column and a filter, never the grain.
// Classes of an archived course are not read at all, and a cancelled class
// shows only under its own filter. Read-only; what a class page may show is
// in lib/class-read.ts (ADR 0016, amended 2026-10-26).
import { Fragment } from "react";
import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { trainingRecordings } from "@/entities/crm";
import { LESSON_PLAN_LABEL, classesRead, type ClassRow } from "@/entities/training/lib/class-read";
import { RECAP_LABEL } from "@/entities/training/lib/session-recap-rules";
import { monthLabel, whenLabel } from "@/entities/training/lib/training-format";
import { LinkRow } from "@/entities/training/ui/LinkRow";

export const metadata = { title: "Training", description: "Every class by month: its lesson plan, recap, video and who came." };

const BASE = "/admin/talent/training";

type Row = ClassRow & { video: boolean; month: string };

export default async function ClassesPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const searchParams = await props.searchParams;
  const now = new Date();
  const classes = await classesRead(now);
  const recordings = await trainingRecordings(classes.filter((c) => c.held).map((c) => c.id));
  const all: Row[] = classes.map((c) => ({ ...c, video: Boolean(recordings.get(c.id)?.recording), month: monthLabel(c.startsAt) }));

  const when = firstParam(searchParams.when) ?? "";
  const course = firstParam(searchParams.course) ?? "";
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const rows = all.filter((r) => {
    // A cancelled class shows only when asked for.
    if (when === "cancelled" ? !r.cancelled : r.cancelled) return false;
    if (when === "held" && !r.held) return false;
    if (when === "scheduled" && r.held) return false;
    if (course && r.courseId !== course) return false;
    return !q || `${r.courseTitle} ${r.title} ${whenLabel(r.startsAt, r.endsAt)} ${r.month}`.toLowerCase().includes(q);
  });
  const courses = [...new Map(all.map((r) => [r.courseId, { value: r.courseId, label: `${r.courseTitle}${r.courseOpen ? "" : " (closed to learners)"}` }])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const live = all.filter((r) => !r.cancelled);
  // The first row of each month carries the month's heading row above it.
  const opensMonth = new Set(rows.filter((r, i) => i === 0 || rows[i - 1]!.month !== r.month).map((r) => r.id));

  const columns: Column<Row>[] = [
    { key: "when", header: "Date and time", cell: (r) => <span className="admin-cell-strong">{whenLabel(r.startsAt, r.endsAt)}</span> },
    {
      key: "course",
      header: "Course",
      cell: (r) => (
        <span className="admin-cell-stack">
          <span>{r.courseTitle}</span>
          <span className="admin-cell-muted">{r.courseRhythm}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => (r.cancelled ? <Badge tone="err">Cancelled</Badge> : r.held ? "Held" : <Badge tone="info">Scheduled</Badge>) },
    { key: "plan", header: "Lesson plan", cell: (r) => (r.lessonPlan === "none" ? <span className="admin-cell-muted">{LESSON_PLAN_LABEL.none}</span> : LESSON_PLAN_LABEL[r.lessonPlan]) },
    { key: "recap", header: "Recap", cell: (r) => (!r.held ? <span className="admin-cell-muted">After the class</span> : r.recapState === "none" ? <span className="admin-cell-muted">{RECAP_LABEL.none}</span> : RECAP_LABEL[r.recapState]) },
    { key: "video", header: "Video", cell: (r) => (!r.held ? <span className="admin-cell-muted">After the class</span> : r.video ? <Badge tone="ok">Yes</Badge> : <span className="admin-cell-muted">No</span>) },
    {
      key: "attendees",
      header: "Attendees",
      align: "right",
      cell: (r) => <span className="admin-cell-mono">{r.cancelled ? "—" : r.held ? `${r.attended} of ${r.registered}` : `${r.registered} on the list`}</span>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent/team">Talent · People</Link>}
        title="Training"
        sub="Every class by month, held and scheduled. The instructor writes each class's lesson plan ahead of it, so a scheduled class shows No plan yet until they do. Open a class for the video, attendees, recap and each learner's feedback."
      />
      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Classes held" value={live.filter((r) => r.held).length} />
        <MetricCard label="Classes scheduled" value={live.filter((r) => !r.held).length} />
        <MetricCard label="Recaps drafted" value={live.filter((r) => r.recapState === "drafted").length} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        basePath={BASE}
        searchParams={searchParams}
        searchPlaceholder="Search classes, courses or months…"
        emptyText={q || when || course ? "No class matches." : "No classes yet."}
        filterBar={
          <FilterBar
            basePath={BASE}
            searchParams={searchParams}
            filters={[
              {
                key: "when",
                label: "Classes",
                options: [
                  { value: "held", label: "Held" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "cancelled", label: "Cancelled" },
                ],
              },
              { key: "course", label: "Course", options: courses },
            ]}
          />
        }
        renderRow={(r, cells) => (
          <Fragment>
            {opensMonth.has(r.id) && (
              <tr className="admin-table-group-row">
                <td colSpan={columns.length}>{r.month}</td>
              </tr>
            )}
            <LinkRow href={`${BASE}/classes/${r.id}`}>{cells}</LinkRow>
          </Fragment>
        )}
      />
    </>
  );
}
