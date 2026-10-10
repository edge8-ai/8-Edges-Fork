import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { SprintPlanning, carryCandidates, readSprintCommitCounts } from "@/entities/boards";
import { getTeamWorkboard } from "@/entities/team/lib/boards";

export const metadata = { title: "Sprint planning" };

// The member's sprint planning (SP-01): the same three columns the admin has,
// scoped to the boards they are on. The card moves re-check membership per
// board, so this page is presentation only.
export default async function TeamSprintPlanningPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const data = await getTeamWorkboard(actor);
  const carriedSprints = await readSprintCommitCounts(carryCandidates(data.cards));
  return (
    <>
      <PageHead eyebrow="Work" title="Sprint planning" sub="Move what is not done into next week's sprint or to done. Each card lands in its own board's sprint." />
      <SprintPlanning data={data} today={saigonToday()} carriedSprints={carriedSprints} viewerPersonId={actor.personId} />
    </>
  );
}
