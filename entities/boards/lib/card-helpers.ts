// Helpers shared by the board card actions. They used to be private to
// the board actions file; ME-11 lifted moveCardColumn out of that file
// (lib/boards/move-card.ts) so the team entity can reach it through
// the company-os index instead of importing a route module, and the three
// pieces both files need live here rather than being redeclared.
import { revalidatePath } from "next/cache";
import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";
import { externalHref } from "@/kernel/ui/url";

export const DENIED = "You do not have access to this board.";

// These actions serve both /admin/boards and /team/boards, so refresh both,
// and the Workboard pages that show every board at once (WB-02..04): without
// this a save from the list view landed in the database but the page kept
// serving its cached read (Dave, 2026-09-07).
export function refresh(slug?: string) {
  if (slug) {
    revalidatePath(`/admin/boards/${slug}`);
    revalidatePath(`/team/boards/${slug}`);
  } else {
    revalidatePath("/admin/boards", "layout");
    revalidatePath("/team/boards", "layout");
  }
  revalidatePath("/team/workboard");
  revalidatePath("/admin/edges/workboard");
  revalidatePath("/team/sprint-planning");
  revalidatePath("/admin/edges/sprint-planning");
  revalidatePath("/admin");
}

// Merge the card-level values that live as loose keys on tasks.metadata
// (assigned_at, pr_url, build_summary). Returns the next metadata and whether
// anything changed, so updateCard writes metadata once. A blank pr_url/summary
// removes the key; `assignedAt` restarts the assignee's "New" window.
export function mergeCardMeta(
  existing: Record<string, unknown> | null | undefined,
  patch: { assignedAt?: boolean; prUrl?: string | null; buildSummary?: string | null },
): { meta: Record<string, unknown>; changed: boolean } {
  const meta = { ...(existing ?? {}) };
  let changed = false;
  if (patch.assignedAt) {
    meta.assigned_at = new Date().toISOString();
    changed = true;
  }
  if (patch.prUrl !== undefined) {
    // Stored with its scheme when it can be (W.116): a PR link typed without
    // https:// was an href relative to this app. A value that is no link at
    // all is kept as typed, and the chip that draws it refuses to (below).
    if (patch.prUrl?.trim()) meta.pr_url = externalHref(patch.prUrl) ?? patch.prUrl.trim();
    else delete meta.pr_url;
    changed = true;
  }
  if (patch.buildSummary !== undefined) {
    if (patch.buildSummary?.trim()) meta.build_summary = patch.buildSummary.trim();
    else delete meta.build_summary;
    changed = true;
  }
  return { meta, changed };
}

// The position a card takes when it joins a column. The database answers
// under a per-column lock (append_task_position, migration 20260912130000)
// so two simultaneous moves cannot tie. Until that migration is applied the
// function does not exist and the call errors; the read-top-plus-one that
// preceded it is kept as the fallback, so the board keeps working either way
// and the only thing the migration changes is the race (W.6).
export async function endPosition(boardId: string, columnId: string): Promise<number> {
  const { data: appended, error: rpcErr } = await companyOsUntyped.rpc("append_task_position", {
    p_board_id: boardId,
    p_column_id: columnId,
  });
  if (!rpcErr && typeof appended === "number") return appended;
  // Missing function (PGRST202) is the pre-migration case and is silent; any
  // other error is a real one and is said, because the fallback below is the
  // racy read this function exists to replace.
  if (rpcErr && rpcErr.code !== "PGRST202" && !/does not exist|could not find/i.test(rpcErr.message)) {
    console.error("[boards] append_task_position", rpcErr);
  }
  const { data, error: positionErr } = await companyOs
    .from("tasks")
    .select("position")
    .eq("board_id", boardId)
    .eq("board_column_id", columnId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionErr) console.error("[boards] tasks", positionErr);
  const top = (data as { position: number } | null)?.position;
  return (typeof top === "number" ? top : 0) + 1;
}

/**
 * Makes a person a member of a board, so the board opens for them: assigning
 * a card does it, and so does an @mention (W.143), because a mention's Lark
 * message links to the card and a link to a board you cannot open is no way
 * into the conversation. Returns the database's message, or null when the
 * person is a member (already, or now), so a caller can say that the card or
 * comment itself was saved even when this follow-up write failed.
 */
export async function ensureMember(boardId: string, personId: string): Promise<string | null> {
  const { error } = await companyOs.from("board_members").upsert({ board_id: boardId, person_id: personId, role: "member" }, { onConflict: "board_id,person_id", ignoreDuplicates: true });
  return error ? error.message : null;
}

