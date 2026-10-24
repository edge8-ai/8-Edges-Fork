import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { SprintView } from "@/entities/boards";
import { listRecentMeetings } from "@/entities/boards";

export const metadata = { title: "Sprint" };

// /team/boards/[slug]/sprints/[id] — getBoardForActor returning null IS the
// authorization, same as the board page itself.
export default async function TeamSprintPage(props: { params: Promise<{ slug: string; sprintId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const params = await props.params;
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();
  const sprint = detail.sprints.find((s) => s.id === params.sprintId);
  if (!sprint) notFound();
  const meetings = await listRecentMeetings();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/team/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title={sprint.name}
        sub={detail.board.client_name ? `Sprint · ${detail.board.client_name}` : "Sprint"}
      />
      <SprintView detail={detail} sprintId={sprint.id} meetingOptions={meetings} />
    </>
  );
}
