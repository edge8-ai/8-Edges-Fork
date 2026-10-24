// Client-visible meeting notes. A dedicated, reviewed helper — same discipline
// as entities/portal/lib/invoices.ts.
//
// These are client meetings in the central company_os.meetings table, scoped to
// the actor's company. The meeting date is stored in started_at and the
// client-facing summary in `summary`.
//
// VISIBILITY: meetings are for client managers. A portal ADMIN (manager) sees
// all of their company's meetings (draft and published); a non-admin member
// sees only PUBLISHED ones (published_at not null), so publishing is how a
// meeting reaches the rest of the client team.
//
// PRIVACY HARD LINE: the raw transcript (call_transcripts) is NEVER joined here
// (it is admin-only). The client sees date / attendees / title / summary only.

import { companyOs } from "@/kernel/data/supabase";
import { anyMeetingOfCompanies, anyPublishedMeetingOfCompanies, clientMeetingNote, clientMeetingNotes, type ClientMeetingNote } from "@/entities/crm";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { adminCompanyScope } from "@/entities/portal/lib/roles";
import { one } from "@/kernel/config/embedded";

export type PortalMeeting = {
  id: string;
  meetingDate: string | null;
  title: string | null;
  attendees: string[];
  summary: string | null;
  publishedAt: string | null;
  // AI Program tag; null = company-wide. The id lets the hub and program
  // pages split company-wide from program-tagged rows.
  aiProgramId: string | null;
  aiProgramName: string | null;
};

const toMeeting = (r: ClientMeetingNote): PortalMeeting => ({
  id: r.id,
  meetingDate: r.started_at ? r.started_at.slice(0, 10) : null,
  title: r.title,
  attendees: r.attendees ?? [],
  summary: r.summary,
  publishedAt: r.published_at,
  aiProgramId: r.ai_program_id,
  aiProgramName: one(r.ai_program)?.name ?? null,
});

export async function hasMeetings(actor: PortalActor): Promise<boolean> {
  if (actor.companyScope.length === 0) return false;
  const managerScope = adminCompanyScope(actor);
  // Managers get the meetings surface whenever any meeting exists for their
  // company; other members only when a published one does.
  if (managerScope.length > 0) {
    const { data, error: meetingsError } = await anyMeetingOfCompanies(managerScope);
    if (meetingsError) console.error("[portal] meetings read failed:", meetingsError.message);
    if ((data ?? []).length > 0) return true;
  }
  const { data, error: publishedErr } = await anyPublishedMeetingOfCompanies(actor.companyScope);
  if (publishedErr) console.error("[portal/meetings] meetings", publishedErr);
  return (data ?? []).length > 0;
}

// One meeting for the portal detail page. A manager may open any of their
// company's meetings; a non-manager only a published one. companyScope is part
// of the query, so an id from another client never resolves.
export async function getMeetingForActor(actor: PortalActor, id: string): Promise<PortalMeeting | null> {
  if (actor.companyScope.length === 0) return null;
  const managerScope = new Set(adminCompanyScope(actor));

  const { data, error: meetingsError2 } = await clientMeetingNote(id, actor.companyScope);
  if (meetingsError2) console.error("[portal] meetings read failed:", meetingsError2.message);

  if (!data) return null;
  const r = data;
  if (r.published_at === null && !managerScope.has(r.company_id)) return null;
  return toMeeting(r);
}

export async function getMeetingsForActor(actor: PortalActor): Promise<PortalMeeting[]> {
  if (actor.companyScope.length === 0) return [];
  const managerScope = new Set(adminCompanyScope(actor));

  const { data, error: meetingsError3 } = await clientMeetingNotes(actor.companyScope);
  if (meetingsError3) console.error("[portal] meetings read failed:", meetingsError3.message);

  return (data ?? [])
    .filter((r) => r.published_at !== null || managerScope.has(r.company_id))
    .map(toMeeting);
}
