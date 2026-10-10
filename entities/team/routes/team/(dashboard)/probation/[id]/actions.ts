"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  applyProbationDecision,
  DECISION_BY_CHOICE,
  TALENT_DIRECTOR_EMAIL,
} from "@/entities/onboarding";

// Record a probation decision from the auth-gated /team/probation page. This
// replaces the old public probation-45 survey: authorization happens here (the
// actor must be the subject's manager, an admin, or the talent director), so
// applyProbationDecision just applies it. The choice string must be one of
// DECISION_BY_CHOICE's keys.
export type DecisionResult = { ok: true; message: string } | { ok: false; error: string };

// Whether `actor` may decide `subjectTeamMemberId`'s probation. Shared by the
// page (to render) and this action (to authorize the write).
export async function canDecideProbation(
  actor: { teamMemberId: string; personId: string; isAdmin: boolean },
  subjectManagerId: string | null,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (subjectManagerId && subjectManagerId === actor.teamMemberId) return true;
  // Talent director (by email on the actor's person row).
  const { data, error: emailError } = await companyOs
    .from("people")
    .select("email")
    .eq("id", actor.personId)
    .maybeSingle();
  if (emailError) console.error("[team/probation] people", emailError);
  return (data?.email ?? "").toLowerCase() === TALENT_DIRECTOR_EMAIL;
}

export async function recordProbationDecisionAction(
  subjectTeamMemberId: string,
  choice: string,
): Promise<DecisionResult> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const decision = DECISION_BY_CHOICE[choice];
  if (!decision) return { ok: false, error: "Unknown decision." };

  const { data: subject, error: subjectError } = await companyOs
    .from("team_members")
    .select("id, manager_id, employment_stage")
    .eq("id", subjectTeamMemberId)
    .maybeSingle();
  if (subjectError) console.error("[team/probation] team_members", subjectError);
  if (!subject) return { ok: false, error: "Team member not found." };
  if (!(await canDecideProbation(actor, subject.manager_id as string | null)))
    return { ok: false, error: "You are not authorized to decide this probation." };

  const { data: actorPerson, error: actorEmailError } = await companyOs
    .from("people")
    .select("email")
    .eq("id", actor.personId)
    .maybeSingle();
  if (actorEmailError) console.error("[team/probation] people", actorEmailError);
  const actorEmail = actorPerson?.email ?? "";

  const res = await applyProbationDecision({
    subjectTeamMemberId,
    decision,
    decidedByTmId: actor.teamMemberId,
    actorEmail,
  });
  if (!res.ok) return res;

  revalidatePath(`/team/probation/${subjectTeamMemberId}`);
  const label =
    decision === "offer_full_time"
      ? "Offered full time. They are promoted when probation ends."
      : decision === "extend_probation_30"
        ? "Probation extended 30 days. Dates moved automatically."
        : "Termination recorded. The talent director has been notified to run offboarding.";
  return { ok: true, message: label };
}
