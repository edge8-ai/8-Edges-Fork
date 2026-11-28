import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { type PersonEmbed } from "./rows";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

// "You're not alone on this bet" (L.5): the other people whose goals lift the
// same company key result as yours.
//
// The whole design of this file is one decision, and it lives in the TYPE.
//
// A key result with several people climbing towards it is, mechanically, a
// leaderboard waiting to happen: add one number to each row — a percentage, a
// current value, a count of bumps — and a shared bet becomes a ranking of
// colleagues, which is the thing this codebase refuses to build. So
// `SharedGoal` carries a name and a goal title and NOTHING ELSE. There is no
// numeric field to sort by, no progress to render, and no way for a later
// caller to add one without editing this type and reading this comment.
//
// It is the same technique the Revenue hub uses: the absence of a person
// column in the row type is what makes the rule impossible to break by
// accident later.

export type SharedGoal = {
  /** Whose goal it is. A name, to recognise a colleague by — never an id to group on. */
  name: string;
  /** What they are trying to move. */
  goalTitle: string;
};

// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
const SHARED_SELECT =
  `id, title, status, key_result_id, coaching_profiles:coaching_profiles!coaching_profile_id(team_members:team_members!team_member_id(people:people!person_id(${NAME_COLUMNS}, avatar_url)))`;

/**
 * Everyone else lifting `keyResultId`, excluding the viewer's own goal.
 *
 * Active goals only: a goal that was dropped or is still a draft is not a bet
 * anyone is currently making, and showing it would say someone is climbing
 * beside you when they are not.
 *
 * Ordered by name, deliberately and permanently. Any other order — by when the
 * goal was set, by how far it has come — is a ranking with the numbers hidden,
 * and the reader would be right to read it as one.
 */
export async function getSharedKeyResultGoals(
  keyResultId: string | null,
  excludeGoalId: string | null,
): Promise<SharedGoal[]> {
  if (!keyResultId) return [];
  const { data, error } = await companyOs
    .from("goals")
    .select(SHARED_SELECT)
    .eq("key_result_id", keyResultId)
    .eq("status", "active");
  if (error) {
    console.error("[team/coaching/shared-key-result] goals", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const out: SharedGoal[] = [];
  for (const r of rows) {
    if (excludeGoalId && r.id === excludeGoalId) continue;
    const prof = one(r.coaching_profiles as Record<string, unknown> | Record<string, unknown>[] | null);
    const tm = one((prof?.team_members ?? null) as Record<string, unknown> | Record<string, unknown>[] | null);
    const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
    const name = personName(person, "-");
    const goalTitle = ((r.title as string | null) ?? "").trim();
    // A goal nobody can be named against, or with no title, says nothing worth
    // showing — "- is also climbing this" is noise, not company.
    if (!goalTitle || name === "-") continue;
    out.push({ name, goalTitle });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
