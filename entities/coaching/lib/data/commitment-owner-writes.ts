import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { TeamActor } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { assertCoachOwnsCommitment } from "./commitments";
import { normalisePlan } from "../commitment-plan";
import { HOW_I_WORK, normaliseHowField, type HowIWorkField } from "../how-i-work";

// Writes that only a commitment's OWNER may make, for either owner.
//
// Two features live here, and they have the same shape: the member answers for
// their own promises, the coach for theirs, and nothing else answers for
// either. They sit together rather than in member.ts and commitments.ts partly
// because that is what they are, and partly because member.ts is within twenty
// lines of the 400-line cap.
//
// 1. "Your board card is done — mark this kept?" (2026-09-18). Only DECLINING
//    is here: saying yes is an ordinary move to Done through the existing
//    status actions, so it lands in the same history as any other move.
//    Declining clears the stamp and touches no status, because "not this one"
//    means the person declines to call the promise kept, not that the card
//    moves somewhere else.
// 2. "When will you do it?" (L.1). The owner's own sentence about the moment
//    the work happens.

async function clearStamp(commitmentId: string): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({ card_done_at: null })
    .eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not dismiss the suggestion." };
  return { ok: true };
}

// The member's own profile owns a commitment: the same check a status move
// makes, lifted out because two features now need it.
async function commitmentIsOnMyProfile(actor: TeamActor, commitmentId: string): Promise<boolean> {
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select("id, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)")
    .eq("id", commitmentId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/commitment-owner] coaching_commitments", dataError);
  if (!data) return false;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null);
  return prof?.team_member_id === actor.teamMemberId;
}

/**
 * "When will you do it?" — the member writing their own plan (L.1).
 *
 * Open to the member on ANY commitment on their profile, including one their
 * coach set, for the same reason status is: the plan is about how THEY will do
 * it, and a promise somebody else made on your behalf is still yours to plan.
 */
export async function myUpdateCommitmentPlan(
  actor: TeamActor,
  commitmentId: string,
  plan: string,
): Promise<Result> {
  if (!(await commitmentIsOnMyProfile(actor, commitmentId))) return { ok: false, error: "Not found." };
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({ plan_md: normalisePlan(plan), updated_at: new Date().toISOString() })
    .eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not save the plan." };
  return { ok: true };
}

/** The member declining, on a commitment sitting on their own profile. */
export async function myDismissCardDone(actor: TeamActor, commitmentId: string): Promise<Result> {
  if (!(await commitmentIsOnMyProfile(actor, commitmentId))) return { ok: false, error: "Not found." };
  return clearStamp(commitmentId);
}

/**
 * The coach declining. A pushed card is assigned to whoever owns the
 * commitment, so a coach-owned promise gets the same suggestion on the coach's
 * own board — and needs the same way out, or the question would sit there with
 * no answer available to anyone.
 */
export async function coachDismissCardDone(actor: TeamActor, commitmentId: string): Promise<Result> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  return clearStamp(commitmentId);
}

/**
 * "How I work" — the member writing their own half of the profile (L.3).
 *
 * Scoped to the actor's OWN active profile, resolved from the actor rather than
 * taken from the client: these are the rare coaching columns the member owns,
 * and the whole point is undermined if anyone else can write them.
 */
export async function myUpdateHowIWork(
  actor: TeamActor,
  field: HowIWorkField,
  value: string,
): Promise<Result> {
  const prompt = HOW_I_WORK.find((p) => p.key === field);
  if (!prompt) return { ok: false, error: "Unknown field." };
  // The cast is over a COMPUTED key, not over the value. `prompt.column` is a
  // union of exactly the four literal column names, so this object is always a
  // valid update — TypeScript simply cannot narrow a computed key back to that
  // union, and it widens to a string index the generated row type refuses. The
  // alternative is a four-branch switch that restates the field-to-column map
  // HOW_I_WORK already holds, which is the version that actually rots.
  const patch = {
    [prompt.column]: normaliseHowField(value),
    updated_at: new Date().toISOString(),
  } as CompanyOsUpdate<"coaching_profiles">;
  const { error } = await companyOs
    .from("coaching_profiles")
    .update(patch)
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true);
  if (error) return { ok: false, error: "Could not save it." };
  return { ok: true };
}
