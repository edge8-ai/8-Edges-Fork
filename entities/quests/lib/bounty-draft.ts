// A Bounty drafted by Claude (QS.9; spec 2026-10-20, "Claude", story 54, and
// "Heads"; the approved prototype's Draft board, 2026-10-27). The team
// assistant turns an instruction ("give everyone a quest to watch the launch by
// Friday") into a draft and a link to /team/quests that opens the Summon drawer
// with it filled in. Nothing here writes: no quest, no party row, no message.
// Nobody is called until the person presses Summon in the drawer, which runs
// summonBounty with its own guard and its own checks, so the draft can never
// call anyone the drawer would not.
//
// The link carries no draft. It carries only `draft=<id>`, the id of the
// assistant's draft_bounty call, which the chat already keeps in the asker's own
// conversation history; the page reads that call back from the reader's own
// history through the assistant door (a stranger's id finds nothing) and
// rebuilds the draft from it with draftFromCall. So no personal text, no name
// and no person id is ever in an address, a browser history or a request log.
//
// Who to call is resolved against the Summon drawer's own staff list
// (listStaffPortraits, read by bounty-draft-read.ts), never people at large, so
// a client contact can never be drafted (the PR #2120 lesson). The tool refuses
// a name that matches more than one person, or nobody, with the names it
// matched, for the assistant to ask about.
//
// Pure: the drawer takes the draft's shape and the page's path from here, and
// the one read lives in bounty-draft-read.ts.
import { z } from "zod";
import { addDays, businessDate, dateMs, saigonInstant } from "@/kernel/config/dates";
import { saigonDue } from "./campfires-model";
import { matchingName } from "./name-match";
import type { Portrait } from "./party-picker";
import { BountyNote, BountyTitle, HeadAsk, MAX_HEADS, TOO_MANY_HEADS } from "./quest-rules";

/** Where the Quests page lives; the draft link opens it. */
export const QUESTS_PATH = "/team/quests";

/** The name of the assistant tool whose call a draft link points at. */
export const DRAFT_TOOL = "draft_bounty";

/** A due time of day when the instruction gives none: the drawer's own default. */
const DEFAULT_TIME = "18:00";

/** How much of the person's own words the drawer's banner quotes back. */
const FROM_MAX = 200;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** An Anthropic tool-use id, as the chat keeps it: the only thing a draft link carries. */
const CALL_ID = /^toolu_[A-Za-z0-9_-]{8,80}$/;

/** What the assistant hands the draft tool: its reading of the person's instruction, held to a summon's own limits. */
export const DraftInput = z.object({
  instruction: z.string().trim().max(2000).optional().default(""),
  title: BountyTitle,
  note: BountyNote,
  learning: z.boolean().optional().default(true),
  call: z.union([z.literal("everyone"), z.array(z.string().trim().min(1)).min(1, "Say who to call, or everyone.").max(500)], {
    message: 'Say who to call: "everyone", or a list of names.',
  }),
  heads: z
    .array(z.object({ ask: HeadAsk, date: z.string().trim().min(1, "Give each head a due date."), time: z.string().trim().optional() }))
    .min(1, "A bounty needs at least one head.")
    .max(MAX_HEADS, TOO_MANY_HEADS),
});
type DraftFields = z.infer<typeof DraftInput>;

/** One head as the drawer fills it: the ask and its due date and time in Saigon. Blank date or time means the drawer's default. */
export type DraftHead = { ask: string; date: string; time: string };

/** A draft as the page rebuilds it, for the Summon drawer. */
export type BountyDraft = {
  title: string;
  note: string;
  learning: boolean;
  partyPersonIds: string[];
  heads: DraftHead[];
  /** The person's own words, quoted back in the drawer's banner; empty when the assistant passed none. */
  from: string;
};

/** What the assistant tells the person: the draft, in words, and the link that opens it. */
export type DraftOutcome =
  | {
      ok: true;
      draft: { title: string; note: string | null; learning: boolean; heads: { ask: string; due: string }[]; call: { everyone: number } | { people: string[] } };
      link: string;
    }
  | { ok: false; error: string };

/** A day word ("friday", "fri", "today", "tomorrow") or a YYYY-MM-DD date, as a Saigon date; a weekday is its next one, today included. */
export function resolveDay(word: string, today: string): string | null {
  const w = word.trim().toLowerCase();
  if (DATE.test(w)) return Number.isNaN(dateMs(w)) ? null : w;
  if (w === "today") return today;
  if (w === "tomorrow") return addDays(today, 1);
  const day = WEEKDAYS.findIndex((d) => d === w || d.slice(0, 3) === w);
  if (day < 0) return null;
  const todayIs = new Date(dateMs(today)).getUTCDay();
  return addDays(today, (day - todayIs + 7) % 7);
}

/** The person's words as the banner quotes them, cut with an ellipsis when they run long. */
function quoted(instruction: string): string {
  return instruction.length > FROM_MAX ? `${instruction.slice(0, FROM_MAX - 1).trimEnd()}…` : instruction;
}

/** The link that opens a drafted Bounty: the draft_bounty call's id and nothing else. */
export function draftLink(callId: string): string {
  return `${QUESTS_PATH}?draft=${encodeURIComponent(callId)}`;
}

/** Whether a link's draft reference is a call id at all; anything else is read as no draft, without a read. */
export function isDraftRef(ref: string | null | undefined): ref is string {
  return typeof ref === "string" && CALL_ID.test(ref);
}

/**
 * The draft and its link, from the assistant's reading of an instruction, or
 * the refusal to relay. Pure: `party` is the Summon drawer's staff list,
 * `readerId` the person drafting, who is never called on their own Bounty, and
 * `callId` the id of this draft_bounty call, which the link carries.
 */
export function planDraft(raw: unknown, party: readonly Portrait[], readerId: string, callId: string, now: Date): DraftOutcome {
  const parsed = DraftInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The draft could not be read." };
  const input = parsed.data;
  const today = businessDate(now);
  const callable = party.filter((p) => p.personId !== readerId);

  // Who to call: everyone the drawer lists, or each name resolved to exactly one of them.
  let called: Portrait[];
  if (input.call === "everyone") {
    called = callable;
  } else {
    called = [];
    for (const name of input.call) {
      const found = matchingName(callable, name, (p) => p.name);
      if (found.length === 0) return { ok: false, error: `Nobody on the team who can be called matches "${name}". Ask who they meant.` };
      if (found.length > 1) return { ok: false, error: `"${name}" matches more than one person: ${found.map((p) => p.name).join(", ")}. Ask which one.` };
      if (!called.includes(found[0]!)) called.push(found[0]!);
    }
  }
  if (called.length === 0) return { ok: false, error: "There is nobody to call yet." };

  // Each head's due time, in Saigon, which must be ahead.
  const heads: { ask: string; at: string }[] = [];
  for (const [i, h] of input.heads.entries()) {
    const which = input.heads.length === 1 ? "the head" : `head ${i + 1}`;
    const date = resolveDay(h.date, today);
    if (!date) return { ok: false, error: `The due date for ${which} must be a date (YYYY-MM-DD), a weekday, today or tomorrow.` };
    const time = h.time ? h.time : DEFAULT_TIME;
    if (!TIME.test(time)) return { ok: false, error: `The due time for ${which} must be HH:MM, Saigon time.` };
    const at = saigonInstant(date, time);
    if (!at) return { ok: false, error: `The due date for ${which} is not a real date.` };
    if (Date.parse(at) <= now.getTime()) return { ok: false, error: `The due time for ${which} has already passed. Pick a later one.` };
    heads.push({ ask: h.ask, at });
  }

  return {
    ok: true,
    draft: {
      title: input.title,
      note: input.note || null,
      learning: input.learning,
      heads: heads.map((h) => ({ ask: h.ask, due: saigonDue(h.at) })),
      call: input.call === "everyone" ? { everyone: called.length } : { people: called.map((p) => p.name) },
    },
    link: draftLink(callId),
  };
}

/**
 * The draft the drawer opens with, rebuilt from the draft_bounty call the
 * reader's own history kept, or null when the call cannot be read as one.
 * Lenient where the tool was strict, because the drawer says what is wrong and
 * lets the reader change it: a name that no longer means exactly one person who
 * can be called is left out, a day it cannot read leaves the drawer's default,
 * and a due time already past stays for the drawer to refuse. Only staff the
 * drawer may call are kept, never the reader.
 */
export function draftFromCall(raw: unknown, party: readonly Portrait[], readerId: string, now: Date): BountyDraft | null {
  const parsed = DraftInput.safeParse(raw);
  if (!parsed.success) return null;
  const input: DraftFields = parsed.data;
  const today = businessDate(now);
  const callable = party.filter((p) => p.personId !== readerId);
  const partyPersonIds =
    input.call === "everyone"
      ? callable.map((p) => p.personId)
      : [...new Set(input.call.flatMap((name) => {
          const found = matchingName(callable, name, (p) => p.name);
          return found.length === 1 ? [found[0]!.personId] : [];
        }))];
  return {
    title: input.title,
    note: input.note,
    learning: input.learning,
    partyPersonIds,
    heads: input.heads.map((h) => {
      const date = resolveDay(h.date, today) ?? "";
      const time = h.time && TIME.test(h.time) ? h.time : DEFAULT_TIME;
      return { ask: h.ask, date, time: date ? time : "" };
    }),
    from: quoted(input.instruction),
  };
}
