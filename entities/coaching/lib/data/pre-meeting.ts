import { companyOs } from "@/kernel/data/supabase";
import { preMeetingAnswered } from "../member-agenda";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { currentCycleCheckin } from "../types";
import { hasEdits, normaliseEdits, validatePrepEdits, type PrepEdits } from "../prep-edits";
import { myProfileId } from "./member";
import type { Result } from "./shared";
import { loadScheduleFor } from "./one-on-one-schedule";

/**
 * The member's pre-meeting answers for the upcoming 1-1 (K.15, spec 2.3).
 * Upsert by hand rather than by constraint: the row this belongs to is the one
 * inside the current cycle, which no unique index can express, so the write
 * finds it and creates it with sent_at = now when the nudge has not opened one
 * yet. responded_at is stamped whenever anything was typed and cleared when
 * everything was erased, because it is what the prep and the notification read
 * as "this form has been answered".
 */
export async function savePreMeetingAnswers(
  actor: TeamActor,
  moved: string,
  stuck: string,
  talk: string,
): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const answers = { moved: moved.trim(), stuck: stuck.trim(), talk: talk.trim() };
  for (const value of Object.values(answers))
    if (value.length > 4000) return { ok: false, error: "Keep each answer under 4000 characters." };

  // The cycle runs from the last held or skipped 1-1 to the booked one, and is
  // open-ended while nothing is booked, so the member can write before anyone
  // books (ADR-0010).
  let schedule;
  try {
    schedule = await loadScheduleFor(profileId);
  } catch {
    return { ok: false, error: "Could not load your 1-1s." };
  }
  const nextOn = schedule.booked?.day ?? null;
  const lastHeldOn = schedule.lastOn;

  const { data: rows, error: rowsError } = await companyOs
    .from("coaching_checkins")
    .select("id, sent_at")
    .eq("coaching_profile_id", profileId)
    .order("sent_at", { ascending: false });
  if (rowsError) return { ok: false, error: "Could not load the form." };
  const existing = currentCycleCheckin(
    ((rows ?? []) as Array<{ id: string; sent_at: string }>).map((r) => ({ id: r.id, sentAt: r.sent_at })),
    lastHeldOn,
    nextOn,
  );

  const answered = preMeetingAnswered(answers);
  const patch = {
    moved_md: answers.moved || null,
    stuck_md: answers.stuck || null,
    talk_md: answers.talk || null,
    responded_at: answered ? new Date().toISOString() : null,
  };

  if (existing) {
    const { error } = await companyOs.from("coaching_checkins").update(patch).eq("id", existing.id);
    return error ? { ok: false, error: "Could not save your answers." } : { ok: true };
  }
  const { error } = await companyOs
    .from("coaching_checkins")
    .insert({ coaching_profile_id: profileId, sent_at: new Date().toISOString(), ...patch });
  return error ? { ok: false, error: "Could not save your answers." } : { ok: true };
}

// The three pre-meeting headings, in the order the member sees them (K.15).
const PRE_MEETING_FIELDS = [
  { column: "moved_md", heading: "What moved since last time" },
  { column: "stuck_md", heading: "What is stuck" },
  { column: "talk_md", heading: "What I want to talk about" },
] as const;

/**
 * What the member wrote before the upcoming 1-1, verbatim (K.15, spec 2.3).
 * This block goes FIRST in the prep's user message, because the person's own
 * words outrank anything assembled about them. Every heading is rendered even
 * when it is empty: an unanswered heading is not a hole in the prep, it is the
 * question the coach asks in the room, and the prompt turns it into one.
 */
export async function loadPreMeetingAnswers(profileId: string): Promise<string> {
  const schedule = await loadScheduleFor(profileId);
  const nextOn = schedule.booked?.day ?? null;
  const lastHeldOn = schedule.lastOn;

  const { data, error } = await companyOs
    .from("coaching_checkins")
    .select("sent_at, moved_md, stuck_md, talk_md")
    .eq("coaching_profile_id", profileId)
    .order("sent_at", { ascending: false });
  if (error) console.error("[coaching-ai] coaching_checkins", error);
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    sentAt: r.sent_at as string,
    values: r,
  }));
  const current = currentCycleCheckin(rows, lastHeldOn, nextOn);

  return PRE_MEETING_FIELDS.map(({ column, heading }) => {
    const value = ((current?.values[column] as string | null) ?? "").trim();
    return `## ${heading}\n${value || "(nothing written)"}`;
  }).join("\n\n");
}

// The member's amendments to the shared prep (K.21). Member tier: the row is
// the actor's own next booked 1-1, never a client id.
// The coach's prep_shared_markdown is untouched; only the edits column moves.
export async function savePrepMemberEdits(actor: TeamActor, edits: PrepEdits): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const clean = normaliseEdits(edits);
  const valid = validatePrepEdits(clean);
  if (!valid.ok) return valid;

  let booked;
  try {
    booked = (await loadScheduleFor(profileId)).booked;
  } catch {
    return { ok: false, error: "Could not load your 1-1s." };
  }
  if (!booked) return { ok: false, error: "There is no 1-1 booked to amend." };

  const { error } = await companyOs
    .from("coaching_one_on_ones")
    .update({ prep_member_edits: hasEdits(clean) ? clean : null, updated_at: new Date().toISOString() })
    .eq("id", booked.id);
  return error ? { ok: false, error: "Could not save your changes." } : { ok: true };
}
