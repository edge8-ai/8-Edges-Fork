// Server-only. The team assistant's quest tools (QS.9; quests spec 2026-10-20,
// "Claude"; ADR 0020; they speak asks since AK.7): what is open for the person and an ask drafted from
// their instruction, both for a holder of quests.mine; and the manager's one
// question, who missed one named ask, for a holder of quests.report. The
// tool list hands each only to a holder of its atom
// (entities/assistant/lib/team-chat/quest-tools.ts), and each body refuses on
// its own without it, so a tool is never a side door. All three read through
// the quests door, never a quests table.
//
// Each body takes the caller the route resolved from the session: the person,
// their resolved access, and the id of this tool call. Nothing in the tool
// input names anybody else's quests: my_quests reads the caller's own party
// rows only, draft_bounty resolves the names it is given against the New ask
// drawer's staff list, and quest_report reads one ask with the caller's own
// reach. draft_bounty writes nothing and sends nothing: it returns a draft and
// a link that carries only this call's id, and nobody is asked until the
// person presses Send ask in the New ask drawer on the Asks page.

import type { Access } from "@/kernel/identity/access-model";
import { askQuestReport, draftBounty, readOpenQuests, type OpenHead } from "@/entities/quests";
import { ok, refuse, text, type ToolInput, type ToolOutcome } from "./shared";

/** Who is asking, from the session: their people.id, their resolved access, and the id of this tool call. */
export type QuestCaller = { personId: string; access: Pick<Access, "may">; callId: string };

const ASKS_LINK = "/team/asks";
const NOT_YOURS = "Asks are for people who may open the Asks page. Say so plainly.";

// Where the person stands on an open question, in ask words. Only the standings
// that can still be owed reach here; the rest read as they are.
const STANDING_WORDS: Record<OpenHead["yours"], string> = {
  called: "not answered yet",
  accepted: "said they would answer",
  turned_in: "answered",
  handed_back: "handed back",
  missed: "missed",
};

export async function myQuests(_input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  if (!caller.access.may("quests.mine")) return refuse(NOT_YOURS);
  const open = await readOpenQuests(caller.personId);
  // Only asks are told: the model has no words for the rest of the entity, and
  // an unlabelled row of another kind would be read as an ask.
  const asks = open.bounties.map((b) => ({
    title: b.title,
    note: b.note,
    asker: b.giver,
    optional: !b.required,
    questions: b.heads.map((h) => ({ ask: h.ask, due: h.due, yours: STANDING_WORDS[h.yours] })),
  }));
  return ok({ asks, link: ASKS_LINK });
}

export async function draftBountyTool(input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  if (!caller.access.may("quests.mine")) return refuse(NOT_YOURS);
  const outcome = await draftBounty(input, caller, caller.callId);
  if (!outcome.ok) return refuse(outcome.error);
  return ok({
    draft: outcome.draft,
    link: outcome.link,
    nothingSent: "Nothing was sent and nobody was asked. The person opens the link, changes anything in the New ask drawer, and presses Send ask themselves.",
  });
}

/**
 * The manager's one question: who among the people the caller reaches missed
 * one named ask. The input names an ask and nothing else, and one ask
 * is read, with the caller's own reach.
 */
export async function questReportTool(input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  const outcome = await askQuestReport(caller, text(input, "bounty"));
  if (!outcome.ok) return refuse(outcome.error);
  return ok(outcome.answer);
}
