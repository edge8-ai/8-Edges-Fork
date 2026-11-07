"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { programInCompany } from "@/entities/client-programs";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getActorClientCompanies } from "@/entities/team/lib/hub-clients";
import { recordAudit } from "@/kernel/audit/audit";
import { liveMeetingCompany, publishMeetingNotes, tagMeetingProgram } from "@/entities/crm";

type Result = { ok: boolean; error?: string };

// Publish / unpublish a client meeting from the team hub. Authorization is
// re-derived server-side from the actor's active assignments and cross-checked
// against the meeting's own company_id, so the id from the client is never
// trusted. Mirrors the admin setMeetingPublished, actor-scoped instead.
export async function publishMeeting(id: string, published: boolean): Promise<Result> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();

  const { data: row, error: rowError } = await liveMeetingCompany(id);
  if (rowError) console.error("[team/hub-meetings] meetings", rowError);
  const companyId = row?.company_id;
  if (!companyId) return { ok: false, error: "Meeting not found." };

  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === companyId)) return { ok: false, error: "Not found." };

  const { error } = await publishMeetingNotes(id, published);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "meetings",
    recordId: id,
    operation: "update",
    actor: actor.displayName,
    context: { action: "set_published", published },
  });

  revalidatePath(`/team/clients/${companyId}/meetings`);
  revalidatePath("/portal/hub");
  return { ok: true };
}

// Tag a client meeting to one of its company's AI Programs, or clear the tag
// (programId null = company-wide). Same actor-scoped authorization as
// publishMeeting; the program must belong to the meeting's own company
// (mirroring programBelongs in the admin client-roadmaps actions).
export async function setMeetingProgram(id: string, programId: string | null): Promise<Result> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();

  const { data: row, error: meetingError } = await liveMeetingCompany(id);
  if (meetingError) console.error("[team/hub-meetings] meetings", meetingError);
  const companyId = row?.company_id;
  if (!companyId) return { ok: false, error: "Meeting not found." };

  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === companyId)) return { ok: false, error: "Not found." };

  if (programId) {
    const answer = await programInCompany(programId, companyId);
    if (!answer.ok) console.error("[team/hub-meetings] ai_programs", answer.error);
    if (!answer.ok || !answer.program) return { ok: false, error: "Invalid AI Program." };
  }

  const { error } = await tagMeetingProgram(id, programId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "meetings",
    recordId: id,
    operation: "update",
    actor: actor.displayName,
    context: { action: "set_program", ai_program_id: programId },
  });

  revalidatePath(`/team/clients/${companyId}/meetings`);
  revalidatePath("/portal/hub");
  return { ok: true };
}
