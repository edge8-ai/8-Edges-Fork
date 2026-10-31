"use server";

// The Quests page's server actions (QS.1; spec 2026-10-20, "Heads", "Access").
// Each opens with the page's own atom, quests.mine, then reads who is asking
// from the team guard. Every Standing change is decided by standing.decide
// (and a head's or a quest's close by closeHead, closesQuest and withdraw);
// these functions only read the rows the decision needs and apply what it
// returns. A row is updated only while it still holds the Standing the
// decision was made on, so two answers racing on one row cannot both land.
//
// Once a write has landed, the action states it on the bus (QS.2, announce.ts):
// quest.called, quest.turned_in, quest.reacted and quest.closed. The inbox
// listens; a fact that could not be stated is logged and never undoes the
// write. The clock that closes a head at its due time is a routine
// (crons/quest-clock.ts).
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import type { Result } from "@/kernel/data/result";
import { announce, giverName } from "./announce";
import { staffIds } from "./party-picker";
import { Id, Line, Note, SummonInput, TurnInInput, isRequiredGiver, parseError, partyRows, planBounty, readOrRefuse } from "./quest-rules";
import { HEAD_COLUMNS, PARTY_COLUMNS, QUEST_COLUMNS, type HeadRow, type PartyDbRow, type QuestRow } from "./rows";
import { selectQuestParty, selectQuestReactions, selectQuestHeads, selectQuests } from "./reads";
import { insertQuestParty, insertQuestReactions, insertQuestHeads, insertQuests, updateQuestParty, updateQuestHeads, updateQuests } from "./writes";
import {
  closeHead,
  closesQuest,
  decide,
  withdraw,
  type Decision,
  type HeadFacts,
  type PartyPatch,
  type PartyRow,
  type QuestFacts,
} from "./standing";

const PATH = "/team/quests";
const NOT_FOUND = "That quest was not found.";
const READ_FAILED = "Could not read that quest. Try again.";
const WRITE_FAILED = "Could not save that. Try again.";
const RACED = "That changed while you were answering. Refresh and try again.";

type Loaded = { quest: QuestRow; facts: QuestFacts; heads: HeadRow[] };

function headFacts(h: HeadRow): HeadFacts {
  return { closesAt: h.closes_at, closedAt: h.closed_at };
}

function partyRow(r: PartyDbRow, reacted = false): PartyRow {
  return {
    personId: r.person_id,
    headId: r.head_id,
    standing: r.standing,
    late: r.late,
    reacted,
    acceptedAt: r.accepted_at,
    turnedInAt: r.turned_in_at,
    handedBackAt: r.handed_back_at,
    missedAt: r.missed_at,
  };
}

/** The quest and its heads, or null when there is no such quest. A failed read raises. */
async function loadQuest(questId: string, withGiverName = false): Promise<Loaded | null> {
  const [questRes, headRes] = await Promise.all([
    selectQuests(QUEST_COLUMNS).eq("id", questId).limit(1),
    selectQuestHeads(HEAD_COLUMNS).eq("quest_id", questId).order("position"),
  ]);
  const quest = (mustRows(questRes, "[quests/actions] quest") as unknown as QuestRow[])[0];
  if (!quest) return null;
  const heads = mustRows(headRes, "[quests/actions] quest_heads") as unknown as HeadRow[];
  const giverName = withGiverName ? (await peopleOnRecord([quest.giver_id])).get(quest.giver_id)?.name : undefined;
  return { quest, heads, facts: { kind: quest.kind, state: quest.state, giverId: quest.giver_id, required: quest.required, giverName } };
}

/** Party rows on a quest, all of them or one person's. A failed read raises. */
async function loadRows(questId: string, personId?: string): Promise<PartyDbRow[]> {
  const q = selectQuestParty(PARTY_COLUMNS).eq("quest_id", questId);
  return mustRows(await (personId ? q.eq("person_id", personId) : q), "[quests/actions] quest_party") as unknown as PartyDbRow[];
}

/**
 * Applies one row's patch, only while the row still holds the Standing the
 * decision read. Returns null when it landed, or the error to hand back.
 */
async function applyParty(row: PartyDbRow, patch: PartyPatch): Promise<string | null> {
  const { data, error } = await updateQuestParty(patch).eq("id", row.id).eq("standing", row.standing).select("id");
  if (error) {
    console.error("[quests/actions] quest_party update", error.message);
    return WRITE_FAILED;
  }
  return (data ?? []).length === 0 ? RACED : null;
}

/** A decision's refusal as a Result, or null when it wrote or kept. */
function refusal(d: Decision): Result | null {
  return "refuse" in d ? { ok: false, error: d.refuse } : null;
}

/** Runs a read-then-write body, turning a failed read into a Result rather than a thrown page error. */
function guarded(body: () => Promise<Result>): Promise<Result> {
  return readOrRefuse(body, READ_FAILED, "[quests/actions]");
}

/** The input summonBounty takes, as the drawer sends it. */
export type SummonBountyInput = {
  title: string;
  ask?: string;
  learning: boolean;
  partyPersonIds: string[];
  heads: { ask: string; closesAt: string }[];
};

/**
 * Posts a Bounty: the quest, its heads in order, and one party row per person
 * per head. It is required when the Giver is a manager or an admin now, and
 * then every row starts accepted; otherwise every row starts called. It
 * refuses an empty party, anyone not on the team, no heads, an empty ask on a
 * head, or a due time in the past.
 */
export async function summonBounty(input: SummonBountyInput): Promise<Result & { questId?: string }> {
  const access = await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = SummonInput.safeParse(input);
  if (!parsed.success) return parseError(parsed.error.issues);
  const now = new Date();
  let staff: Set<string>;
  try {
    staff = await staffIds();
  } catch (e) {
    console.error("[quests/actions] staff", e instanceof Error ? e.message : e);
    return { ok: false, error: "Could not read the team. Try again." };
  }
  const planned = planBounty(parsed.data, actor.personId, isRequiredGiver(access.roles), staff, now);
  if (!planned.ok) return planned;
  const { plan } = planned;

  const { data: questData, error: questError } = await insertQuests(plan.quest).select("id").single();
  if (questError || !questData) {
    console.error("[quests/actions] quests insert", questError?.message);
    return { ok: false, error: WRITE_FAILED };
  }
  const questId = (questData as { id: string }).id;

  // The three inserts are not one transaction. Nothing here is ever deleted,
  // so a summon that fails after the quest row exists withdraws it, which
  // keeps it off the board and leaves nobody Missed.
  const abandon = async (what: string, message: string | undefined): Promise<Result> => {
    console.error(`[quests/actions] ${what}`, message);
    const { error } = await updateQuests({ state: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", questId);
    if (error) console.error("[quests/actions] withdraw after a failed summon", error.message);
    return { ok: false, error: WRITE_FAILED };
  };
  const { data: headData, error: headError } = await insertQuestHeads(plan.heads.map((h) => ({ ...h, quest_id: questId }))).select("id, position");
  if (headError || !headData) return abandon("quest_heads insert", headError?.message);
  const headIds = (headData as { id: string; position: number }[]).sort((a, b) => a.position - b.position).map((h) => h.id);
  const { error: partyError } = await insertQuestParty(partyRows(questId, headIds, plan.personIds, plan.quest.required, now));
  if (partyError) return abandon("quest_party insert", partyError.message);

  const heads = plan.heads.map((h, i) => ({ headId: headIds[i], ask: h.ask, closesAt: h.closes_at }));
  await announce("quest.called", { questId, title: plan.quest.title, giverId: actor.personId, giverName: await giverName(actor.personId), required: plan.quest.required, personIds: plan.personIds, heads });
  revalidatePath(PATH);
  return { ok: true, questId };
}

/**
 * Accepts every open head the reader is on. On a required Bounty there is
 * nothing to do, because being called is the commitment.
 */
export async function acceptQuest(questId: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const qid = Id.safeParse(questId);
  if (!qid.success) return parseError(qid.error.issues);
  return guarded(async () => {
    const loaded = await loadQuest(qid.data);
    if (!loaded) return { ok: false, error: NOT_FOUND };
    const rows = await loadRows(qid.data, actor.personId);
    if (rows.length === 0) return { ok: false, error: NOT_FOUND };
    const now = new Date();
    let firstRefusal: Result | null = null;
    let wrote = false;
    for (const row of rows) {
      const head = loaded.heads.find((h) => h.id === row.head_id);
      if (!head) continue;
      const d = decide(partyRow(row), loaded.facts, headFacts(head), { partyMember: actor.personId }, { say: "accept" }, now);
      firstRefusal ??= refusal(d);
      if ("write" in d && d.write.party) {
        const failed = await applyParty(row, d.write.party);
        if (failed) return { ok: false, error: failed };
        wrote = true;
      }
    }
    if (!wrote && firstRefusal) return firstRefusal;
    if (wrote) revalidatePath(PATH);
    return { ok: true };
  });
}

/** One party row of the reader's own, or of someone else on a head, with the quest and the head. */
async function loadOnHead(questId: string, headId: string, personId: string, withGiverName = false) {
  const loaded = await loadQuest(questId, withGiverName);
  if (!loaded) return null;
  const head = loaded.heads.find((h) => h.id === headId);
  if (!head) return null;
  const row = (await loadRows(questId, personId)).find((r) => r.head_id === headId);
  return row ? { ...loaded, head, row } : null;
}

/** Turns in on one head. A Turn-in after the head's due time is late and counts in full. */
export async function turnIn(questId: string, headId: string, input: { text: string; url?: string; toLore?: boolean }): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const ids = Id.safeParse(questId);
  const step = Id.safeParse(headId);
  const parsed = TurnInInput.safeParse(input);
  if (!ids.success) return parseError(ids.error.issues);
  if (!step.success) return parseError(step.error.issues);
  if (!parsed.success) return parseError(parsed.error.issues);
  return guarded(async () => {
    const found = await loadOnHead(ids.data, step.data, actor.personId);
    if (!found) return { ok: false, error: NOT_FOUND };
    const d = decide(partyRow(found.row), found.facts, headFacts(found.head), { partyMember: actor.personId }, { say: "turn_in", text: parsed.data.text, url: parsed.data.url }, new Date());
    const refused = refusal(d);
    if (refused) return refused;
    if ("write" in d && d.write.party) {
      const failed = await applyParty(found.row, d.write.party);
      if (failed) return { ok: false, error: failed };
      await announce("quest.turned_in", { questId: found.quest.id, headId: found.head.id, personId: actor.personId, giverId: found.facts.giverId, late: d.write.party.late === true });
      revalidatePath(PATH);
    }
    return { ok: true };
  });
}

/** Hands one head back: declining an optional Bounty, note optional. A required Bounty refuses. */
export async function handBack(questId: string, headId: string, note: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const ids = Id.safeParse(questId);
  const step = Id.safeParse(headId);
  const parsed = Note.safeParse(note);
  if (!ids.success) return parseError(ids.error.issues);
  if (!step.success) return parseError(step.error.issues);
  if (!parsed.success) return parseError(parsed.error.issues);
  return guarded(async () => {
    const found = await loadOnHead(ids.data, step.data, actor.personId, true);
    if (!found) return { ok: false, error: NOT_FOUND };
    const d = decide(partyRow(found.row), found.facts, headFacts(found.head), { partyMember: actor.personId }, { say: "hand_back", note: parsed.data }, new Date());
    const refused = refusal(d);
    if (refused) return refused;
    if ("write" in d && d.write.party) {
      const failed = await applyParty(found.row, d.write.party);
      if (failed) return { ok: false, error: failed };
      revalidatePath(PATH);
    }
    return { ok: true };
  });
}

/** The Giver's Reaction to one person's Turn-in on one head. At most one per Turn-in. */
export async function reactToTurnIn(questId: string, headId: string, personId: string, line: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const ids = Id.safeParse(questId);
  const step = Id.safeParse(headId);
  const person = Id.safeParse(personId);
  const parsed = Line.safeParse(line);
  if (!ids.success) return parseError(ids.error.issues);
  if (!step.success) return parseError(step.error.issues);
  if (!person.success) return parseError(person.error.issues);
  if (!parsed.success) return parseError(parsed.error.issues);
  return guarded(async () => {
    const found = await loadOnHead(ids.data, step.data, person.data);
    if (!found) return { ok: false, error: NOT_FOUND };
    const reactions = mustRows(await selectQuestReactions("party_id").eq("party_id", found.row.id), "[quests/actions] quest_reactions");
    const d = decide(partyRow(found.row, reactions.length > 0), found.facts, headFacts(found.head), { giver: actor.personId }, { say: "react", line: parsed.data }, new Date());
    const refused = refusal(d);
    if (refused) return refused;
    if ("write" in d && d.write.reaction) {
      const { error } = await insertQuestReactions({ quest_id: found.quest.id, party_id: found.row.id, line: d.write.reaction.line });
      // The unique on party_id is the last word on "once per Turn-in"; the
      // composite foreign key refuses a row that has left turned_in.
      if (error?.code === "23505") return { ok: false, error: "You reacted to this Turn-in already." };
      if (error?.code === "23503") return { ok: false, error: RACED };
      if (error) {
        console.error("[quests/actions] quest_reactions insert", error.message);
        return { ok: false, error: WRITE_FAILED };
      }
      const reacted = { questId: found.quest.id, headId: found.head.id, personId: person.data, giverId: actor.personId, title: found.quest.title, line: d.write.reaction.line };
      await announce("quest.reacted", { ...reacted, giverName: await giverName(actor.personId) });
      revalidatePath(PATH);
    }
    return { ok: true };
  });
}

/**
 * The Giver closes the quest now: every open head closes, every row still out
 * that owes a Missed gets one (on an optional Bounty, only rows that
 * accepted), and the quest closes with its last head.
 */
export async function closeQuest(questId: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const qid = Id.safeParse(questId);
  if (!qid.success) return parseError(qid.error.issues);
  return guarded(async () => {
    const loaded = await loadQuest(qid.data);
    if (!loaded) return { ok: false, error: NOT_FOUND };
    const now = new Date();
    const giver = { giver: actor.personId };
    // Decide everything before writing anything, so a refusal writes nothing.
    const headCloses = loaded.heads.map((h) => ({ head: h, d: closeHead(loaded.facts, headFacts(h), giver, now) }));
    for (const { d } of headCloses) {
      const refused = refusal(d);
      if (refused) return refused;
    }
    if (loaded.heads.length === 0 && loaded.facts.giverId !== actor.personId) return { ok: false, error: "Only the quest's Giver may do that." };
    const rows = await loadRows(qid.data);
    const rowCloses: { row: PartyDbRow; d: Decision }[] = [];
    for (const row of rows) {
      const head = loaded.heads.find((h) => h.id === row.head_id);
      if (!head) continue;
      const d = decide(partyRow(row), loaded.facts, headFacts(head), giver, { say: "close" }, now);
      const refused = refusal(d);
      if (refused) return refused;
      rowCloses.push({ row, d });
    }
    // Rows first, then heads, then the quest: a close that fails part way is
    // finished by closing again, because each step keeps what is already done.
    for (const { row, d } of rowCloses) {
      if ("write" in d && d.write.party) {
        const failed = await applyParty(row, d.write.party);
        if (failed && failed !== RACED) return { ok: false, error: failed };
      }
    }
    for (const { head, d } of headCloses) {
      if ("write" in d && d.write.head) {
        const { error } = await updateQuestHeads(d.write.head).eq("id", head.id).is("closed_at", null);
        if (error) {
          console.error("[quests/actions] quest_heads close", error.message);
          return { ok: false, error: WRITE_FAILED };
        }
      }
    }
    const closedHeads = loaded.heads.map((h) => ({ closesAt: h.closes_at, closedAt: h.closed_at ?? now.toISOString() }));
    const questPatch = closesQuest(loaded.facts, closedHeads, now);
    if (questPatch) {
      const { data, error } = await updateQuests(questPatch).eq("id", loaded.quest.id).eq("state", "open").select("id");
      if (error) {
        console.error("[quests/actions] quests close", error.message);
        return { ok: false, error: WRITE_FAILED };
      }
      // Only the write that moved the quest from open states the close, so a second close says nothing.
      if ((data ?? []).length > 0) await announce("quest.closed", { questId: loaded.quest.id, giverId: actor.personId, by: "giver" });
    }
    revalidatePath(PATH);
    return { ok: true };
  });
}

/** The Giver withdraws the quest: every Standing stays, nobody is Missed. Refused once any due time has passed. */
export async function withdrawQuest(questId: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const qid = Id.safeParse(questId);
  if (!qid.success) return parseError(qid.error.issues);
  return guarded(async () => {
    const loaded = await loadQuest(qid.data);
    if (!loaded) return { ok: false, error: NOT_FOUND };
    const d = withdraw(loaded.facts, loaded.heads.map(headFacts), actor.personId, new Date());
    const refused = refusal(d);
    if (refused) return refused;
    if ("write" in d && d.write.quest) {
      const { data, error } = await updateQuests(d.write.quest).eq("id", loaded.quest.id).eq("state", "open").select("id");
      if (error) {
        console.error("[quests/actions] quests withdraw", error.message);
        return { ok: false, error: WRITE_FAILED };
      }
      if ((data ?? []).length === 0) return { ok: false, error: RACED };
      revalidatePath(PATH);
    }
    return { ok: true };
  });
}
