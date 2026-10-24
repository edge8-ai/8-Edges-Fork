import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { selectKeyResults } from "@/entities/org";
import { listAssignablePeople, listPeopleNames } from "@/entities/crm";
import { ISSUE_SELECT, type IssueRow } from "@/entities/org";
import { IssuesBoard } from "./IssuesBoard";

export const metadata = {
  title: "Issues",
  description: "8 Edges: anything blocking a goal, diagnosed before blamed.",
};

export default async function IssuesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("ideas.manage");
  const [issuesRes, krRes, teamOptions] = await Promise.all([
    companyOs.from("issues").select(ISSUE_SELECT).order("created_at", { ascending: false }),
    selectKeyResults("id, title"),
    listAssignablePeople(),
  ]);

  const issues = (issuesRes.data ?? []) as IssueRow[];
  const krs = ((krRes.data ?? []) as { id: string; title: string }[]).sort((a, b) => a.title.localeCompare(b.title));

  // The picker offers the current roster. Names are also needed for assignees
  // who have since left, so their closed issues still read as theirs.
  const personName = await listPeopleNames([
    ...teamOptions.map((p) => p.id),
    ...(issues.map((i) => i.assignee_person_id).filter(Boolean) as string[]),
  ]);

  const error = issuesRes.error?.message ?? krRes.error?.message ?? null;

  return (
    <>
      <PageHead
        eyebrow="8 Edges"
        title="Issues"
        sub="Anything blocking a goal, diagnosed before blamed: goal problem, system problem, or execution problem. Agents file them automatically when numbers slip."
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}
      <IssuesBoard
        issues={issues}
        krs={krs}
        personNames={Object.fromEntries(personName)}
        teamOptions={teamOptions}
      />
    </>
  );
}
