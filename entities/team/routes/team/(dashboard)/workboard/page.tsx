import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { bordersOf, wornTiersFor } from "@/kernel/shell/faces";
import { boardFacesDrawn, Workboard, workboardHeadSummary } from "@/entities/boards";
import { getTeamWorkboard } from "@/entities/team/lib/boards";
import { moveCardColumn } from "@/entities/boards";
import { reportContractorHours } from "@/entities/portal";
import type { BadgeDropsSlot } from "@/kernel/shell/page-slots";

export const metadata = { title: "Workboard" };

// The member's Workboard (WB-04): every card on every board of every client
// they are assigned to, the same view the admin has on /admin/edges/workboard,
// scoped to their assignments. Move, add and edit are on; the actions re-check
// membership per board, so this page is presentation only.
//
// The worn borders (LD.8): the page asks the kernel's faces seam once for every
// assignee the board draws, for this reader, so a border costs one read however
// many cards there are. The seam answers nothing when the reader's game style
// is off or the deployment has no ladders; each face is handed the tier alone.
export default async function TeamWorkboardPage(props: { badgeDrops: BadgeDropsSlot }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const data = await getTeamWorkboard(actor);
  // And the reader's own badge drop (LD.7b): a badge a card into Done just
  // found is one quiet line above the board, from ladders through the page
  // slot; nothing when ladders is not installed or nothing waits.
  const [worn, drop] = await Promise.all([
    wornTiersFor(boardFacesDrawn(data), { personId: actor.personId }),
    props.badgeDrops ? props.badgeDrops({ personId: actor.personId }, "board") : null,
  ]);

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
        eyebrow="My Work"
        title="Workboard"
        sub={data.boards.length > 0 ? workboardHeadSummary(data) : "The boards of the clients you are assigned to. No boards yet."}
      />
      {drop}
      <Workboard data={data} onMove={moveCardColumn} onReportHours={reportContractorHours} viewerPersonId={actor.personId} defaultToViewer borders={bordersOf(worn)} />
    </>
  );
}
