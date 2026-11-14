import { activeBoardsWithMetadata, boardOwner, columnsOfBoard } from "@/entities/boards";

// The board the content calendar lives on. Chosen in data, not by name: the
// board whose metadata says `content_board: true` (the Revenue board), with the
// epic its cards file under in `content_epic_id`. A deployment with no such
// board syncs nothing, which is the honest state for a client without one.
export const CONTENT_BOARD_KEY = "content_board";

export type ContentBoard = {
  id: string;
  slug: string;
  // The board's owner takes the day cards and any writer card that is stuck.
  ownerId: string | null;
  epicId: string | null;
  columns: { todo: string; doing: string; waiting: string; done: string; notDoing: string };
};

type ColumnRow = { id: string; name: string; position: number; is_done: boolean; is_not_doing: boolean };

export async function loadContentBoard(): Promise<{ ok: true; board: ContentBoard | null } | { ok: false; error: string }> {
  const { data: boards, error } = await activeBoardsWithMetadata();
  if (error) return { ok: false, error: error.message };
  const row = ((boards ?? []) as { id: string; slug: string; metadata: Record<string, unknown> | null }[]).find(
    (b) => b.metadata?.[CONTENT_BOARD_KEY] === true,
  );
  if (!row) return { ok: true, board: null };

  const [colsRes, ownerRes] = await Promise.all([columnsOfBoard(row.id), boardOwner(row.id)]);
  if (colsRes.error) return { ok: false, error: colsRes.error.message };
  if (ownerRes.error) return { ok: false, error: ownerRes.error.message };
  const cols: ColumnRow[] = colsRes.data ?? [];
  const open = cols.filter((c) => !c.is_done && !c.is_not_doing);
  const done = cols.find((c) => c.is_done);
  const notDoing = cols.find((c) => c.is_not_doing);
  // The standard names first, then position: a board that renamed Doing still
  // has a second open column, and one with a single open column uses it for all.
  const named = (name: string) => open.find((c) => c.name.toLowerCase() === name)?.id;
  if (!open[0] || !done || !notDoing) {
    return { ok: false, error: "The content board needs an open column, a Done column and a Not Doing column." };
  }
  const todo = open[0].id;
  const doing = named("doing") ?? open[1]?.id ?? todo;
  const waiting = named("waiting") ?? open[2]?.id ?? doing;
  const epic = row.metadata?.content_epic_id;
  return {
    ok: true,
    board: {
      id: row.id,
      slug: row.slug,
      ownerId: (ownerRes.data ?? [])[0]?.person_id ?? null,
      epicId: typeof epic === "string" ? epic : null,
      columns: { todo, doing, waiting, done: done.id, notDoing: notDoing.id },
    },
  };
}
