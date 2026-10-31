// Server-only. The team assistant's quest tools (QS.9; quests spec 2026-10-20,
// "Claude"; ADR 0020): what is open for the person and a Bounty drafted from
// their instruction, both for a holder of quests.mine; and the manager's one
// question, who missed one named Bounty, for a holder of quests.report. The
// tool list hands each only to a holder of its atom
// (entities/assistant/lib/team-chat/quest-tools.ts), and each body refuses on
// its own without it, so a tool is never a side door. All three read through
// the quests door, never a quests table.
//
// Each body takes the caller the route resolved from the session: the person,
// their resolved access, and the id of this tool call. Nothing in the tool
// input names anybody else's quests: my_quests reads the caller's own party
// rows only, draft_bounty resolves the names it is given against the Summon
// drawer's staff list, and quest_report reads one Bounty with the caller's own
// reach. draft_bounty writes nothing and sends nothing: it returns a draft and
// a link that carries only this call's id, and nobody is called until the
// person presses Summon on the page.

import type { Access } from "@/kernel/identity/access-model";
import { askQuestReport, draftBounty, readOpenQuests } from "@/entities/quests";
import { ok, refuse, text, type ToolInput, type ToolOutcome } from "./shared";

/** Who is asking, from the session: their people.id, their resolved access, and the id of this tool call. */
export type QuestCaller = { personId: string; access: Pick<Access, "may">; callId: string };

const QUESTS_LINK = "/team/quests";
const NOT_YOURS = "Quests are for people who may open the Quests page. Say so plainly.";

export async function myQuests(_input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  if (!caller.access.may("quests.mine")) return refuse(NOT_YOURS);
  const open = await readOpenQuests(caller.personId);
  return ok({ ...open, link: QUESTS_LINK });
}

export async function draftBountyTool(input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  if (!caller.access.may("quests.mine")) return refuse(NOT_YOURS);
  const outcome = await draftBounty(input, caller, caller.callId);
  if (!outcome.ok) return refuse(outcome.error);
  return ok({
    draft: outcome.draft,
    link: outcome.link,
    nothingSent: "Nothing was posted and nobody was called. The person opens the link, changes anything in the Summon drawer, and presses Summon themselves.",
  });
}

/**
 * The manager's one question: who among the people the caller reaches missed
 * one named Bounty. The input names a Bounty and nothing else, and one Bounty
 * is read, with the caller's own reach.
 */
export async function questReportTool(input: ToolInput, caller: QuestCaller): Promise<ToolOutcome> {
  const outcome = await askQuestReport(caller, text(input, "bounty"));
  if (!outcome.ok) return refuse(outcome.error);
  return ok(outcome.answer);
}
