import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listBoards, listBoardManageOptions } from "@/entities/boards/lib/data";
import { BoardsIndex } from "./BoardsIndex";
import { InactiveBoards } from "./InactiveBoards";
import { BoardStatusToggle } from "./BoardStatusToggle";

export const metadata = {
  title: "Boards",
  description: "Task boards for client projects, our own products, and day-to-day work.",
};

// Active boards by default; ?status=inactive lists the archived ones.
export default async function BoardsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.manage");
  const searchParams = await props.searchParams;
  const inactive = firstParam(searchParams.status) === "inactive";
  const [boards, options] = await Promise.all([listBoards({ archived: inactive }), listBoardManageOptions()]);

  return (
    <>
      <PageHead
        eyebrow="Workspace"
        title="Boards"
        sub="Kanban boards for client projects, our own products, and day-to-day work."
        action={<BoardStatusToggle inactive={inactive} />}
      />
      {inactive ? <InactiveBoards boards={boards} /> : <BoardsIndex boards={boards} clients={options.clients} />}
    </>
  );
}
