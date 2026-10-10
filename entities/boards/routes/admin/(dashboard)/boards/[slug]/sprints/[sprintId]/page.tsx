import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { getBoardBySlug, listRecentMeetings } from "@/entities/boards/lib/data";
import { SprintView } from "@/entities/boards/ui/SprintView";

export const metadata = {
  title: "Sprint",
  description: "Plan vs actual for one sprint.",
};

export default async function SprintDetailPage(props: { params: Promise<{ slug: string; sprintId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.open");
  const params = await props.params;
  const detail = await getBoardBySlug(params.slug);
  if (!detail) notFound();
  const sprint = detail.sprints.find((s) => s.id === params.sprintId);
  if (!sprint) notFound();
  const meetings = await listRecentMeetings();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/admin/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title={sprint.name}
        sub={detail.board.client_name ? `Sprint · ${detail.board.client_name}` : "Sprint"}
      />
      <SprintView detail={detail} sprintId={sprint.id} meetingOptions={meetings} />
    </>
  );
}
