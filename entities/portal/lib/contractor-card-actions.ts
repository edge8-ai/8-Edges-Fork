"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { SUBJECT_CONTRACTOR_WORK, selectTasks, type HoursReport } from "@/entities/boards";
import { loadSubmittableRequest, submitContractorWork, type SubmitResult } from "./contractor-work-submit";

// A request that is already handed in (from the /work link, say) has its
// hours; the card may land without asking twice.
const ALREADY_REPORTED = ["work_submitted", "completed"];

// The Contractors board's hours prompt (CardHoursDialog): the contractor drags
// their card to Done, says how long it took, and that is their work submission.
// The team session is the credential here, where the /work page's is the token,
// so the only person who may answer is the contractor the request is for.
export async function reportContractorHours(taskId: string, report: HoursReport): Promise<SubmitResult> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();

  const { data: card, error: cardErr } = await selectTasks("subject_type, subject_id").eq("id", taskId).maybeSingle();
  if (cardErr) return { ok: false, error: "Couldn't read the card. Please try again." };
  if (!card || card.subject_type !== SUBJECT_CONTRACTOR_WORK || !card.subject_id)
    return { ok: false, error: "This card is not linked to a work request." };

  const req = await loadSubmittableRequest({ id: card.subject_id as string });
  if (!req) return { ok: false, error: "The work request for this card no longer exists." };
  if (req.person_id !== actor.personId)
    return { ok: false, error: "Only the contractor on this request can report its hours." };
  if (ALREADY_REPORTED.includes(req.status)) return { ok: true };
  if (req.status !== "approved")
    return { ok: false, error: "The estimate for this work hasn't been approved yet, so it can't be marked done." };

  const submitted = await submitContractorWork(req, report);
  if (!submitted.ok) return submitted;

  revalidatePath("/admin/operations/contractor-requests");
  return { ok: true };
}
