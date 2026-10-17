import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { selectAiPrograms } from "@/entities/client-programs";
import { getClientMeetingsForActor } from "@/entities/team/lib/hub-clients";
import { MeetingsPanel, type ProgramOption } from "@/entities/crm";
import { companyOs } from "@/kernel/data/supabase";
import { publishMeeting, setMeetingProgram } from "./actions";

export const metadata = { title: "Client Meetings" };

// The Meetings tab: every meeting for this client. Team members are internal
// Edge8 staff, so they see drafts and published alike, can publish a meeting
// to the client (setMeetingPublished, actor-scoped), and can tag a meeting to
// one of the client's AI Programs. Clients only ever see the published ones
// on /portal. Every meeting shows here, tagged ones with their program in
// the picker; a tagged meeting shows on its AI Program page as well. The
// title opens the recap at /team/clients/[companyId]/meetings/[id].
export default async function TeamClientMeetingsTab(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  const meetings = await getClientMeetingsForActor(actor, params.companyId);
  if (meetings === null) notFound();

  const { data: programRows, error: programsError } = await selectAiPrograms("id, name")
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false });
  if (programsError) console.error("[team/hub-meetings] ai_programs", programsError);
  const programOptions = (programRows ?? []) as ProgramOption[];

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title u-mb-3">Meetings</h2>
      <MeetingsPanel
        meetings={meetings}
        publishAction={publishMeeting}
        programAction={setMeetingProgram}
        programOptions={programOptions}
        detailBasePath={`/team/clients/${params.companyId}/meetings`}
      />
    </section>
  );
}
