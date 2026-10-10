import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { recordCommitmentChange, nextCommitmentSort } from "./commitments";
import { type Result } from "./shared";
import { myProfileId } from "./member";

// The commitments a member writes for THEMSELVES, and the authorship rule that
// scopes them.
//
// Split out of member.ts, which had become two things: the loader that builds
// the whole My Coach view, and these writers. They change for different
// reasons — the loader changes when the page gains a section, these change when
// the rules about who may edit a promise change — and a file that changes for
// two reasons is the one people stop being able to read.
//
// The rule they all share: being the profile's owner grants status and order on
// ANY commitment on it, including one the coach set, but only AUTHORSHIP grants
// retitling and deletion. A member can never edit their coach's wording.

// A commitment the actor WROTE on their own profile. Both halves matter: being
// the profile's owner grants status and order, but only authorship grants
// retitling and deletion, so a member can never edit what their coach set.
async function myAuthoredCommitment(
  actor: TeamActor,
  commitmentId: string,
): Promise<{ id: string; profileId: string; title: string } | null> {
  if (!commitmentId) return null;
  const profileId = await myProfileId(actor);
  if (!profileId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select("id, created_by, title")
    .eq("id", commitmentId)
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/member] coaching_commitments", dataError);
  const row = data as { id: string; created_by: string | null; title: string } | null;
  if (!row || row.created_by !== actor.teamMemberId) return null;
  return { id: row.id, profileId, title: row.title };
}

function validCommitmentInput(title: string, dueOn: string | null): Result {
  const t = title.trim();
  if (!t) return { ok: false, error: "Write the commitment first." };
  if (t.length > 500) return { ok: false, error: "Keep the commitment under 500 characters." };
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false, error: "Bad date." };
  return { ok: true };
}

// A member commits to their own work. owner is always "member" — a member
// cannot assign work to their coach from here.
export async function myAddCommitment(
  actor: TeamActor,
  input: { title: string; dueOn: string | null },
): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validCommitmentInput(input.title, input.dueOn);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_commitments").insert({
    coaching_profile_id: profileId,
    title: input.title.trim(),
    owner: "member",
    due_on: input.dueOn,
    created_by: actor.teamMemberId,
    sort_order: await nextCommitmentSort(profileId),
  });
  return error ? { ok: false, error: "Could not add the commitment." } : { ok: true };
}

export async function myUpdateCommitmentDetails(
  actor: TeamActor,
  commitmentId: string,
  input: { title: string; dueOn: string | null },
): Promise<Result> {
  const mine = await myAuthoredCommitment(actor, commitmentId);
  if (!mine) return { ok: false, error: "You can only edit commitments you wrote." };
  const valid = validCommitmentInput(input.title, input.dueOn);
  if (!valid.ok) return valid;
  const title = input.title.trim();
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({
      title,
      due_on: input.dueOn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not update the commitment." };
  await recordCommitmentChange(commitmentId, actor.teamMemberId, {
    titleBefore: mine.title,
    titleAfter: title,
  });
  return { ok: true };
}

export async function myDeleteCommitment(actor: TeamActor, commitmentId: string): Promise<Result> {
  if (!(await myAuthoredCommitment(actor, commitmentId)))
    return { ok: false, error: "You can only delete commitments you wrote." };
  const { error } = await companyOs.from("coaching_commitments").delete().eq("id", commitmentId);
  return error ? { ok: false, error: "Could not delete the commitment." } : { ok: true };
}
