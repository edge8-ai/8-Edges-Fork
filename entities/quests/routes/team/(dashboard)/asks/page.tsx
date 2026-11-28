// /team/asks (AK.2, AK.3, ADR 0036): the Asks page. What teammates asked of the
// reader, what the reader asked of them, and the asks open to anyone, drawn by
// ui/AsksView from one AsksPage value (spec 2026-11-16, "The page"). The read
// returns no field for anyone still out, so the asker's markup cannot name them
// (ADR 0020). The buttons are the existing quest actions, each opening with its
// own guard; `now` is the request's instant, so every due line on the page
// reads one clock.
//
// The New ask drawer (AK.3) posts through summonBounty and calls from the staff
// list (readParty), so a client contact is never offered. An ask the assistant
// drafted (QS.9) arrives as ?draft=<id>: the link carries only the id of the
// assistant's draft_bounty call, read back from the reader's OWN chat history
// through the assistant door, so another person's id finds nothing and the page
// opens without a draft. The draft only fills the drawer; nothing is posted
// until the reader presses Send ask.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { findToolCall } from "@/entities/assistant";
import { closeQuest, reactToTurnIn, readAsksPage, readParty, summonBounty, turnIn, withdrawQuest } from "@/entities/quests";
import { AsksView } from "@/entities/quests/client";
import { DRAFT_TOOL, draftFromCall, isDraftRef } from "../../../../lib/bounty-draft";
import { isRequiredGiver } from "../../../../lib/quest-rules";

export const metadata = { title: "Asks", description: "What teammates asked of you, and what you asked of them." };

const actions = { summonBounty, turnIn, reactToTurnIn, closeQuest, withdrawQuest };

export default async function AsksPage({ searchParams }: { searchParams?: Promise<SearchParamsObj> } = {}) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const now = new Date();
  const params = (await searchParams) ?? {};
  const ref = firstParam(params.draft);
  const draftCall = isDraftRef(ref) ? findToolCall({ surface: "team", authUserId: actor.authUserId, callId: ref, tool: DRAFT_TOOL }) : Promise.resolve(null);
  const [page, party, call] = await Promise.all([readAsksPage(actor.personId, now), readParty(), draftCall]);
  // The reader's own portrait comes from the staff list the drawer asks from.
  const me = party.find((p) => p.personId === actor.personId) ?? { personId: actor.personId, name: "You", initials: "Y" };
  const draft = call === null ? null : draftFromCall(call, party, actor.personId, now);
  return <AsksView page={page} now={now.toISOString()} actions={actions} party={party} me={me} mayChooseRequired={isRequiredGiver(access.roles)} draft={draft} />;
}
