import { companyOs } from "@/kernel/data/supabase";
import { selectCallTranscripts, selectMeetings, insertMeetings, upsertCallTranscripts } from "@/entities/crm";

// Coaching 1-1 transcripts live in the central meetings table: each
// coaching_one_on_ones row links (meeting_id) to a meetings row whose
// call_transcripts holds the text. This helper is the single place the coaching
// flow creates/links that meeting and reads/writes the transcript, so no
// coaching code has to know the call_transcripts shape.
//
// Bulk reads (the coach's meeting list) instead embed the transcript directly in
// the coaching_one_on_ones select; see MEETING_SELECT in data.ts.

type LinkRow = {
  id: string;
  held_on: string | null;
  meeting_id: string | null;
  // The coach as a *people* row, not a team_members row. meetings.owner_id
  // references company_os.people, while coaching_profiles.coach_id references
  // company_os.team_members, and the two ids agree only for the thirty legacy
  // members created before the tables were split. Passing coach_id straight
  // through therefore inserted fine for those coaches and failed the foreign
  // key for everyone else; this field carries the hop so the caller cannot
  // reintroduce the mismatch.
  coach_person_id: string | null;
};

async function loadLink(coachingId: string): Promise<LinkRow | null> {
  const { data, error: linkError } = await companyOs
    .from("coaching_one_on_ones")
    .select(
      "id, held_on, meeting_id, coaching_profiles:coaching_profiles!coaching_profile_id(coach:team_members!coaching_profiles_coach_id_fkey(person_id))",
    )
    .eq("id", coachingId)
    .maybeSingle();
  if (linkError) console.error("[team/coaching-transcript] coaching_one_on_ones", linkError);
  if (!data) return null;
  const prof = Array.isArray(data.coaching_profiles) ? data.coaching_profiles[0] : data.coaching_profiles;
  const coach = Array.isArray(prof?.coach) ? prof?.coach[0] : prof?.coach;
  return {
    id: data.id as string,
    held_on: (data.held_on as string | null) ?? null,
    meeting_id: (data.meeting_id as string | null) ?? null,
    coach_person_id: (coach?.person_id as string | null) ?? null,
  };
}

type EnsureResult = { ok: true; meetingId: string } | { ok: false; error: string };

// Postgres' unique-violation SQLSTATE. Two concurrent saves of the same 1-1
// both see meeting_id null and both insert; the partial unique index on
// metadata->>'coaching_one_on_one_id' (migration 20260916190000) makes the
// loser fail here instead of creating a second orphan meeting (B9).
const UNIQUE_VIOLATION = "23505";

// Return the coaching session's linked meeting id, creating a coaching-origin
// meeting (source='coaching', type '1-1') and setting meeting_id if there is
// none. Takes the already-loaded link row, so the caller reads it once.
async function ensureCoachingMeeting(row: LinkRow): Promise<EnsureResult> {
  if (row.meeting_id) return { ok: true, meetingId: row.meeting_id };

  const link = async (meetingId: string): Promise<void> => {
    const { error: linkWriteError } = await companyOs
      .from("coaching_one_on_ones")
      .update({ meeting_id: meetingId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (linkWriteError) console.error("[team/coaching-transcript] coaching_one_on_ones link", linkWriteError);
  };

  const { data, error } = await insertMeetings({
      source: "coaching",
      meeting_type: "1-1",
      title: `1-1 on ${row.held_on ?? "(undated)"}`,
      started_at: row.held_on,
      owner_id: row.coach_person_id,
      metadata: { origin: "coaching", coaching_one_on_one_id: row.id },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== UNIQUE_VIOLATION) {
      console.error("[team/coaching-transcript] meetings insert", error);
      return { ok: false, error: `Could not create the meeting for this 1-1: ${error.message}` };
    }
    // The other writer won the race. Its meeting is the one we want; adopt it
    // rather than reporting a failure the coach can do nothing about.
    const { data: existing, error: reReadError } = await selectMeetings("id")
      .eq("metadata->>coaching_one_on_one_id", row.id)
      .maybeSingle();
    if (reReadError || !existing) {
      return { ok: false, error: `Could not read the meeting for this 1-1: ${reReadError?.message ?? "not found"}` };
    }
    await link(existing.id as string);
    return { ok: true, meetingId: existing.id as string };
  }
  if (!data) return { ok: false, error: "Could not create the meeting for this 1-1." };

  await link(data.id as string);
  return { ok: true, meetingId: data.id as string };
}

export async function readCoachingTranscript(meetingId: string | null): Promise<string | null> {
  if (!meetingId) return null;
  const { data, error: transcriptError } = await selectCallTranscripts("transcript")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (transcriptError) console.error("[team/coaching-transcript] call_transcripts", transcriptError);
  return (data?.transcript as string | null) ?? null;
}

type SaveResult = { ok: true; meetingId: string } | { ok: false; error: string };

// Store (or replace) a coaching session's transcript in call_transcripts,
// creating/linking its meeting first. One transcript per meeting.
export async function saveCoachingTranscript(coachingId: string, transcript: string): Promise<SaveResult> {
  const row = await loadLink(coachingId);
  if (!row) return { ok: false, error: "Could not link the coaching session to a meeting." };
  const ensured = await ensureCoachingMeeting(row);
  if (!ensured.ok) return ensured;
  const meetingId = ensured.meetingId;

  const { error } = await upsertCallTranscripts(
    {
      meeting_id: meetingId,
      title: `1-1 on ${row.held_on ?? "(undated)"}`,
      started_at: row.held_on,
      source: "coaching",
      call_type: "internal",
      transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meeting_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, meetingId };
}
