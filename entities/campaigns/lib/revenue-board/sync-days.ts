import { addDays } from "@/kernel/config/dates";
import { dayLabel, endPosition, insertTasks, landCardAsSystem, selectTasks, updateTasks } from "@/entities/boards";
import { companyOs } from "@/kernel/data/supabase";
import type { ContentBoard } from "./board";
import { POST_TOKENS, SUBJECT_CONTENT_ASSET, SUBJECT_CONTENT_DAY, alreadyMade, contentDayState, subtaskFor, type SyncAsset } from "./rules";

// One card per day of content on the Revenue board, a subtask per post (rules
// in rules.ts). The calendar is the source of truth for WHAT is posted; the
// board is where a person does it. So this pass only ever makes the board
// agree with the calendar, and a person's move on the board reaches the
// calendar through the board's events (writeback.ts), never through here.
//
// The day card closes itself only when the calendar's answer CHANGES (the
// last post went out, or every post was dropped), recorded on the card as
// metadata.content_state. A person who drags a finished day back to Doing is
// not dragged back: nothing on the calendar changed.
//
// Two passes can overlap (a slow hour and the next, or a manual re-run), so
// each insert may find its card already made: the database holds one card per
// day and one subtask per post (migration 20260924120000), and the second
// insert's unique violation is read as "another run made it", not an error.

export const SYNC_LABEL = "content sync";
// Yesterday (a late post still closes its day) through the coming week (the
// writer drafts a day ahead, so tomorrow's posts appear during today).
export const DAYS_BACK = 1;
export const DAYS_AHEAD = 7;

type DayCard = { id: string; status: string; archived_at: string | null; metadata: Record<string, unknown> | null };
type Subtask = { id: string; parent_task_id: string; title: string; status: string; archived_at: string | null; subject_id: string };

export type DaySyncResult = { cardsCreated: number; subtasksWritten: number; moved: number; tidied: number; errors: string[] };

const DAY_CARD_COLUMNS = "id, status, archived_at, metadata";

export async function syncContentDays(board: ContentBoard, today: string): Promise<DaySyncResult> {
  const out: DaySyncResult = { cardsCreated: 0, subtasksWritten: 0, moved: 0, tidied: 0, errors: [] };
  const from = addDays(today, -DAYS_BACK);
  const to = addDays(today, DAYS_AHEAD);

  const { data: assetRows, error: assetErr } = await companyOs
    .from("marketing_content")
    .select("id, title, channel, status, publish_date")
    .gte("publish_date", from)
    .lte("publish_date", to)
    .order("publish_date")
    .order("sort_order");
  if (assetErr) return { ...out, errors: [`content: ${assetErr.message}`] };
  const assets = (assetRows ?? []) as SyncAsset[];

  // Every day card on the board, archived ones included: a day a person
  // archived stays archived rather than coming back an hour later.
  const { data: cardRows, error: cardErr } = await selectTasks(DAY_CARD_COLUMNS)
    .eq("board_id", board.id)
    .eq("subject_type", SUBJECT_CONTENT_DAY)
    .is("parent_task_id", null);
  if (cardErr) return { ...out, errors: [`day cards: ${cardErr.message}`] };
  const cards = new Map<string, DayCard>();
  for (const c of (cardRows ?? []) as unknown as DayCard[]) {
    const day = c.metadata?.content_day;
    if (typeof day === "string") cards.set(day, c);
  }

  // Every post's subtask, wherever it sits: a re-dated post's subtask moves to
  // its new day rather than leaving a stale copy on the old one. And every
  // post subtask under a day card in the window, whatever its post, because a
  // post deleted or re-dated out of the window is not in `assets`, and its
  // subtask would otherwise stay frozen on the day it left (tidyLeftovers).
  const assetIds = new Set(assets.map((a) => a.id));
  const windowCardIds = [...cards]
    .filter(([day, c]) => day >= from && day <= to && !c.archived_at)
    .map(([, c]) => c.id);
  const reach = [
    assetIds.size ? `subject_id.in.(${[...assetIds].join(",")})` : null,
    windowCardIds.length ? `parent_task_id.in.(${windowCardIds.join(",")})` : null,
  ].filter((c): c is string => c !== null);
  if (reach.length === 0) return out;
  const { data: subRows, error: subErr } = await selectTasks("id, parent_task_id, title, status, archived_at, subject_id")
    .eq("board_id", board.id)
    .eq("subject_type", SUBJECT_CONTENT_ASSET)
    .or(reach.join(","));
  if (subErr) return { ...out, errors: [`subtasks: ${subErr.message}`] };
  const subs = new Map<string, Subtask>();
  const leftovers: Subtask[] = [];
  for (const s of (subRows ?? []) as unknown as Subtask[]) {
    if (assetIds.has(s.subject_id)) subs.set(s.subject_id, s);
    else if (!s.archived_at) leftovers.push(s);
  }

  const byDay = new Map<string, SyncAsset[]>();
  for (const a of assets) byDay.set(a.publish_date, [...(byDay.get(a.publish_date) ?? []), a]);

  for (const [day, dayAssets] of byDay) {
    let card = cards.get(day);
    if (card?.archived_at) continue;
    const state = contentDayState(dayAssets);

    if (!card) {
      const column = state === "done" ? board.columns.done : state === "not_doing" ? board.columns.notDoing : board.columns.todo;
      const { data, error } = await insertTasks({
        board_id: board.id,
        board_column_id: column,
        title: `Content · ${dayLabel(day)}`,
        status: state,
        priority: "p2",
        assignee_id: board.ownerId,
        due_date: day,
        epic_id: board.epicId,
        subject_type: SUBJECT_CONTENT_DAY,
        metadata: { content_day: day, content_state: state, ...(board.ownerId ? { assigned_at: new Date().toISOString() } : {}) },
        position: await endPosition(board.id, column),
        completed_at: state === "done" ? new Date().toISOString() : null,
      })
        .select(DAY_CARD_COLUMNS)
        .single();
      if (alreadyMade(error)) {
        // Another pass filed this day a moment ago: carry on with its card,
        // which the close-or-reopen step below brings up to date.
        const again = await selectTasks(DAY_CARD_COLUMNS)
          .eq("board_id", board.id)
          .eq("subject_type", SUBJECT_CONTENT_DAY)
          .is("parent_task_id", null)
          .eq("metadata->>content_day", day)
          .maybeSingle();
        if (again.error || !again.data) {
          out.errors.push(`${day}: made by another run but not readable back${again.error ? `: ${again.error.message}` : ""}`);
          continue;
        }
        card = again.data as unknown as DayCard;
        if (card.archived_at) continue;
      } else if (error) {
        out.errors.push(`${day}: ${error.message}`);
        continue;
      } else {
        // Made already in the right column, with its state recorded, so the
        // close-or-reopen step below finds nothing changed.
        card = data as unknown as DayCard;
        out.cardsCreated += 1;
      }
    }

    for (const [i, a] of dayAssets.entries()) {
      const want = subtaskFor(a);
      const have = subs.get(a.id);
      const archivedAt = want.archived ? have?.archived_at ?? new Date().toISOString() : null;
      const completedAt = want.status === "done" ? new Date().toISOString() : null;
      if (!have) {
        const { error } = await insertTasks({
          board_id: board.id,
          parent_task_id: card.id,
          title: want.title,
          status: want.status,
          priority: "p3",
          position: i,
          human_tokens: POST_TOKENS,
          subject_type: SUBJECT_CONTENT_ASSET,
          subject_id: a.id,
          completed_at: completedAt,
          archived_at: archivedAt,
        });
        // A unique violation is another pass filing this post's subtask a
        // moment ago; the next pass reconciles that row like any other, so
        // there is nothing to read back here.
        if (alreadyMade(error)) continue;
        if (error) out.errors.push(`${a.title}: ${error.message}`);
        else out.subtasksWritten += 1;
        continue;
      }
      // A subtask a person closed as Not Doing, or ticked, keeps its own status
      // unless the calendar now says otherwise.
      const status = have.status === "not_doing" && want.status === "open" ? "not_doing" : want.status;
      if (have.parent_task_id === card.id && have.title === want.title && have.status === status && !!have.archived_at === want.archived) continue;
      const { error } = await updateTasks({
        parent_task_id: card.id,
        title: want.title,
        status,
        archived_at: archivedAt,
        ...(have.status !== status ? { completed_at: status === "done" ? completedAt : null } : {}),
      }).eq("id", have.id);
      if (error) out.errors.push(`${a.title}: ${error.message}`);
      else out.subtasksWritten += 1;
    }

    // Close or reopen the day only when the calendar's answer changed.
    if (state === card.metadata?.content_state) continue;
    const target = state === "done" ? board.columns.done : state === "not_doing" ? board.columns.notDoing : board.columns.todo;
    if (card.status !== state) {
      const moved = await landCardAsSystem({ taskId: card.id, toColumnId: target, label: SYNC_LABEL });
      if (!moved.ok) {
        out.errors.push(`${day}: ${moved.error}`);
        continue;
      }
      out.moved += 1;
    }
    const { error } = await updateTasks({ metadata: { ...(card.metadata ?? {}), content_state: state } }).eq("id", card.id);
    if (error) out.errors.push(`${day}: ${error.message}`);
  }

  await tidyLeftovers(leftovers, cards, out);
  return out;
}

/**
 * The subtasks left on a day in the window by a post that is no longer on it.
 * A post that was deleted takes its subtask off the board (archived). A post
 * re-dated outside the window, or undated, moves its subtask to its new day's
 * card when that card exists, and otherwise archives it until its day enters
 * the window: the pass above finds a post's subtask by the post, archived or
 * not, so on that day it un-archives it under the day's card. Either way the
 * subtask leaves the window's day cards, so the next pass does not see it
 * again and nothing moves back and forth hour to hour.
 */
async function tidyLeftovers(leftovers: Subtask[], cards: Map<string, DayCard>, out: DaySyncResult): Promise<void> {
  if (leftovers.length === 0) return;
  const { data, error } = await companyOs
    .from("marketing_content")
    .select("id, publish_date")
    .in("id", leftovers.map((s) => s.subject_id));
  // A failed read must not read as "every one of these posts was deleted".
  if (error) {
    out.errors.push(`posts that left the window: ${error.message}`);
    return;
  }
  const dateOf = new Map(((data ?? []) as { id: string; publish_date: string | null }[]).map((r) => [r.id, r.publish_date]));
  for (const s of leftovers) {
    const date = dateOf.get(s.subject_id);
    const home = date ? cards.get(date) : undefined;
    const patch = home && !home.archived_at ? { parent_task_id: home.id } : { archived_at: new Date().toISOString() };
    const { error: upErr } = await updateTasks(patch).eq("id", s.id);
    if (upErr) out.errors.push(`${s.title}: ${upErr.message}`);
    else out.tidied += 1;
  }
}
