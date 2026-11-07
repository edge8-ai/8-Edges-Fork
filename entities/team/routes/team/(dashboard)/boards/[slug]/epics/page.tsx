import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import type { SearchParamsObj } from "@/kernel/ui/url";
import { EpicsView } from "@/entities/boards";

export const metadata = { title: "Epics" };

// /team/boards/[slug]/epics — getBoardForActor returning null IS the
// authorization, same as the board page itself. Only an admin renames,
// recolours or archives an epic; any member may create one (W.153), as the
// card's epic picker lets them and createEpic's own guard allows.
export default async function TeamEpicsPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParamsObj> }
) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const searchParams = await props.searchParams;
  const params = await props.params;
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/team/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title="Epics"
        sub="One row per feature: its open and done cards, and the Human Tokens behind them."
      />
      <EpicsView detail={detail} surface="/team" canManage={actor.isAdmin} canCreate searchParams={searchParams} />
    </>
  );
}
