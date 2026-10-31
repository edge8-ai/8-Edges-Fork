import { addDays } from "@/kernel/config/dates";
import { bearCard, cardsOfSubjectsOnBoard, dayLabel, editSyncedCard, landCardAsSystem } from "@/entities/boards";
import { companyOs } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import type { ContentBoard } from "./board";
import {
  SUBJECT_CAMPAIGN,
  alreadyMade,
  campaignCardState,
  campaignDetails,
  followIfOurs,
  previousWriterNote,
  writerDescription,
  writerNote,
  type AgentState,
  type SyncAsset,
  type SyncCampaign,
} from "./rules";
import { SYNC_ACTOR, SYNC_LABEL } from "./sync-days";

// A card per campaign on the Revenue board (Khoa, 2026-10-30): made within the
// hour a campaign is created, titled with the campaign's name, due on its
// publish date (starts_on, the day its blog and first post go out), and opening
// with the campaign's details. It is marked as agent work (metadata.source =
// "agent", the board's Agent chip) because the writer agent does the drafting,
// and its column says where the campaign is: Done once every post is out
// (rules.ts, campaignCardState). A stuck writer waits on a person, so its card
// goes to Waiting, assigned to the board's owner, with the error appended to
// its description; that is what the twice-daily nag chases.
//
// Until 2026-10-30 this was the writer's card: titled "Writer: <name>", made
// only once the campaign was a week from starting, and Done when the writer
// finished drafting. Its cards are renamed by the rule below.
//
// As with the day cards, the card moves only when the campaign's state changes
// (metadata.agent_state), so a person's drag is never undone by the next pass.
// The title, the deadline and the description are shared the same way: the
// sync changes the title and deadline only while they read as it last wrote
// them (metadata.campaign_title, metadata.campaign_due), writes the details
// once, when the card is made, and after that touches only its own note on a
// stuck writer (rules.ts, writerDescription), with the error it last reported
// kept in metadata.writer_error so the next pass knows which note is its own.

// Every campaign from a week ago on, however far off it publishes, so a card
// exists from the hour the campaign does, and the week that just finished
// keeps closing as its posts go out. A campaign with no date yet is asked for
// while it is new, and its card waits for the date like any deadline.
const LOOKBACK_DAYS = 7;

type CampaignCard = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  archived_at: string | null;
  subject_id: string;
  description: string | null;
  metadata: { [key: string]: Json | undefined } | null;
};
type CampaignRow = SyncCampaign & {
  updated_at: string;
  idea: string | null;
  objective: string | null;
  brands: { name: string } | { name: string }[] | null;
};

export type AgentSyncResult = { created: number; moved: number; refreshed: number; errors: string[] };

function columnFor(board: ContentBoard, s: AgentState): string {
  const c = board.columns;
  return s === "done" ? c.done : s === "not_doing" ? c.notDoing : s === "stuck" ? c.waiting : s === "working" ? c.doing : c.todo;
}

/**
 * Brings the campaigns' cards up to date. `origin` is the App's origin for the
 * campaign link in a new card's details; empty, the link is the path alone.
 */
export async function syncAgentCards(board: ContentBoard, today: string, origin = ""): Promise<AgentSyncResult> {
  const out: AgentSyncResult = { created: 0, moved: 0, refreshed: 0, errors: [] };
  const since = addDays(today, -LOOKBACK_DAYS);
  const { data: campRows, error: campErr } = await companyOs
    .from("marketing_campaigns")
    .select("id, name, status, starts_on, writer_step, writer_error, updated_at, idea, objective, brands(name)")
    .or(`starts_on.gte.${since},and(starts_on.is.null,created_at.gte.${since})`)
    .in("status", ["active", "done", "archived"]);
  if (campErr) return { ...out, errors: [`campaigns: ${campErr.message}`] };
  const campaigns = (campRows ?? []) as unknown as CampaignRow[];
  if (campaigns.length === 0) return out;
  const ids = campaigns.map((c) => c.id);

  // The posts decide when a campaign is done, so a failed read must not read
  // as "no posts": that would close every finished campaign's card.
  const { data: postRows, error: postErr } = await companyOs.from("marketing_content").select("campaign_id, status").in("campaign_id", ids);
  if (postErr) return { ...out, errors: [`campaign posts: ${postErr.message}`] };
  const postsOf = new Map<string, Pick<SyncAsset, "status">[]>();
  for (const p of (postRows ?? []) as { campaign_id: string; status: SyncAsset["status"] }[]) {
    postsOf.set(p.campaign_id, [...(postsOf.get(p.campaign_id) ?? []), p]);
  }

  const { data: cardRows, error: cardErr } = await cardsOfSubjectsOnBoard(board.id, SUBJECT_CAMPAIGN, ids);
  if (cardErr) return { ...out, errors: [`campaign cards: ${cardErr.message}`] };
  const cards = new Map(((cardRows ?? []) as unknown as CampaignCard[]).map((c) => [c.subject_id, c]));

  for (const c of campaigns) {
    const state = campaignCardState(c, postsOf.get(c.id) ?? []);
    const card = cards.get(c.id);
    if (card?.archived_at) continue;
    const stuck = state === "stuck";
    const writerError = stuck ? c.writer_error : null;

    if (!card) {
      const brand = Array.isArray(c.brands) ? c.brands[0] : c.brands;
      const details = campaignDetails(
        { starts_on: c.starts_on, brand: brand?.name ?? null, objective: c.objective, idea: c.idea },
        `${origin}/admin/revenue/marketing/campaigns/${c.id}/`,
        dayLabel,
      );
      const born = await bearCard({
        card: {
          board_id: board.id,
          board_column_id: columnFor(board, state),
          title: c.name,
          description: writerDescription(details, null, writerNote(writerError)),
          priority: stuck ? "p1" : "p3",
          assignee_id: stuck ? board.ownerId : null,
          due_date: c.starts_on,
          epic_id: board.epicId,
          subject_type: SUBJECT_CAMPAIGN,
          subject_id: c.id,
          metadata: { source: "agent", agent_state: state, writer_error: writerError, campaign_title: c.name, campaign_due: c.starts_on },
        },
        actor: SYNC_ACTOR,
        // A campaign already finished is dated by when it finished, so a first
        // pass does not date last week's work as closed today.
        completedAt: c.updated_at,
      });
      // A unique violation is another pass filing this campaign's card a
      // moment ago; the next pass moves that card like any other.
      if (!born.ok && !("persisted" in born) && alreadyMade(born)) continue;
      if (!born.ok) out.errors.push(`${c.name}: ${born.error}`);
      if (born.ok || "persisted" in born) out.created += 1;
      continue;
    }

    // The campaign was renamed or re-dated, or this card still carries the
    // writer card's title: follow it, unless a person set their own.
    const metadata = { ...(card.metadata ?? {}) };
    const patch: Parameters<typeof editSyncedCard>[1] = {};
    // A writer card recorded neither. Its title was "Writer: <name>"; its
    // deadline was the start date, but nothing says which, so an unrecorded
    // deadline is the sync's only while it still matches the campaign. Either
    // one that already reads right is recorded with the next write, so a
    // person's later change is told apart from it.
    const title = followIfOurs(card.title, card.metadata?.campaign_title, `Writer: ${c.name}`, c.name);
    if (title !== undefined) patch.title = metadata.campaign_title = title;
    else if (metadata.campaign_title === undefined && card.title === c.name) metadata.campaign_title = c.name;
    const due = followIfOurs(card.due_date, card.metadata?.campaign_due, c.starts_on, c.starts_on);
    if (due !== undefined) patch.due_date = metadata.campaign_due = due;
    else if (metadata.campaign_due === undefined && card.due_date === c.starts_on) metadata.campaign_due = c.starts_on;
    const refreshed = Object.keys(patch).length > 0;

    if (card.metadata?.agent_state !== state) {
      // The campaign moved on, so the card follows (a no-op when a person
      // already put it there).
      const moved = await landCardAsSystem({ taskId: card.id, toColumnId: columnFor(board, state), label: SYNC_LABEL });
      if (!moved.ok) {
        out.errors.push(`${c.name}: ${moved.error}`);
        continue;
      }
      out.moved += 1;
      metadata.agent_state = state;
      metadata.writer_error = writerError;
      Object.assign(patch, {
        description: writerDescription(card.description, previousWriterNote(card.metadata, card.description), writerNote(writerError)),
        priority: stuck ? "p1" : "p3",
        ...(stuck ? { assignee_id: board.ownerId } : {}),
      });
    } else if (!refreshed) continue;

    const { error } = await editSyncedCard(card.id, { ...patch, metadata });
    if (error) out.errors.push(`${c.name}: ${error.message}`);
    else if (refreshed) out.refreshed += 1;
  }
  return out;
}
