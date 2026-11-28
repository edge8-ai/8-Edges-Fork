// The New ask drawer's rules (AK.3; spec 2026-11-16, "New ask"; ADR 0036). An
// Ask is a Bounty with one head and learning off, so the drawer's three fields
// become one summonBounty call: the ask is the head (and, on one line, the
// title), Who is the party, and Answer by is the head's due time at the end of
// the Saigon working day. Pure, so the words of every refusal and the exact
// payload are decided and tested once, without a drawer.
import { addDays, saigonInstant } from "@/kernel/config/dates";
import type { BountyDraft } from "../lib/bounty-draft";
import type { Portrait } from "../lib/party-picker";
import type { QuestActions } from "./actions-type";

/** The time of day an Answer by date falls due, Saigon: the end of the working day. */
const ASK_DUE_TIME = "18:00";

/** How long a title may be (a summon's own limit). */
const TITLE_MAX = 200;

/** A fresh ask is due a week out. */
const DEFAULT_DAYS = 7;

export type AskForm = {
  text: string;
  /** Everyone on the team but the asker, instead of the people picked. */
  everyone: boolean;
  picked: ReadonlySet<string>;
  /** Answer by, a Saigon calendar day (YYYY-MM-DD), or "" when none is picked. */
  date: string;
};

export function blankAskForm(today: string): AskForm {
  return { text: "", everyone: true, picked: new Set(), date: addDays(today, DEFAULT_DAYS) };
}

/** The ask as a title: one line, cut with an ellipsis inside the title limit. */
export function askTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** Everyone who can be asked: the team list, never the asker. */
function askable(party: readonly Portrait[], meId: string): Portrait[] {
  return party.filter((p) => p.personId !== meId);
}

/** Why the ask cannot be sent yet, in the drawer's words, or null when it can. */
export function askRefusal(form: AskForm, nowMs: number): string | null {
  if (!form.text.trim()) return "Write what you are asking.";
  if (!form.everyone && form.picked.size === 0) return "Pick who to ask, or choose Everyone.";
  if (!form.date) return "Pick an Answer by date.";
  const at = saigonInstant(form.date, ASK_DUE_TIME);
  if (!at) return "Pick an Answer by date.";
  if (Date.parse(at) <= nowMs) {
    // A day before today is plainly past; today's own due time may have gone too.
    return Date.parse(saigonInstant(form.date, "23:59") ?? at) <= nowMs ? "Answer by is in the past. Pick today or a later day." : `Today's ${ASK_DUE_TIME} has passed. Pick tomorrow or a later day.`;
  }
  return null;
}

/**
 * The summon the form posts: exactly one head, learning off. `everyoneShouldAnswer`
 * is the manager's or admin's tick box, null for anyone else, who has none;
 * only an unticked box sends the optional flag, so the flag can lower an ask and
 * never raise one (the action decides what is required from the person's roles).
 */
export function askToSummon(form: AskForm, party: readonly Portrait[], meId: string, everyoneShouldAnswer: boolean | null): Parameters<QuestActions["summonBounty"]>[0] {
  const can = askable(party, meId);
  const ids = form.everyone ? can.map((p) => p.personId) : can.filter((p) => form.picked.has(p.personId)).map((p) => p.personId);
  const ask = form.text.trim();
  return {
    title: askTitle(ask),
    learning: false,
    partyPersonIds: ids,
    heads: [{ ask, closesAt: saigonInstant(form.date, ASK_DUE_TIME) ?? "" }],
    ...(everyoneShouldAnswer === false ? { optional: true } : {}),
  };
}

/** The people a search finds: anyone whose name holds it, leaving out the picked and the asker. At most `limit`. */
export function matchPeople(party: readonly Portrait[], query: string, picked: ReadonlySet<string>, meId: string, limit = 6): Portrait[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return askable(party, meId)
    .filter((p) => !picked.has(p.personId) && p.name.toLowerCase().includes(q))
    .slice(0, limit);
}

/**
 * The form an assistant draft opens with: its first head's ask (the title when
 * that is blank), the people it names who can be asked, and its due day. The
 * page offers one head and no learning bounty, so the rest of the draft is left
 * behind; nothing is posted until the person presses Send.
 */
export function askFormFromDraft(draft: BountyDraft, party: readonly Portrait[], meId: string, today: string): AskForm {
  const can = askable(party, meId);
  const named = new Set(draft.partyPersonIds.filter((id) => can.some((p) => p.personId === id)));
  const head = draft.heads[0];
  return {
    text: head?.ask.trim() || draft.title,
    everyone: can.length > 0 && can.every((p) => named.has(p.personId)),
    picked: named,
    date: head?.date || addDays(today, DEFAULT_DAYS),
  };
}
