import { recordAudit } from "@/kernel/audit/audit";
import { readOr } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import type { EventPayload } from "@/kernel/events";
import { selectBoards, selectTasks, updateTasks } from "@/entities/boards";
import { publishBlogAsset } from "@/entities/campaigns/lib/blog-publish";
import { SUBJECT_CAMPAIGN, SUBJECT_CONTENT_ASSET, SUBJECT_CONTENT_DAY, assetStatusFor } from "./rules";

// A person's move on the Revenue board, carried to the content calendar (Dave,
// 2026-09-24: "moving cards updates content status"). The board states what
// happened (board.subtask.toggled, board.card.landed) and this entity decides
// what it means for its own rows; the board never names a content table.
//
//   tick a post's subtask       -> the post is out (Published)
//   untick it                   -> back to Approved (a social post only)
//   day card to Done            -> every post on it is out
//   day card to Not Doing       -> every post not yet out is dropped (Not Doing)
//   writer card to Done         -> the campaign is finished
//   writer card to Not Doing    -> the campaign is archived (the writer stops)
//                                  and its posts not yet out are dropped
//
// A blog is never flipped to Published by a status write: it goes through
// publishBlogAsset, the same path the Publish button takes, so a post the board
// calls out is live on the site. If publishing refuses, the tick is taken back
// so the board does not claim a post that is not there.
//
// Failures throw: the event bus logs and audits a handler that fails, and the
// board's own write has already landed and stays landed.

// The actor the audit rows and the blog publish record is the board the person
// moved the card on, by its name: the content board is chosen by metadata, not
// by name, so "Revenue board" written in code would be wrong on any other. The
// name is read only when a write is about to be recorded, and once per event.
// A failed read costs only the label, so it falls back to a neutral one rather
// than refusing a move the board has already made.
const NEUTRAL_ACTOR = "Content board";

type Actor = () => Promise<string>;

function once(read: () => Promise<string>): Actor {
  let name: Promise<string> | null = null;
  return () => (name ??= read());
}

const boardBySlug = (slug: string): Actor =>
  once(async () => {
    const res = await selectBoards("name").eq("slug", slug).maybeSingle();
    const row = readOr(res, "[campaigns/revenue-board] board name", null) as { name?: string | null } | null;
    return row?.name || NEUTRAL_ACTOR;
  });

const boardOfTask = (taskId: string): Actor =>
  once(async () => {
    const res = await selectTasks("boards:boards!board_id(name)").eq("id", taskId).maybeSingle();
    const row = readOr(res, "[campaigns/revenue-board] board name", null) as { boards?: { name: string } | { name: string }[] | null } | null;
    const board = Array.isArray(row?.boards) ? row.boards[0] : row?.boards;
    return board?.name || NEUTRAL_ACTOR;
  });

type Asset = { channel: string; status: string };

async function setAssetStatus(
  assetId: string,
  want: "published" | "skipped" | "approved",
  subtaskId: string | null,
  actor: Actor,
): Promise<void> {
  const { data, error } = await companyOs.from("marketing_content").select("channel, status").eq("id", assetId).maybeSingle();
  if (error) throw new Error(`content ${assetId}: ${error.message}`);
  const asset = data as Asset | null;
  if (!asset || asset.status === want) return;

  if (want === "published" && asset.channel === "blog") {
    const r = await publishBlogAsset(assetId, await actor());
    if (r.ok) return;
    if (subtaskId) {
      const { error: undoErr } = await updateTasks({ status: "open", completed_at: null }).eq("id", subtaskId);
      if (undoErr) throw new Error(`blog ${assetId} did not publish (${r.errors.join(" ")}) and its tick could not be taken back: ${undoErr.message}`);
    }
    throw new Error(`blog ${assetId} did not publish: ${r.errors.join(" ")}`);
  }
  // A post that is live stays live: dropping a day never unpublishes it, and
  // unticking a blog (which the site is already serving) changes nothing.
  if (want === "skipped" && asset.status === "published") return;
  if (want === "approved" && (asset.status !== "published" || asset.channel === "blog")) return;

  const { error: upErr } = await companyOs.from("marketing_content").update({ status: want }).eq("id", assetId);
  if (upErr) throw new Error(`content ${assetId}: ${upErr.message}`);
  await recordAudit({ table: "marketing_content", recordId: assetId, operation: "update", actor: await actor(), context: { status: want } });
}

export async function onSubtaskToggled(p: EventPayload<"board.subtask.toggled">): Promise<void> {
  if (p.subjectType !== SUBJECT_CONTENT_ASSET || !p.subjectId) return;
  await setAssetStatus(p.subjectId, p.done ? "published" : "approved", p.subtaskId, boardOfTask(p.subtaskId));
}

export async function onCardLanded(p: EventPayload<"board.card.landed">): Promise<void> {
  if (p.status === "open") return;
  const actor = boardBySlug(p.boardSlug);

  if (p.subjectType === SUBJECT_CONTENT_DAY) {
    // The landing has already closed the day's open subtasks the same way
    // (done or not doing), so each subtask's status now says what its post is.
    const { data, error } = await selectTasks("id, status, subject_id")
      .eq("parent_task_id", p.taskId)
      .eq("subject_type", SUBJECT_CONTENT_ASSET)
      .is("archived_at", null);
    if (error) throw new Error(`day ${p.taskId} subtasks: ${error.message}`);
    for (const s of (data ?? []) as unknown as { id: string; status: string; subject_id: string }[]) {
      const want = assetStatusFor(s.status);
      if (want) await setAssetStatus(s.subject_id, want, s.id, actor);
    }
    return;
  }

  if (p.subjectType === SUBJECT_CAMPAIGN && p.subjectId) {
    const status = p.status === "done" ? "done" : "archived";
    const { error } = await companyOs.from("marketing_campaigns").update({ status }).eq("id", p.subjectId);
    if (error) throw new Error(`campaign ${p.subjectId}: ${error.message}`);
    await recordAudit({ table: "marketing_campaigns", recordId: p.subjectId, operation: "update", actor: await actor(), context: { status } });
    if (p.status !== "not_doing") return;
    const { data, error: assetsErr } = await companyOs
      .from("marketing_content")
      .select("id")
      .eq("campaign_id", p.subjectId)
      .neq("status", "published");
    if (assetsErr) throw new Error(`campaign ${p.subjectId} content: ${assetsErr.message}`);
    for (const a of (data ?? []) as { id: string }[]) await setAssetStatus(a.id, "skipped", null, actor);
  }
}
