import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientRoadmapForActor, companyHasPrograms } from "@/entities/team/lib/hub-clients";
import { BotText } from "@/kernel/ui/BotText";
import { listAssignableStaff } from "@/entities/crm";
import { RoadmapItemCard } from "./RoadmapItemCard";
import { AddItemForm } from "./AddItemForm";

export const metadata = {
  title: "Client Roadmap",
};

// The Roadmap tab: the same groups, ordering, and client-set priorities the
// client sees on /portal/roadmap, so the team view and the client view always
// agree. Assigned team members can add items and edit content/status; Edge8
// priority and client priority stay admin/client-only.

export default async function TeamClientRoadmapTab(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  const [roadmap, hasPrograms, assignees] = await Promise.all([
    getClientRoadmapForActor(actor, params.companyId),
    companyHasPrograms(params.companyId),
    listAssignableStaff(params.companyId),
  ]);
  if (!roadmap) notFound();

  // With AI Programs present this tab is company-wide: untagged items only
  // (program roadmaps live in their AI Program view), plus any group that is
  // company-wide or still holds an untagged item, so nothing renders orphaned.
  const { overview } = roadmap;
  const items = hasPrograms ? roadmap.items.filter((i) => !i.ai_program_id) : roadmap.items;
  const usedKeys = new Set(items.map((i) => i.group_key));
  const groups = hasPrograms
    ? roadmap.groups.filter((g) => g.ai_program_id === null || usedKeys.has(g.key))
    : roadmap.groups;

  return (
    <div className="admin-roadmap">

      {overview && (
        <section className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-2">Overview</h2>
          <div className="u-lead-sm">
            <BotText text={overview} />
          </div>
        </section>
      )}

      <AddItemForm companyId={params.companyId} groups={groups} />

      {items.length === 0 ? (
        <div className="admin-card admin-section-card u-p-5">
          <p className="admin-page-sub u-m-0">No roadmap items yet for this client.</p>
        </div>
      ) : (
        groups.map((g) => {
          const groupItems = items.filter((i) => i.group_key === g.key);
          if (groupItems.length === 0) return null;
          return (
            <div key={g.key} className="admin-roadmap-group">
              <div className="admin-roadmap-group-head">
                {g.step_label && <span className="admin-roadmap-step">{g.step_label}</span>}
                <span className="admin-roadmap-group-title">{g.title}</span>
              </div>
              {g.intro && <div className="admin-roadmap-group-intro">{g.intro}</div>}
              {groupItems.map((it) => (
                <RoadmapItemCard key={it.id} item={it} companyId={params.companyId} assignees={assignees} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
