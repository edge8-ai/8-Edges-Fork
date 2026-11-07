// The quests tables' thin write helpers (QS.1). Each names a table and hands
// back the PostgREST builder, so the caller keeps its own filters and error
// handling. Nothing here deletes a quest, a party row, a head or a Reaction:
// none is ever hard-deleted, and the service role holds no delete grant on
// those tables. A raised hand is the one exception (QS.5): lowering it removes
// the person's own row, by design, and quest_hands grants delete for it.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { BeaconHeadInsert, BeaconInsert, BeaconPartyInsert, BeaconWithdrawPatch, HandInsert, HandPatch, HeadInsert, PartyInsert, QuestInsert, RaidInsert, ReactionInsert } from "./rows";
import type { HeadPatch, PartyPatch, QuestPatch } from "./standing";

type QuestsInsert = TablesInsert<{ schema: "company_os" }, "quests">;

// A Bounty, a Raid or a Beacon; each narrows the same insert, so widening it back is safe.
export const insertQuests = (row: QuestInsert | RaidInsert | BeaconInsert) => companyOs.from("quests").insert(row as QuestsInsert);
export const updateQuests = (patch: QuestPatch | BeaconWithdrawPatch) => companyOs.from("quests").update(patch);
export const insertQuestHeads = (rows: (HeadInsert | BeaconHeadInsert)[]) => companyOs.from("quest_heads").insert(rows);
export const updateQuestHeads = (patch: HeadPatch) => companyOs.from("quest_heads").update(patch);
export const insertQuestParty = (rows: (PartyInsert | BeaconPartyInsert)[]) => companyOs.from("quest_party").insert(rows);
export const updateQuestParty = (patch: PartyPatch) => companyOs.from("quest_party").update(patch);
export const insertQuestReactions = (row: ReactionInsert) => companyOs.from("quest_reactions").insert(row);
export const insertQuestHands = (row: HandInsert) => companyOs.from("quest_hands").insert(row);
export const updateQuestHands = (patch: HandPatch) => companyOs.from("quest_hands").update(patch);
export const deleteQuestHands = () => companyOs.from("quest_hands").delete();
