import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { HAS_CLIENT_DATES_FILTER } from "@/kernel/identity/client-status";
import { companyOs } from "@/kernel/data/supabase";
import { selectTasks } from "@/entities/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { BACKLOG_SELECT, ROADMAP_GROUPS_SELECT, type BacklogItem, type RoadmapGroup, selectClientRoadmapOverview, selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms, ROADMAP_ACTIONS, SAVE_ROADMAP_OVERVIEW } from "@/entities/client-programs";
import { CompanyDocuments, type ProgramOption, listAssignableStaff } from "@/entities/crm";
import { listDocumentsForCompanies } from "@/entities/portal";
import { CompanyPicker } from "./CompanyPicker";
import { BacklogAdminEditor, OverviewEditor } from "@/entities/client-programs/client";

export const metadata = {
  title: "Client Roadmaps",
  description: "Per-client AI Program roadmap: items, priorities and client proposals.",
};

type ClientOption = { id: string; name: string };

export default async function ClientBacklogPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("client-programs.roadmaps");
  const searchParams = await props.searchParams;
  const companyId = firstParam(searchParams.company) ?? "";
  const showArchived = firstParam(searchParams.archived) === "1";

  const { data: companyRows, error: companyError } = await companyOs
    .from("companies")
    .select("id, name")
    // Current and former clients: a former client's roadmap stays reachable.
    .or(HAS_CLIENT_DATES_FILTER)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (companyError) console.error("[edges/client-roadmaps] client load failed:", companyError.message);
  const clients = (companyRows ?? []) as ClientOption[];

  const selected = clients.find((c) => c.id === companyId) ?? null;

  // ── Detail view: one client's backlog ──────────────────────────────
  if (selected) {
    let query = selectClientBacklogItems(BACKLOG_SELECT)
      .eq("company_id", selected.id)
      .order("sort_order", { ascending: true });
    if (!showArchived) query = query.is("archived_at", null);
    let groupsQuery = selectClientRoadmapGroups(ROADMAP_GROUPS_SELECT)
      .eq("company_id", selected.id)
      .order("sort_order", { ascending: true });
    if (!showArchived) groupsQuery = groupsQuery.is("archived_at", null);
    const [{ data }, { data: groupRows }, { data: overviewRow }, documents, { data: programRows }, assignees] = await Promise.all([
      query,
      groupsQuery,
      selectClientRoadmapOverview("body").eq("company_id", selected.id).maybeSingle(),
      listDocumentsForCompanies([selected.id]),
      selectAiPrograms("id, name").eq("company_id", selected.id).order("created_at", { ascending: false }),
      listAssignableStaff(selected.id),
    ]);
    const items = (data ?? []) as unknown as BacklogItem[];
    const groups = (groupRows ?? []) as unknown as RoadmapGroup[];

    // Which items have a live (non-archived) board card linked to them.
    const itemIds = items.map((i) => i.id);
    let liveCardItemIds = new Set<string>();
    if (itemIds.length > 0) {
      const { data: linkRows, error: linkError } = await selectTasks("subject_id")
        .eq("subject_type", "client_backlog_item")
        .in("subject_id", itemIds)
        .is("archived_at", null);
      if (linkError) console.error("[edges/client-roadmaps] card link load failed:", linkError.message);
      liveCardItemIds = new Set(((linkRows ?? []) as { subject_id: string }[]).map((r) => r.subject_id));
    }
    const overviewBody = (overviewRow as { body: string } | null)?.body ?? "";
    const programs = (programRows ?? []) as ProgramOption[];
    const proposedCount = items.filter((i) => i.status === "proposed").length;

    return (
      <>
        <PageHead
          eyebrow={<Link href="/admin/edges/client-roadmaps">← All clients</Link>}
          title={selected.name}
          sub={`${items.length} item${items.length === 1 ? "" : "s"}${proposedCount ? ` · ${proposedCount} client proposal${proposedCount === 1 ? "" : "s"} to review` : ""}`}
          action={<CompanyPicker clients={clients} selectedId={companyId} showArchived={showArchived} />}
        />
        <OverviewEditor save={SAVE_ROADMAP_OVERVIEW} companyId={selected.id} initialBody={overviewBody} />
        <BacklogAdminEditor
          actions={ROADMAP_ACTIONS}
          companyId={selected.id}
          groups={groups}
          items={items}
          showArchived={showArchived}
          liveCardItemIds={liveCardItemIds}
          programs={programs}
          assignees={assignees}
        />
        <section className="admin-card admin-section-card u-mt-4">
          <h2 className="admin-card-title u-mb-1">Documents</h2>
          <p className="admin-page-sub u-m-0 u-mb-3">
            Shared with {selected.name}: everything here is visible in their portal and to the assigned team.
          </p>
          <CompanyDocuments companyId={selected.id} documents={documents} programs={programs} />
        </section>
      </>
    );
  }

  // ── Index view: all clients with backlog counts ────────────────────
  const clientIds = clients.map((c) => c.id);
  const countsByCompany = new Map<string, { total: number; proposals: number }>();
  if (clientIds.length > 0) {
    const { data: rows, error: rowsError } = await selectClientBacklogItems("company_id, status")
      .in("company_id", clientIds)
      .is("archived_at", null);
    if (rowsError) console.error("[edges/client-roadmaps] backlog counts load failed:", rowsError.message);
    for (const r of (rows ?? []) as Array<{ company_id: string; status: string }>) {
      const c = countsByCompany.get(r.company_id) ?? { total: 0, proposals: 0 };
      c.total += 1;
      if (r.status === "proposed") c.proposals += 1;
      countsByCompany.set(r.company_id, c);
    }
  }

  // Clients with a backlog first (most proposals, then most items), then the rest A–Z.
  const withBacklog = clients
    .filter((c) => countsByCompany.has(c.id))
    .sort((a, b) => {
      const ca = countsByCompany.get(a.id)!;
      const cb = countsByCompany.get(b.id)!;
      return cb.proposals - ca.proposals || cb.total - ca.total || a.name.localeCompare(b.name);
    });
  const withoutBacklog = clients.filter((c) => !countsByCompany.has(c.id));

  return (
    <>
      <PageHead
        eyebrow="Edges"
        title="Client Roadmaps"
        sub="Each client's AI Program roadmap: what they see in their portal. Open one to shape its groups, edit items, set priorities, and review their proposals."
      />

      <div className="admin-card u-p-0 u-clip">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Client</th>
              <th className="admin-th--sm u-right">Items</th>
              <th className="admin-th--lg">To review</th>
            </tr>
          </thead>
          <tbody>
            {[...withBacklog, ...withoutBacklog].map((c) => {
              const counts = countsByCompany.get(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/edges/client-roadmaps?company=${c.id}`} className="admin-cell-strong">
                      {c.name}
                    </Link>
                  </td>
                  <td className="u-right">
                    {counts ? counts.total : <span className="admin-cell-muted">—</span>}
                  </td>
                  <td>
                    {counts && counts.proposals > 0 ? (
                      <Badge tone="warn">
                        {counts.proposals} proposal{counts.proposals === 1 ? "" : "s"}
                      </Badge>
                    ) : counts ? (
                      <span className="admin-cell-muted">—</span>
                    ) : (
                      <span className="admin-cell-muted">no backlog yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="admin-cell-muted u-p-4">
                  No client companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
