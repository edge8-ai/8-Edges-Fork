// Company-internal group coaching sessions (e.g. a cohort programme), ingested
// from Zoom into company_os.meetings by scripts/crm/zoom-ingest.mjs. Unlike the
// client meeting hub, these are NOT tied to a client company: they are matched
// by source='zoom' and metadata.source_meeting_type='coaching', and carry no
// company_id. Read-only; the transcript and our own actionable summary live on
// the row (summary + metadata.transcript), action items in meeting_action_items.

import { listCurrentTeamPeopleNames } from "@/kernel/identity/team-people";
import { actionItemsOfMeeting, groupCoachingSession, groupCoachingSessions, type GroupSession } from "@/entities/crm";
import { resolveHandles, sessionPeople, type DirectoryName } from "./session-attendance";

export type CoachingSessionRow = {
  id: string;
  title: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  speakers: string[];
  hasSummary: boolean;
};

export type CoachingActionItem = { title: string; detail: string | null; dueDate: string | null };

export type CoachingSessionDetail = CoachingSessionRow & {
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  actionItems: CoachingActionItem[];
};

function toRow(m: GroupSession, directory: DirectoryName[]): CoachingSessionRow {
  return {
    id: m.id,
    title: m.title,
    startedAt: m.started_at,
    durationSeconds: m.duration_seconds,
    speakers: resolveHandles(sessionPeople(m.metadata), directory),
    hasSummary: Boolean(m.summary),
  };
}

// Zoom records handles, not people. The directory is read once per page so a
// handle that is a team member shows their name (see resolveHandles). It is
// current team members only: `people` also holds client contacts, and a client's
// name must never land on a team page by a coincidence of first names.
async function readDirectory(): Promise<DirectoryName[]> {
  try {
    return await listCurrentTeamPeopleNames();
  } catch (error) {
    // A failed read is an empty directory, never a wider one: handles show as Zoom wrote them.
    console.error("[team/coaching-sessions] team people", error);
    return [];
  }
}

export async function listCoachingSessions(): Promise<CoachingSessionRow[]> {
  const { data, error: listError } = await groupCoachingSessions();
  if (listError) console.error("[team/coaching-sessions] meetings", listError);
  const directory = await readDirectory();
  return (data ?? []).map((m) => toRow(m, directory));
}

export async function getCoachingSession(id: string): Promise<CoachingSessionDetail | null> {
  const { data, error: sessionError } = await groupCoachingSession(id);
  if (sessionError) console.error("[team/coaching-sessions] meetings", sessionError);
  if (!data) return null;
  const m = data;

  const { data: ai, error: actionError } = await actionItemsOfMeeting(id);
  if (actionError) console.error("[team/coaching-sessions] meeting_action_items", actionError);
  const actionItems = (ai ?? []).map(
    (a) => ({ title: a.title, detail: a.detail, dueDate: a.due_date }),
  );

  return {
    ...toRow(m, await readDirectory()),
    summary: m.summary,
    transcript: m.metadata?.transcript ?? null,
    recordingUrl: m.recording_url,
    actionItems,
  };
}
