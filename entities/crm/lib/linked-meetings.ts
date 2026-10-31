// The meetings another record owns (A.63): a coaching 1-1, a performance
// review, a taught training session. Each of those records keeps its call's
// transcript against a meeting of its own, linked back by a metadata key or a
// meeting association. These questions find that meeting from the owning
// record's id, so the link's spelling lives with the table that holds it.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

/** The meeting a coaching 1-1 was filed as, or null (a partial unique index allows one). */
export async function coachingOneOnOneMeeting(oneOnOneId: string) {
  return companyOs.from("meetings").select("id").eq("metadata->>coaching_one_on_one_id", oneOnOneId).maybeSingle();
}

/** The meeting a performance review's call was filed as, or null. */
export async function reviewMeeting(reviewId: string) {
  return companyOs.from("meetings").select("id").eq("source", "review").eq("metadata->>performance_review_id", reviewId).maybeSingle();
}

// A training's meeting is linked by a meeting association rather than a
// metadata key (English Program PR 5). The training reads come back as lists
// of at most one row, because the session page reads every part of a session
// as rows (mustRows).
const TRAINING = "training";

/** The meeting associated with a training, as at most one row. */
export async function meetingOfTraining(trainingId: string) {
  return companyOs.from("meeting_associations").select("meeting_id").eq("entity_type", TRAINING).eq("entity_id", trainingId).limit(1);
}

/**
 * For each of these trainings that has a meeting, whether a recording link
 * and a transcript are attached. A training with no meeting is absent from the
 * map. The training programme read asks it once for every session it lists;
 * it never reads the transcript's text. Chunked to keep each request's URL short.
 */
export async function trainingRecordings(trainingIds: readonly string[]): Promise<Map<string, { recording: boolean; transcript: boolean }>> {
  const out = new Map<string, { recording: boolean; transcript: boolean }>();
  for (let i = 0; i < trainingIds.length; i += 100) {
    const ids = trainingIds.slice(i, i + 100);
    const links = mustRows(await companyOs.from("meeting_associations").select("entity_id, meeting_id").eq("entity_type", TRAINING).in("entity_id", ids), "[crm] training meetings") as { entity_id: string; meeting_id: string }[];
    if (links.length === 0) continue;
    const meetings = mustRows(
      await companyOs.from("meetings").select("id, recording_url, transcripts:call_transcripts(meeting_id)").in("id", [...new Set(links.map((l) => l.meeting_id))]),
      "[crm] training recordings",
    ) as unknown as { id: string; recording_url: string | null; transcripts: { meeting_id: string }[] | null }[];
    const byId = new Map(meetings.map((m) => [m.id, m]));
    for (const l of links) {
      const m = byId.get(l.meeting_id);
      if (m) out.set(l.entity_id, { recording: m.recording_url !== null, transcript: (m.transcripts ?? []).length > 0 });
    }
  }
  return out;
}

/** Says what a meeting is about: the training it recorded. */
export async function linkMeetingToTraining(meetingId: string, trainingId: string) {
  return companyOs.from("meeting_associations").insert({ meeting_id: meetingId, entity_type: TRAINING, entity_id: trainingId });
}

/** A meeting's recording and minutes links, as at most one row. */
export async function meetingRecordingLinks(meetingId: string) {
  return companyOs.from("meetings").select("id, recording_url, minutes_url").eq("id", meetingId).limit(1);
}

/** Meetings already filed under this external id (a Lark minute token, or training:<id>), as at most one row. */
export async function meetingsWithExternalId(externalId: string) {
  return companyOs.from("meetings").select("id").eq("external_id", externalId).limit(1);
}

export type RecordingLinks = { recordingUrl: string | null; minutesUrl: string | null };

/** Points a meeting at a newer recording: its links and the external id it now answers to. */
export async function relinkMeetingRecording(meetingId: string, links: RecordingLinks, externalId: string) {
  return companyOs
    .from("meetings")
    .update({ recording_url: links.recordingUrl, minutes_url: links.minutesUrl, external_id: externalId })
    .eq("id", meetingId);
}
