// The pure half of the quests actions (QS.1): what each action accepts at its
// boundary, and how a summon becomes rows. Kept apart from quest-actions.ts,
// whose "use server" file may export only async functions, so these are
// tested without a database or a session.
import { z } from "zod";
import { businessDate } from "@/kernel/config/dates";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { BEACON_BAD_LINK, BEACON_NO_LINK, BEACON_NO_TITLE, safeLink } from "./lighthouse-model";
import type { BeaconHeadInsert, BeaconInsert, BeaconPartyInsert, HeadInsert, PartyInsert, QuestInsert, RaidInsert } from "./rows";

const id = z.string().trim().min(1, "Missing id.");

/** An instant: any timestamp Date can read, with its offset, normalised to UTC ISO. */
const instant = (message: string) =>
  z
    .string()
    .trim()
    .refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s)), message)
    .transform((s) => new Date(s).toISOString());

/** A head's due time. */
const dueTime = instant("Give each head a due time.");

export const SummonInput = z.object({
  title: z.string().trim().min(1, "Give the bounty a title.").max(200, "Keep the title under 200 characters."),
  ask: z.string().trim().max(4000, "Keep the note under 4,000 characters.").optional().default(""),
  learning: z.boolean(),
  partyPersonIds: z.array(id).min(1, "Call at least one person.").max(500),
  heads: z
    .array(
      z.object({
        ask: z.string().trim().min(1, "Every head needs an ask.").max(2000, "Keep each ask under 2,000 characters."),
        closesAt: dueTime,
      }),
    )
    .min(1, "A bounty needs at least one head.")
    .max(12, "A bounty has at most twelve heads."),
});
export type SummonInput = z.infer<typeof SummonInput>;

export const TurnInInput = z.object({
  text: z.string().max(8000, "Keep the Turn-in under 8,000 characters.").default(""),
  url: z.string().trim().max(2000).optional(),
  // A learning bounty's Turn-in becomes a Discovery unless its author keeps it
  // out. The Lore ships in QS.4; until then the choice is accepted and unused.
  toLore: z.boolean().optional(),
});

/**
 * The Lore composer's line (QS.4). Here it is only text of a sane length; what
 * makes a valid spark line (one line, at most 200 characters) is Spark's rule,
 * which the Ideas door applies when it posts.
 */
export const LearningLine = z.string().max(2000, "Keep a learning to one line, under 200 characters.");

/** Will try on a learning (QS.4): which learning, and whether it is said or taken back. */
export const WillTryInput = z.object({ ideaId: id, on: z.boolean() });

/**
 * A topic someone wants to learn (QS.5): the words as typed, trimmed, never
 * blank, and short enough to be a fire's title. Matching it to a topic already
 * wanted is the database's (quest_hands.topic_key), not this schema's.
 */
export const Topic = z.string().trim().min(1, "Name what you want to learn.").max(120, "Keep the topic under 120 characters.");

/** A wanted topic as the page names it back: its key, exactly as the read returned it. */
export const TopicKey = z.string().min(1, "Missing topic.").max(200);

/** Light it (QS.5): which wanted topic, and when its twenty minutes start, as an instant with its offset. */
export const LightInput = z.object({ topicKey: TopicKey, startsAt: instant("Pick a date and a time.") });

/**
 * Lighting a Beacon (QS.6; spec "Lighthouses"): what was put out, the link to
 * it, and the held fire it grew from when it was lit from one. Title first, so
 * a form missing both says what to fill in first.
 */
export const BeaconInput = z.object({
  title: z.string().trim().min(1, BEACON_NO_TITLE).max(200, "Keep it under 200 characters."),
  url: z
    .string()
    .trim()
    .min(1, BEACON_NO_LINK)
    .max(2000, "Keep the link under 2,000 characters.")
    .refine((u) => safeLink(u) !== null, BEACON_BAD_LINK),
  originQuestId: id.nullish(),
});
export type BeaconInput = z.infer<typeof BeaconInput>;

/** The first thing wrong with a form, in the form's own words, without the field's name in front of it. */
export function formRefusal(issues: readonly { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Invalid input." };
}

export const Note = z.string().max(2000, "Keep the note under 2,000 characters.").default("");
export const Line = z.string().max(500, "Keep the line under 500 characters.");
export const Id = id;

/**
 * Runs an action's read-then-write body, turning a failed read (a raise from
 * mustRows) into a refusal the page can show, rather than a thrown page error.
 */
export async function readOrRefuse<T extends { ok: boolean }>(body: () => Promise<T>, readFailed: string, tag: string): Promise<T | { ok: false; error: string }> {
  try {
    return await body();
  } catch (e) {
    console.error(tag, e instanceof Error ? e.message : e);
    return { ok: false, error: readFailed };
  }
}

/** The one-line error a failed parse returns from an action. */
export function parseError(issues: readonly { path: readonly PropertyKey[]; message: string }[]): { ok: false; error: string } {
  return { ok: false, error: zodIssuesToMessage(issues) };
}

/** What a summon writes before it has ids: the quest row and its heads in order. */
export type BountyPlan = { quest: QuestInsert; heads: Omit<HeadInsert, "quest_id">[]; personIds: string[] };

/**
 * Turns a parsed summon into rows, or refuses it. A due time must be in the
 * future. The party is de-duplicated, and every id must be staff (the
 * caller passes the team's ids, from the same list the picker shows).
 * closing_date is the latest head's Saigon date, so readers of the first
 * expand still find one (the heads migration says why).
 */
export function planBounty(
  input: SummonInput,
  giverId: string,
  required: boolean,
  staff: ReadonlySet<string>,
  now: Date,
): { ok: true; plan: BountyPlan } | { ok: false; error: string } {
  const personIds = [...new Set(input.partyPersonIds)];
  if (personIds.length === 0) return { ok: false, error: "Call at least one person." };
  if (personIds.some((p) => !staff.has(p))) return { ok: false, error: "Only people on the team can be called on a quest." };
  if (input.heads.length === 0) return { ok: false, error: "A bounty needs at least one head." };
  if (input.heads.some((h) => Date.parse(h.closesAt) <= now.getTime())) return { ok: false, error: "Every due time must be in the future." };
  const latest = input.heads.reduce((max, h) => (h.closesAt > max ? h.closesAt : max), input.heads[0].closesAt);
  return {
    ok: true,
    plan: {
      quest: { kind: "bounty", title: input.title, ask: input.ask, giver_id: giverId, closing_date: businessDate(latest), learning: input.learning, required },
      heads: input.heads.map((h, i) => ({ position: i + 1, ask: h.ask, closes_at: h.closesAt })),
      personIds,
    },
  };
}

/**
 * The Raid a lit fire writes (QS.5): open-ended, titled with the topic's
 * words, with the person who lit it as its Giver and its Host and the Training
 * session it is. Evolve (QS.7) lights one from a learning and records it.
 */
export function planRaid(title: string, hostId: string, trainingId: string, originIdeaId: string | null = null): RaidInsert {
  return { kind: "raid", title, ask: "", giver_id: hostId, host_id: hostId, training_id: trainingId, origin_idea_id: originIdeaId, learning: false, required: false };
}

/** A Beacon's one head asks what every Beacon asks. */
export const BEACON_HEAD_ASK = "Light it with a link to the public thing.";

/** The held fire a Beacon grew from, and the learning that fire grew from when it did. */
export type BeaconOrigin = { questId: string; ideaId: string | null };

/** What lighting a Beacon writes before it has ids: the quest, its head, and the author's own row once both exist. */
export type BeaconPlan = {
  quest: BeaconInsert;
  head: (questId: string) => BeaconHeadInsert;
  party: (questId: string, headId: string) => BeaconPartyInsert;
};

/**
 * A Beacon lit by its author (QS.6; the ladders spec's witness rule): the
 * quest with the reader as Giver and the link as lit_url, written closed
 * because the act is done; its one head, closed at the same instant; and the
 * reader's own party row turned in with the same link. Both columns hold the
 * one link, so the banner counts the Beacon from the quest and the ladders
 * credit the person from the row. The columns are these and no others: no
 * view, like or reach is ever stored.
 */
export function planBeacon(input: Pick<BeaconInput, "title" | "url">, authorId: string, origin: BeaconOrigin | null, now: Date): BeaconPlan {
  const at = now.toISOString();
  return {
    quest: {
      kind: "beacon",
      title: input.title,
      ask: "",
      giver_id: authorId,
      lit_url: input.url,
      origin_quest_id: origin?.questId ?? null,
      origin_idea_id: origin?.ideaId ?? null,
      state: "closed",
      closed_at: at,
      learning: false,
      required: false,
    },
    head: (questId) => ({ quest_id: questId, position: 1, ask: BEACON_HEAD_ASK, closes_at: at, closed_at: at }),
    party: (questId, headId) => ({ quest_id: questId, head_id: headId, person_id: authorId, standing: "turned_in", accepted_at: at, turned_in_at: at, late: false, turn_in_url: input.url }),
  };
}

/**
 * One party row per person per head. On a required Bounty being called is the
 * commitment, so every row starts accepted; on an optional one it starts
 * called, and a person opts in by accepting.
 */
export function partyRows(questId: string, headIds: readonly string[], personIds: readonly string[], required: boolean, now: Date): PartyInsert[] {
  const at = now.toISOString();
  return headIds.flatMap((headId) =>
    personIds.map((personId) => ({
      quest_id: questId,
      head_id: headId,
      person_id: personId,
      standing: required ? ("accepted" as const) : ("called" as const),
      accepted_at: required ? at : null,
    })),
  );
}

/**
 * Whether a Giver's Bounty is required: they are a manager (someone with a
 * direct report) or an admin when they summon it. The roles come from the
 * kernel's access model, the same holdings every guard reads.
 */
export function isRequiredGiver(roles: readonly { role: string }[]): boolean {
  return roles.some((r) => r.role === "admin" || r.role === "manager");
}
