// The pure half of the quests actions (QS.1): what each action accepts at its
// boundary, and how a summon becomes rows. Kept apart from quest-actions.ts,
// whose "use server" file may export only async functions, so these are
// tested without a database or a session.
import { z } from "zod";
import { businessDate } from "@/kernel/config/dates";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { HeadInsert, PartyInsert, QuestInsert } from "./rows";

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

/** A Bounty's own fields, as a summon accepts them; Claude's draft (QS.9) is held to the same. */
export const BountyTitle = z.string().trim().min(1, "Give the bounty a title.").max(200, "Keep the title under 200 characters.");
export const BountyNote = z.string().trim().max(4000, "Keep the note under 4,000 characters.").optional().default("");
export const HeadAsk = z.string().trim().min(1, "Every head needs an ask.").max(2000, "Keep each ask under 2,000 characters.");
/** How many heads a Bounty may have. */
export const MAX_HEADS = 12;
export const TOO_MANY_HEADS = "A bounty has at most twelve heads.";

export const SummonInput = z.object({
  title: BountyTitle,
  ask: BountyNote,
  learning: z.boolean(),
  // AK.3: lets a manager or admin post an optional ask. It only lowers (see isRequiredGiver).
  optional: z.boolean().optional(),
  partyPersonIds: z.array(id).min(1, "Ask at least one person.").max(500),
  heads: z
    .array(
      z.object({
        ask: HeadAsk,
        closesAt: dueTime,
      }),
    )
    .min(1, "A bounty needs at least one head.")
    .max(MAX_HEADS, TOO_MANY_HEADS),
});

export type SummonInput = z.infer<typeof SummonInput>;

export const TurnInInput = z.object({
  text: z.string().max(8000, "Keep the answer under 8,000 characters.").default(""),
  url: z.string().trim().max(2000).optional(),
  // A learning bounty's Turn-in becomes a Discovery unless its author keeps it
  // out. The Lore ships in QS.4; until then the choice is accepted and unused.
  toLore: z.boolean().optional(),
});

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
  if (personIds.length === 0) return { ok: false, error: "Ask at least one person." };
  if (personIds.some((p) => !staff.has(p))) return { ok: false, error: "Only people on the team can be asked." };
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
 * kernel's access model, the same holdings every guard reads. A manager or
 * admin may post an optional ask instead (AK.3; spec 2026-11-16, "Required
 * versus optional"): `optional` only ever lowers the result, so it can never
 * make a peer's ask required.
 */
export function isRequiredGiver(roles: readonly { role: string }[], optional?: boolean): boolean {
  return optional !== true && roles.some((r) => r.role === "admin" || r.role === "manager");
}
