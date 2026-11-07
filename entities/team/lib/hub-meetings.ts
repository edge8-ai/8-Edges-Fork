import type { TeamActor } from "@/kernel/identity/team-auth";
import { getMeeting, type AdminMeeting } from "@/entities/crm";
import { getActorClientCompanies } from "@/entities/team/lib/hub-clients";

// One meeting's recap for an assigned client. The meeting must belong to the
// company in the URL and that company must be in the actor's active
// assignment set; anything else resolves to null and the page 404s.
export async function getClientMeetingForActor(
  actor: TeamActor,
  companyId: string,
  meetingId: string,
): Promise<AdminMeeting | null> {
  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === companyId)) return null;
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.companyId !== companyId) return null;
  return meeting;
}
