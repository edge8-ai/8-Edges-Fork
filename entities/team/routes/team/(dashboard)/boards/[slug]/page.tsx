import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { moveCardColumn } from "@/entities/boards";
import { reportContractorHours } from "@/entities/portal";
import { PageHead } from "@/kernel/ui/PageHead";
import { boardFacesDrawn, listBoardManageOptions, Workboard } from "@/entities/boards";
import { bordersOf, wornTiersFor } from "@/kernel/shell/faces";
import type { BadgeDropsSlot } from "@/entities/ladders";

export const metadata = { title: "Board" };

// /team/boards/[slug] — a board the member belongs to. getBoardForActor returns
// null unless the actor is a member (or admin); that IS the authorization.
//
// The worn borders (LD.8): one ask of the kernel's faces seam for every
// assignee the board draws, for this reader, beside the manage options.
export default async function TeamBoardPage(props: { params: Promise<{ slug: string }>; badgeDrops: BadgeDropsSlot }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const params = await props.params;
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();
  // Admins get the same management controls on /team as on /admin. The
  // reader's own badge drop (LD.7b) comes with them: a badge a card into Done
  // just found is one quiet line above the board, from ladders through the
  // page slot.
  const [options, worn, drop] = await Promise.all([
    actor.isAdmin ? listBoardManageOptions() : Promise.resolve({ team: [], clients: [], programs: [] }),
    wornTiersFor(boardFacesDrawn(detail), { personId: actor.personId }),
    props.badgeDrops ? props.badgeDrops({ personId: actor.personId }, "board") : null,
  ]);

  return (
    <>
      <PageHead
        eyebrow={<Link href="/team">← Workspace</Link>}
        title={detail.board.name}
        sub={detail.board.client_name ? `Client board · ${detail.board.client_name}` : "Cards move, promises get kept."}
      />
      {drop}
      <Workboard
        data={detail}
        onMove={moveCardColumn}
        onReportHours={reportContractorHours}
        extras
        canManage={actor.isAdmin}
        teamOptions={options.team}
        clientOptions={options.clients}
        programOptions={options.programs}
        viewerPersonId={actor.personId}
        borders={bordersOf(worn)}
      />
    </>
  );
}
