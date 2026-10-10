import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { one } from "@/kernel/config/embedded";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { notifyBoth } from "@/entities/coaching/lib/cycle-shared";
import { describeDay } from "../cadence";
import { sessionDoneText, sessionTarget, type SessionFormat, type SessionWhich } from "../session-done";
import type { CommitmentOwner } from "../types";
import { coachAddCommitment } from "./commitments";
import { loadScheduleFor } from "./one-on-one-schedule";
import { liveScheduledRowOn } from "./move-meeting";
import { assertCoachOwnsProfile, patchMeeting, type Result } from "./shared";
import { coachSetMinutesLink } from "./coach-edits";
import { coachSaveTranscript } from "./one-on-ones";

// Mark a coaching session done (K.80): one write, whatever the session was
// and whether or not anything was booked. sessionTarget decides which row it
// lands on; this file only writes it, then tells the employee.
//
// What the coach may add, all optional: a note to the employee (the session's
// shared recap, published with it), a private note (the coach-only summary
// tier), how they met, and next steps for either of them (commitments tied to
// this session). The employee's FAST goal and reflection stay theirs to write:
// the message asks them for it.
export type SessionDoneInput = {
  day: string;
  which: SessionWhich;
  note: string;
  privateNote: string;
  format: SessionFormat | null;
  steps: { title: string; owner: CommitmentOwner }[];
  // The recording, optional and useful: a Lark Minutes link and/or a pasted
  // transcript. Either feeds the AI recap draft; neither is ever required.
  minutesUrl: string;
  transcript: string;
};

// The AI recap, handed in by the action layer so this file stays free of the
// model client. It drafts both recap tiers from the transcript.
export type Summarize = (meetingId: string) => Promise<unknown>;

export async function coachCompleteSession(
  actor: TeamActor,
  profileId: string,
  input: SessionDoneInput,
  summarize?: Summarize,
): Promise<Result> {
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return { ok: false, error: "Not found." };
  const today = saigonToday();
  if (input.day > today) return { ok: false, error: "A session is done once it has happened. Pick today or an earlier day." };

  let schedule;
  try {
    schedule = await loadScheduleFor(profileId, today);
  } catch {
    return { ok: false, error: "Could not load the 1-1s. Try again." };
  }
  const target = sessionTarget(schedule, input.day, input.which);
  const note = input.note.trim();
  const privateNote = input.privateNote.trim();
  const now = new Date().toISOString();
  const closing = {
    status: "held",
    marked_held_on: today,
    coach_voltage_md: null,
    ...(input.format ? { format: input.format } : {}),
  };
  // The coach's own words, written last: the AI draft from a transcript fills
  // both recap fields, and what the coach typed must win over it.
  const notes = {
    ...(note ? { shared_summary_markdown: note, shared_published_at: now } : {}),
    ...(privateNote ? { summary_markdown: privateNote } : {}),
  };

  let meetingId: string;
  let heldOn: string;
  if (target.kind === "record") {
    // One live row per profile and day: a session already recorded that day is
    // the one the coach means, and adding a note to it is all that is left.
    const live = await liveScheduledRowOn(profileId, target.day);
    if (live) {
      const res = await patchMeeting(live.id, closing);
      if (!res.ok) return res;
      meetingId = live.id;
    } else {
      const { data, error } = await companyOs
        .from("coaching_one_on_ones")
        .insert({ coaching_profile_id: profileId, held_on: target.day, ...closing })
        .select("id")
        .maybeSingle();
      if (error || !data) return { ok: false, error: "Could not record the session." };
      meetingId = (data as { id: string }).id;
    }
    heldOn = target.day;
  } else if (target.kind === "close-early") {
    if (await liveScheduledRowOn(profileId, input.day)) {
      return { ok: false, error: "There is already a 1-1 on that day. Pick the day you met." };
    }
    const res = await patchMeeting(target.row.id, {
      ...closing,
      held_on: input.day,
      moved_from: target.row.day,
      move_reason: "met earlier",
    });
    if (!res.ok) return res;
    meetingId = target.row.id;
    heldOn = input.day;
  } else {
    const res = await patchMeeting(target.row.id, closing);
    if (!res.ok) return res;
    meetingId = target.row.id;
    heldOn = target.row.day;
  }

  // Next steps belong to this session. The session is already recorded, so a
  // step that fails to save says so without undoing it.
  for (const step of input.steps) {
    if (!step.title.trim()) continue;
    const added = await coachAddCommitment(actor, profileId, {
      title: step.title,
      owner: step.owner,
      dueOn: null,
      oneOnOneId: meetingId,
    });
    if (!added.ok) return { ok: false, error: `The session is marked done, but "${step.title}" did not save. Add it from Promises.` };
  }

  // The recording. The session is recorded by here, so a part that fails says
  // which, and the coach adds it from the session's record below.
  if (input.minutesUrl.trim()) {
    const linked = await coachSetMinutesLink(actor, meetingId, input.minutesUrl);
    if (!linked.ok) return { ok: false, error: `The session is marked done, but the Minutes link did not save: ${linked.error}` };
  }
  const transcript = input.transcript.trim();
  if (transcript) {
    const saved = await coachSaveTranscript(actor, meetingId, transcript);
    if (!saved.ok) return { ok: false, error: `The session is marked done, but the transcript did not save: ${saved.error}` };
    // Fail-soft by design: a model error lands on the row as ai_error.
    if (summarize) await summarize(meetingId);
  }
  if (Object.keys(notes).length > 0) {
    const written = await patchMeeting(meetingId, notes);
    if (!written.ok) return { ok: false, error: "The session is marked done, but your note did not save. Add it from the session." };
  }

  // The session is recorded by here; a message that fails to send is logged,
  // never reported as the coach's failure (the K.7 rule for recaps).
  try {
    await notifySessionDone(profileId, actor.teamMemberId, heldOn, Boolean(note));
  } catch (err) {
    console.error("[coaching/session-done] notify", err instanceof Error ? err.message : err, meetingId);
  }
  return { ok: true };
}

async function notifySessionDone(
  profileId: string,
  coachTeamMemberId: string,
  heldOn: string,
  hasNote: boolean,
): Promise<boolean> {
  const [{ data: memberRow, error: memberError }, { data: coachRow, error: coachError }] = await Promise.all([
    companyOs
      .from("coaching_profiles")
      .select(`team_members:team_members!team_member_id(people:people!person_id(${NAME_COLUMNS}))`)
      .eq("id", profileId)
      .maybeSingle(),
    companyOs
      .from("team_members")
      .select(`people:people!person_id(${NAME_COLUMNS})`)
      .eq("id", coachTeamMemberId)
      .maybeSingle(),
  ]);
  if (memberError) console.error("[coaching/session-done] coaching_profiles", memberError);
  if (coachError) console.error("[coaching/session-done] team_members", coachError);
  const tm = one(((memberRow as Record<string, unknown> | null)?.team_members ?? null) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null);
  const member = one((tm?.people ?? null) as NamedPerson | NamedPerson[] | null);
  const email = member?.email ?? null;
  if (!email) return false;
  const coach = one(((coachRow as Record<string, unknown> | null)?.people ?? null) as NamedPerson | NamedPerson[] | null);

  const link = `${await getSiteOrigin()}/team/my-coaching`;
  const text = sessionDoneText({ coachName: personName(coach, "Your coach"), dayLabel: describeDay(heldOn), hasNote });
  return notifyBoth({
    email,
    subject: "Your 1-1 is done: update your FAST goal",
    html: `<p>${text}</p><p><a href="${link}">Your coaching page</a></p>`,
    larkText: `${text} ${link}`,
    logKind: "session_done",
    // A nudge names the page it points at and goes only to someone who may
    // open it (AC.15): the employee's own coaching page.
    links: [link],
  });
}
