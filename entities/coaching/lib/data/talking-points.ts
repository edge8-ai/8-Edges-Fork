import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { myProfileId } from "./member";
import { isCoach } from "./roster";
import { assertCoachOwnsProfile, type Result } from "./shared";

function validTalkingPoint(body: string): Result {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write the talking point first." };
  if (b.length > 500) return { ok: false, error: "Keep it under 500 characters." };
  return { ok: true };
}

export async function myAddTalkingPoint(actor: TeamActor, body: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validTalkingPoint(body);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_talking_points").insert({
    coaching_profile_id: profileId,
    author_team_member_id: actor.teamMemberId,
    body: body.trim(),
  });
  return error ? { ok: false, error: "Could not add the talking point." } : { ok: true };
}

// The agenda is shared: the member may remove any talking point on their own
// profile, whoever wrote it (the coach can add points too since 2026-09-11).
export async function myDeleteTalkingPoint(actor: TeamActor, id: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId || !id) return { ok: false, error: "Not found." };
  return deleteTalkingPointOnProfile(id, profileId);
}

// The coach's side of the same agenda: add to or remove from a coachee's list.
export async function coachAddTalkingPoint(
  actor: TeamActor,
  profileId: string,
  body: string,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const valid = validTalkingPoint(body);
  if (!valid.ok) return valid;
  const { error } = await companyOs.from("coaching_talking_points").insert({
    coaching_profile_id: profileId,
    author_team_member_id: actor.teamMemberId,
    body: body.trim(),
  });
  return error ? { ok: false, error: "Could not add the talking point." } : { ok: true };
}

export async function coachDeleteTalkingPoint(
  actor: TeamActor,
  id: string,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Not found." };
  const { data, error: dataError } = await companyOs
    .from("coaching_talking_points")
    .select("id, coaching_profile_id")
    .eq("id", id)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/talking-points] coaching_talking_points", dataError);
  const row = data as { id: string; coaching_profile_id: string } | null;
  if (!row || !(await assertCoachOwnsProfile(actor, row.coaching_profile_id)))
    return { ok: false, error: "Not found." };
  const res = await deleteTalkingPointOnProfile(id, row.coaching_profile_id);
  return res.ok ? { ok: true, profileId: row.coaching_profile_id } : res;
}

// Delete only when the point sits on the given profile, so a guessed id from
// another profile is a no-op.
async function deleteTalkingPointOnProfile(id: string, profileId: string): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_talking_points")
    .delete()
    .eq("id", id)
    .eq("coaching_profile_id", profileId);
  return error ? { ok: false, error: "Could not delete." } : { ok: true };
}

// Mark a talking point addressed (or reopen it): allowed for the profile's coach
// or the member who wrote it. Returns the profile id so the caller can revalidate
// the right page.
export async function setTalkingPointAddressed(
  actor: TeamActor,
  id: string,
  addressed: boolean,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Not found." };
  const { data, error: dataError } = await companyOs
    .from("coaching_talking_points")
    .select("id, coaching_profile_id, author_team_member_id")
    .eq("id", id)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/talking-points] coaching_talking_points", dataError);
  const row = data as
    | { id: string; coaching_profile_id: string; author_team_member_id: string | null }
    | null;
  if (!row) return { ok: false, error: "Not found." };
  const isAuthor = row.author_team_member_id === actor.teamMemberId;
  const isCoach = Boolean(await assertCoachOwnsProfile(actor, row.coaching_profile_id));
  if (!isAuthor && !isCoach) return { ok: false, error: "Not allowed." };
  const { error } = await companyOs
    .from("coaching_talking_points")
    .update({ addressed_at: addressed ? new Date().toISOString() : null })
    .eq("id", id);
  return error
    ? { ok: false, error: "Could not update." }
    : { ok: true, profileId: row.coaching_profile_id };
}
