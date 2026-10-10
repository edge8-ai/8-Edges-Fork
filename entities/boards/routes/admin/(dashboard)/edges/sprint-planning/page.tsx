import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { getWorkboard, readSprintCommitCounts } from "@/entities/boards";
import { SprintPlanning } from "@/entities/boards/ui/SprintPlanning";
import { carryCandidates } from "@/entities/boards/lib/carry-candidates";
import { adminViewerPersonId } from "@/entities/boards/lib/viewer";

export const metadata = {
  title: "Sprint planning",
  description: "Everything not done, next week's sprint per board, and what finished this week.",
};

// Sprint planning (SP-01): the Monday-to-Tuesday meeting's page. Done means
// done in the last seven days, one planning cycle, or inside the chosen week.
export default async function SprintPlanningPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.plan");
  const [workboard, viewerPersonId] = await Promise.all([getWorkboard({ scope: { kind: "all" } }), adminViewerPersonId()]);
  const carriedSprints = await readSprintCommitCounts(carryCandidates(workboard.cards));
  return (
    <>
      <PageHead eyebrow="8 Edges" title="Sprint planning" sub="Move what is not done into next week's sprint or to done. Each card lands in its own board's sprint." />
      <SprintPlanning data={workboard} today={saigonToday()} carriedSprints={carriedSprints} viewerPersonId={viewerPersonId} />
    </>
  );
}
