import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { normalisePriorityLink } from "../priority-link";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { GOAL_STATUS_LABELS, RECAP_LANGUAGE_LABELS, RETENTION_ROOT_LABELS, OCEAN_DIMENSIONS, type OceanDimensionKey, type GoalStatus, type PriorityStatus, type RecapLanguage, type RetentionRoot, type LadderInput } from "../types";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { assertCoachOwnsProfile, canManageGoals, goalProfileId, ladderColumns, patchMeeting, patchProfile, type Result } from "./shared";
import { goalColumns, validateGoal, type MyGoalInput } from "./my-goals";

// The coach's card writes the same shape as the member's page since K.13: one
// FastGoalForm, one MyGoalInput, one validateGoal. The gate is what differs —
// canManageGoals (the profile's coach, or any manager) rather than "the goal is
// on my own profile".
export async function coachAddGoal(
  actor: TeamActor,
  profileId: string,
  input: MyGoalInput,
): Promise<Result> {
  if (!(await canManageGoals(actor, profileId))) return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await companyOs.from("goals").insert({
    coaching_profile_id: profileId,
    created_by: actor.teamMemberId,
    ...goalColumns(input),
  });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

async function assertCoachOwnsRow(
  actor: TeamActor,
  table: "goals" | "coaching_priorities",
  id: string,
): Promise<boolean> {
  if (!id) return false;
  const { data, error: dataError } = await companyOs
    .from(table)
    .select("id, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .eq("id", id)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/coach-edits] data", dataError);
  if (!data) return false;
  const prof = one(
    (data as unknown as Record<string, unknown>).coaching_profiles as
      | { coach_id: string }
      | { coach_id: string }[]
      | null,
  );
  return prof?.coach_id === actor.teamMemberId;
}

export async function coachUpdateGoal(
  actor: TeamActor,
  goalId: string,
  input: MyGoalInput,
): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await companyOs
    .from("goals")
    .update({ ...goalColumns(input), updated_at: new Date().toISOString() })
    .eq("id", goalId);
  return error ? { ok: false, error: "Could not update the goal." } : { ok: true };
}

// True delete (comments cascade): a mis-set goal should not leave a tombstone.
// Coach of the profile or any manager.
export async function coachDeleteGoal(actor: TeamActor, goalId: string): Promise<Result> {
  const profileId = await goalProfileId(goalId);
  if (!profileId || !(await canManageGoals(actor, profileId)))
    return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}

export async function coachAddPriority(
  actor: TeamActor,
  profileId: string,
  input: { title: string; detail: string; ladder: LadderInput },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the priority first." };
  const { count, error: countError } = await companyOs
    .from("coaching_priorities")
    .select("id", { count: "exact", head: true })
    .eq("coaching_profile_id", profileId);
  if (countError) console.error("[team/coaching/coach-edits] coaching_priorities", countError);
  const { error } = await companyOs.from("coaching_priorities").insert({
    coaching_profile_id: profileId,
    title,
    detail_markdown: input.detail.trim() || null,
    sort_order: count ?? 0,
    ...ladderColumns(input.ladder),
  });
  return error ? { ok: false, error: "Could not add the priority." } : { ok: true };
}

export async function coachUpdatePriority(
  actor: TeamActor,
  priorityId: string,
  patch: { title?: string; detail?: string; status?: PriorityStatus; ladder?: LadderInput; link?: { url: string; title: string } | null },
): Promise<Result> {
  if (!(await assertCoachOwnsRow(actor, "coaching_priorities", priorityId)))
    return { ok: false, error: "Not found." };
  const update: CompanyOsUpdate<"coaching_priorities"> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The priority needs a title." };
    update.title = t;
  }
  if (patch.detail !== undefined) update.detail_markdown = patch.detail.trim() || null;
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "retired") return { ok: false, error: "Bad status." };
    update.status = patch.status;
  }
  if (patch.ladder !== undefined) Object.assign(update, ladderColumns(patch.ladder));
  // The scheme allowlist is applied on the way IN as well as on the way out
  // (L.6): a normaliser that returns null is the coach clearing the link, and
  // a URL it refuses never reaches the column in the first place.
  if (patch.link !== undefined) {
    const link = patch.link ? normalisePriorityLink(patch.link) : null;
    if (patch.link && !link) return { ok: false, error: "That link needs to be a full http or https address." };
    update.link_url = link?.url ?? null;
    update.link_title = link?.title ?? null;
  }
  const { error } = await companyOs.from("coaching_priorities").update(update).eq("id", priorityId);
  return error ? { ok: false, error: "Could not update the priority." } : { ok: true };
}

// OCEAN: coach writes; publish is the member-visibility gate (mirrors the
// shared-recap publish flow).
export type OceanInput = {
  dims: Record<OceanDimensionKey, { rating: string; evidence: string }>;
  snapshot: string;
  guidance: string;
};

export async function coachSaveOcean(
  actor: TeamActor,
  profileId: string,
  input: OceanInput,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const row: CompanyOsUpdate<"coaching_ocean_profiles"> = {
    snapshot_markdown: input.snapshot.trim() || null,
    guidance_markdown: input.guidance.trim() || null,
    updated_at: new Date().toISOString(),
  };
  // The per-dimension columns are named by string interpolation, which
  // TypeScript cannot check against the row type; one cast covers the loop and
  // leaves the accumulator itself typed for the write below.
  const dimColumns = row as Record<string, unknown>;
  for (const k of OCEAN_DIMENSIONS) {
    dimColumns[`${k}_rating`] = input.dims[k]?.rating.trim() || null;
    dimColumns[`${k}_evidence`] = input.dims[k]?.evidence.trim() || null;
  }
  const { data: existing, error: existingError } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (existingError) console.error("[team/coaching/coach-edits] coaching_ocean_profiles", existingError);
  const { error } = existing
    ? await companyOs
        .from("coaching_ocean_profiles")
        .update(row)
        .eq("id", (existing as { id: string }).id)
    : await companyOs
        .from("coaching_ocean_profiles")
        .insert({ ...row, coaching_profile_id: profileId, published: false });
  return error ? { ok: false, error: "Could not save the OCEAN profile." } : { ok: true };
}

export async function coachPublishOcean(
  actor: TeamActor,
  profileId: string,
  publish: boolean,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const { data, error: dataError } = await companyOs
    .from("coaching_ocean_profiles")
    .select("id, snapshot_markdown, guidance_markdown")
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/coach-edits] coaching_ocean_profiles", dataError);
  if (!data) return { ok: false, error: "Write the OCEAN profile first." };
  const r = data as { id: string; snapshot_markdown: string | null; guidance_markdown: string | null };
  if (publish && !r.snapshot_markdown?.trim() && !r.guidance_markdown?.trim())
    return { ok: false, error: "Write the snapshot or guidance before publishing." };
  const { error } = await companyOs
    .from("coaching_ocean_profiles")
    .update({ published: publish, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  return error ? { ok: false, error: "Could not update publishing." } : { ok: true };
}

export async function coachSetRetentionRoot(
  actor: TeamActor,
  profileId: string,
  root: RetentionRoot | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (root !== null && !(root in RETENTION_ROOT_LABELS)) return { ok: false, error: "Bad root." };
  return patchProfile(profileId, { retention_root: root });
}

// Pin the language of the SHARED recap tier for one member. Null hands the
// choice back to the summariser, which follows the language the member spoke.
export async function coachSetRecapLanguage(
  actor: TeamActor,
  profileId: string,
  language: RecapLanguage | null,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  if (language !== null && !(language in RECAP_LANGUAGE_LABELS))
    return { ok: false, error: "Bad language." };
  return patchProfile(profileId, { recap_language: language });
}

// Attach a Lark Minutes link to a 1-1. The transcript pull itself is the
// 22:00 coaching-lark-pickup job's (the linked pass in cycle-minutes.ts) or a
// pasted transcript; storing the token now keeps the meeting joined to its
// recording.
export async function coachSetMinutesLink(
  actor: TeamActor,
  meetingId: string,
  url: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const m = url.trim().match(/minutes\/([a-z0-9]+)/i);
  if (!m) return { ok: false, error: "Paste a Lark Minutes link (…/minutes/…)." };
  return patchMeeting(meetingId, { minutes_token: m[1], transcript_source: "minutes_link" });
}

export async function coachSetCadence(actor: TeamActor, profileId: string, cadenceDays: number): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const days = Math.round(cadenceDays);
  if (!Number.isFinite(days) || days < 7 || days > 90)
    return { ok: false, error: "Cadence must be between 7 and 90 days." };
  return patchProfile(profileId, { cadence_days: days });
}

// Pause or resume the 1-1 rhythm: "leave this person alone until I resume".
// While paused the schedule suggests no date and the daily pass writes no prep
// and sends no nudge; a 1-1 already booked stays booked.
export async function coachSetOneOnOnesPaused(
  actor: TeamActor,
  profileId: string,
  paused: boolean,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return patchProfile(profileId, { one_on_ones_paused_at: paused ? new Date().toISOString() : null });
}

export async function coachSetPrivateProfile(
  actor: TeamActor,
  profileId: string,
  markdown: string,
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  return patchProfile(profileId, { private_profile_markdown: markdown.trim() || null });
}

// The coach's note on a member's pre-meeting form (K.15, spec 2.3). Ownership
// is asserted through the check-in's own profile rather than a profile id the
// client sends, so a forged check-in id belonging to someone else's report is a
// no-op. The member sees the note as soon as it is written: there is no publish
// gate here, because the note is written TO them.
export async function coachSaveCheckinNote(
  actor: TeamActor,
  checkinId: string,
  note: string,
): Promise<Result> {
  if (!checkinId) return { ok: false, error: "Not found." };
  const { data, error: dataError } = await companyOs
    .from("coaching_checkins")
    .select("id, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .eq("id", checkinId)
    .maybeSingle();
  if (dataError) {
    console.error("[team/coaching/coach-edits] coaching_checkins", dataError);
    return { ok: false, error: "Could not load the form." };
  }
  if (!data) return { ok: false, error: "Not found." };
  const prof = one(
    (data as unknown as Record<string, unknown>).coaching_profiles as
      | { coach_id: string }
      | { coach_id: string }[]
      | null,
  );
  if (prof?.coach_id !== actor.teamMemberId) return { ok: false, error: "Not found." };
  const text = note.trim();
  if (text.length > 4000) return { ok: false, error: "Keep the note under 4000 characters." };
  const { error } = await companyOs
    .from("coaching_checkins")
    .update({ coach_note_md: text || null })
    .eq("id", checkinId);
  return error ? { ok: false, error: "Could not save the note." } : { ok: true };
}
