import { requirePermission } from "@/kernel/identity/access-request";
import { remark } from "remark";
import remarkHtml from "remark-html";
import { listEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { TableSearch } from "@/kernel/ui/TableSearch";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import {
  IDEA_OFFICES,
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  OFFICE_LABEL,
  ideaStatusTone,
  officeTone,
  type IdeaOffice,
  type IdeaStatus,
} from "@/entities/ideas/lib/ideas";
import { IDEA_SELECT, submitterName, type IdeaRow } from "./idea-shared";
import { IdeasShelfProvider, IdeaShelfRow } from "./IdeasShelf";

export const metadata = {
  title: "Idea backlog",
  description: "Employee-submitted build ideas and learnings — Ideas that Spark Solutions.",
};

// Each column shows the newest non-archived rows of its kind. Build ideas and
// learnings hold different fields, so they get their own table rather than one
// mixed grid where half the columns are always empty.
const COLUMN_LIMIT = 100;

const md = remark().use(remarkHtml, { sanitize: true });

async function attachPlanHtml(rows: IdeaRow[]): Promise<IdeaRow[]> {
  // Pre-render each plan's markdown so the client shelf shows it instantly.
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      planHtml: r.ai_plan ? String(await md.process(r.ai_plan)) : null,
    })),
  );
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

function IdeaColumn({
  heading,
  variant,
  rows,
  total,
  emptyText,
}: {
  heading: string;
  variant: "build" | "learning";
  rows: IdeaRow[];
  total: number;
  emptyText: string;
}) {
  const headers =
    variant === "build"
      ? ["Idea", "Submitted by", "Office", "Status", "Plan", "Submitted"]
      : ["Learning", "Submitted by", "Submitted"];

  return (
    // A bare column: the two-track layout is `.admin-ideas-columns` on the
    // parent, so this section only has to exist to be placed in a track.
    <section>
      <div className="admin-ideas-col-head">
        <h2>{heading}</h2>
        <span className="admin-ideas-col-count">{total.toLocaleString()}</span>
      </div>
      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length}>
                    <div className="admin-empty">{emptyText}</div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <IdeaShelfRow key={r.id} row={r}>
                    <td>
                      <span className="admin-cell-strong">{r.title}</span>
                      {variant === "learning" && r.takeaway && (
                        <div className="admin-cell-muted u-mt-1 u-sm">
                          {truncate(r.takeaway)}
                        </div>
                      )}
                    </td>
                    <td>{submitterName(r)}</td>
                    {variant === "build" && (
                      <>
                        <td>
                          {r.office ? (
                            <Badge tone={officeTone(r.office)}>{OFFICE_LABEL[r.office as IdeaOffice]}</Badge>
                          ) : (
                            <span className="admin-cell-muted">—</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={ideaStatusTone(r.status)}>
                            {IDEA_STATUS_LABEL[r.status as IdeaStatus] ?? r.status}
                          </Badge>
                        </td>
                        <td>
                          {r.ai_plan ? (
                            <Badge tone="ok">Ready</Badge>
                          ) : r.ai_error ? (
                            <Badge tone="err">Failed</Badge>
                          ) : (
                            <span className="admin-cell-muted">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td>{formatDate(r.created_at)}</td>
                  </IdeaShelfRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > rows.length && (
          <div className="admin-pagination">
            <span>
              Showing {rows.length} of {total.toLocaleString()} — refine with search or filters.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function IdeasBacklogPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("ideas.manage");
  const searchParams = await props.searchParams;
  const q = firstParam(searchParams.q) ?? "";
  const officeParam = firstParam(searchParams.office);
  const statusParam = firstParam(searchParams.status);

  // Filters shared by both columns. No archived_at column here — "archived" is a
  // status, and the default view hides it.
  const baseFilters: Record<string, string | string[]> = {};
  if (officeParam && (IDEA_OFFICES as readonly string[]).includes(officeParam)) {
    baseFilters.office = officeParam;
  }
  if (statusParam && (IDEA_STATUSES as readonly string[]).includes(statusParam)) {
    baseFilters.status = statusParam;
  } else {
    baseFilters.status = IDEA_STATUSES.filter((s) => s !== "archived");
  }

  const [buildRes, learningRes] = await Promise.all([
    listEntity<IdeaRow>("ideas", IDEA_SELECT, {
      pageSize: COLUMN_LIMIT,
      search: q,
      searchColumns: ["title", "problem", "roi"],
      sort: "created_at",
      dir: "desc",
      filters: { ...baseFilters, kind: "build" },
    }),
    listEntity<IdeaRow>("ideas", IDEA_SELECT, {
      pageSize: COLUMN_LIMIT,
      search: q,
      searchColumns: ["title", "story", "takeaway"],
      sort: "created_at",
      dir: "desc",
      filters: { ...baseFilters, kind: "learning" },
    }),
  ]);

  const [builds, learnings] = await Promise.all([
    attachPlanHtml(buildRes.rows),
    attachPlanHtml(learningRes.rows),
  ]);

  const error = buildRes.error ?? learningRes.error;
  const total = buildRes.total + learningRes.total;

  return (
    <>
      <PageHead
        eyebrow="Innovation"
        title="Idea backlog"
        sub={`${total.toLocaleString()} ${total === 1 ? "entry" : "entries"} — build ideas planned by Claude via the 5D framework, plus learnings shared by the team`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}
      <IdeasShelfProvider>
        <div className="admin-toolbar u-mb-4">
          <TableSearch
            basePath="/admin/innovation/ideas"
            searchParams={searchParams}
            placeholder="Search ideas and learnings…"
          />
          <FilterBar
            basePath="/admin/innovation/ideas"
            searchParams={searchParams}
            filters={[
              {
                key: "office",
                label: "Office",
                options: IDEA_OFFICES.map((o) => ({ value: o, label: OFFICE_LABEL[o] })),
              },
              {
                key: "status",
                label: "Status",
                options: IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABEL[s] })),
              },
            ]}
          />
        </div>
        <div className="admin-ideas-columns">
          <IdeaColumn
            heading="Build ideas"
            variant="build"
            rows={builds}
            total={buildRes.total}
            emptyText="No build ideas match."
          />
          <IdeaColumn
            heading="Learnings"
            variant="learning"
            rows={learnings}
            total={learningRes.total}
            emptyText="No learnings match."
          />
        </div>
      </IdeasShelfProvider>
    </>
  );
}
