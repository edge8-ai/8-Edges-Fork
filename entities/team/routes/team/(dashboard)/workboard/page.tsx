import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { Workboard, workboardHeadSummary } from "@/entities/boards";
import { getTeamWorkboard } from "@/entities/team/lib/boards";
import { moveCardColumn } from "@/entities/boards";
import { reportContractorHours } from "@/entities/portal";

export const metadata = { title: "Workboard" };

// The member's Workboard (WB-04): every card on every board of every client
// they are assigned to, the same view the admin has on /admin/edges/workboard,
// scoped to their assignments. Move, add and edit are on; the actions re-check
// membership per board, so this page is presentation only.
export default async function TeamWorkboardPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const data = await getTeamWorkboard(actor);

  return (
    <>
      {/* The same quiet line the admin Workboard carries (W.92.5), from the
          same function, so the two pages cannot drift into two descriptions
          of the same scope — which is what they had. The list of client names
          it replaced grew with every client assigned and told a member
          nothing they could not read off the client filter.
          No board switcher here: it navigates to /admin/boards/<slug> and the
          team hub has no single-board route to send anybody to. */}
      <PageHead
        eyebrow="Work"
        title="Workboard"
        sub={data.boards.length > 0 ? workboardHeadSummary(data) : "The boards of the clients you are assigned to. No boards yet."}
      />
      <Workboard data={data} onMove={moveCardColumn} onReportHours={reportContractorHours} viewerPersonId={actor.personId} defaultToViewer />
    </>
  );
}
