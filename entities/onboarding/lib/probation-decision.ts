// Recording a probation decision — offer full time, extend by thirty days, or
// terminate — with its emails and audit rows. Split out of cycle.ts, which
// runs the daily clock; a decision is a person's act, not the clock's, and the
// two guards it carries (once only, and only on probation) came from the
// onboarding sweep of 2026-09-12.
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { recordAudit } from "@/kernel/audit/audit";
import { one } from "@/kernel/config/embedded";
import { addDays } from "@/kernel/config/dates";
import { updateTeamMembers } from "@/kernel/identity/writes";
import { TALENT_DIRECTOR_EMAIL } from "./cycle-constants";
import { ensureJourney, patchJourney, type CycleDecision, type PersonEmbed } from "./cycle";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

// Record a manager's probation decision and apply its consequences. The caller
// authorizes the decider (the /team/probation page checks manager/admin/talent
// via requireTeamMember, replacing the old public survey's email check), so
// this core just applies the decision. Termination is never executed by the
// system — it notifies the talent director and stops.
export async function applyProbationDecision(input: {
  subjectTeamMemberId: string;
  decision: CycleDecision;
  decidedByTmId: string | null;
  actorEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const decision = input.decision;

  const { data: tmData, error: subjectError } = await companyOs
    .from("team_members")
    .select(
      `id, person_id, manager_id, start_date, probation_ends_on, employment_stage, people:people!person_id(${NAME_COLUMNS})`,
    )
    .eq("id", input.subjectTeamMemberId)
    .maybeSingle();
  if (subjectError) return { ok: false, error: subjectError.message };
  if (!tmData) return { ok: false, error: "Team member not found." };
  const tm = tmData as unknown as Record<string, unknown>;
  // A probation decision is for someone on probation. Recording one for a
  // person already promoted re-applied it — another 30-day extension, a
  // second termination email (onboarding sweep).
  if (tm.employment_stage !== "probation") {
    return { ok: false, error: "This person is not on probation, so there is no decision to record." };
  }
  const subjectName = personName(one(tm.people as PersonEmbed | PersonEmbed[] | null), "—");

  await ensureJourney(input.subjectTeamMemberId);
  const { data: journeyData, error: journeyError } = await companyOs
    .from("onboarding_plans")
    .select("id, decision, decision_at")
    .eq("team_member_id", input.subjectTeamMemberId)
    .maybeSingle();
  if (journeyError) return { ok: false, error: journeyError.message };
  const journey = journeyData as { id: string; decision: string | null; decision_at: string | null } | null;
  const journeyId = journey?.id;
  if (!journeyId) return { ok: false, error: "No onboarding record for this person." };
  // Once. A second submission — a double-click, a second tab, a retry after a
  // slow response — must not overwrite the decision or fire its side effects
  // again. Changing a recorded decision is a deliberate act for an admin.
  if (journey.decision) {
    return { ok: false, error: `A decision (${journey.decision}) was already recorded on ${journey.decision_at?.slice(0, 10) ?? "an earlier date"}.` };
  }

  const respondent = input.actorEmail.trim().toLowerCase();
  const decidedBy = input.decidedByTmId;

  if (decision === "extend_probation_30") {
    const start = (tm.start_date as string | null) ?? null;
    const currentEnd =
      ((tm.probation_ends_on as string | null) ?? null) ?? (start ? addDays(start, 59) : null);
    if (currentEnd) {
      const newEnd = addDays(currentEnd, 30);
      const { error } = await updateTeamMembers({ probation_ends_on: newEnd, contract_start_date: addDays(newEnd, 1) })
        .eq("id", input.subjectTeamMemberId);
      if (error) {
        console.error("[onboarding-cycle] extension update failed:", error.message);
        return { ok: false, error: "Could not extend probation." };
      }
      await recordAudit({
        table: "team_members",
        recordId: input.subjectTeamMemberId,
        operation: "update",
        actor: respondent,
        context: { action: "probation_extended_30", new_end: newEnd },
      });
    }
    // Re-arm the review for the new window: the next review email fires 15
    // days before the new probation end.
    const rearmed = await patchJourney(journeyId, {
      decision: null,
      decision_at: null,
      decision_by: null,
      day45_email_sent_at: null,
    });
    // The probation is extended, but the next review email will not fire
    // until this lands; say so rather than report the extension as complete.
    if (!rearmed.ok) return { ok: false, error: "Probation extended, but the next review could not be scheduled. Try again." };
    return { ok: true };
  }

  const recorded = await patchJourney(journeyId, {
    decision,
    decision_at: new Date().toISOString(),
    decision_by: decidedBy,
  });
  if (!recorded.ok) return { ok: false, error: "Could not record the decision. Nothing was sent; try again." };
  await recordAudit({
    table: "onboarding_plans",
    recordId: journeyId,
    operation: "update",
    actor: respondent,
    context: { action: "probation_decision", decision },
  });

  if (decision === "terminate") {
    await sendTransactionalEmail({
      to: TALENT_DIRECTOR_EMAIL,
      subject: `Probation decision — terminate: ${subjectName}`,
      html:
        `<p>The manager recorded a <strong>terminate</strong> decision for <strong>${subjectName}</strong> on their probation review.</p>` +
        `<p>Nothing is automated for termination — please run the off-boarding process manually.</p>`,
      logMeta: { source: "onboarding-cycle", kind: "terminate_notice" },
    });
  }
  return { ok: true };
}
