"use server";

import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { logStageMove } from "@/entities/hiring/lib/ats/stage-log";
import { APPLICATION_SOURCES } from "@/entities/hiring/lib/recruiting-options";

// updateApplication moved out of routes/(dashboard)/talent/applications/actions.ts
// because ApplicantStatusSelect — shared hiring UI rendered from several admin
// pages — calls it, and shared UI must not depend on a route. Only this action
// and the two constants it alone used moved; the rest of that route file
// (stages, extras, notes, resumes, the candidate pool) stays there.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

import { cancelScheduledInterviews } from "./interviews-writes";
import { announceCandidateHired, applicationForHire, candidateHiredFact } from "./hire-events";
import { directDecisionRefusal } from "./chain/direct-decision";
import { closeChainForDecided } from "./chain/close";

// Statuses after which no interview will be held. hired and rejected are the
// decisions; withdrawn is the candidate's — no decision to stamp, but nothing
// left to schedule either (verifier note on C.23).
const NO_MORE_INTERVIEWS = new Set(["hired", "rejected", "withdrawn"]);

// Matches the applications_status_check constraint.
const APP_STATUSES = new Set([
  "active",
  "on_hold",
  "passive",
  "withdrawn",
  "hired",
  "rejected",
  "future_consideration",
]);

// Only keys present in the patch are written. Rejection reason is its own field,
// distinct from the notes thread. Moving onto a terminal stage stamps decided_at
// (the recruiter still sets final status), mirroring moveApplicationStage.
export type ApplicationPatch = {
  status?: string;
  rating?: number | null;
  rejection_reason?: string | null;
  current_stage_id?: string | null;
  hr_assessment?: string | null;
  source?: string | null;
  source_detail?: string | null;
  referrer_person_id?: string | null;
  applied_at?: string | null;
  decided_at?: string | null;
};

// The ok result carries decided_at back when a terminal-stage move auto-stamps
// it, so the client can reconcile a field the user did not type into.
type UpdateApplicationResult = { ok: true; decidedAt?: string | null } | { ok: false; error: string };

export async function updateApplication(
  applicationId: string,
  patch: ApplicationPatch,
): Promise<UpdateApplicationResult> {
  const { user: admin, personId } = await requirePermission("hiring.ats");
  const updates: CompanyOsUpdate<"applications"> = {};

  if (patch.status !== undefined) {
    if (!APP_STATUSES.has(patch.status)) return { ok: false, error: "Unknown status." };
    // In a live hiring chain a hire or a rejection is proposed, not set (Z.9).
    if (patch.status === "hired" || patch.status === "rejected") {
      const refused = await directDecisionRefusal(applicationId);
      if (refused) return { ok: false, error: refused };
    }
    updates.status = patch.status;
    // A status alone can also be the decision: hired and rejected stamp it when
    // the caller set neither the date nor a stage in the same patch (hiring
    // sweep: status and stage could disagree, with decided_at following only
    // the stage). Other statuses leave it alone — on_hold or withdrawn on a
    // candidate already in a terminal stage is not an un-decision.
    if (
      patch.decided_at === undefined &&
      patch.current_stage_id === undefined &&
      (patch.status === "hired" || patch.status === "rejected")
    ) {
      updates.decided_at = new Date().toISOString();
    }
  }
  if (patch.rating !== undefined) {
    if (patch.rating === null) updates.rating = null;
    else {
      const n = Math.round(patch.rating);
      if (n < 1 || n > 5) return { ok: false, error: "Rating must be between 1 and 5." };
      updates.rating = n;
    }
  }
  if (patch.rejection_reason !== undefined) {
    updates.rejection_reason = patch.rejection_reason?.trim() || null;
  }
  if (patch.hr_assessment !== undefined) {
    updates.hr_assessment = patch.hr_assessment?.trim() || null;
  }
  if (patch.source !== undefined) {
    const s = patch.source?.trim() || null;
    if (s && !APPLICATION_SOURCES.has(s)) return { ok: false, error: "Unknown source." };
    // `applications.source` is NOT NULL, but clearing the field here has always
    // sent a null (PostgREST then rejects it). Cast rather than change what the
    // action does.
    updates.source = s as string;
  }
  if (patch.source_detail !== undefined) {
    updates.source_detail = patch.source_detail?.trim() || null;
  }
  if (patch.referrer_person_id !== undefined) {
    updates.referrer_person_id = patch.referrer_person_id?.trim() || null;
  }
  if (patch.applied_at !== undefined) {
    const d = patch.applied_at?.trim() || null;
    if (d && !DATE_RE.test(d)) return { ok: false, error: "Enter a valid applied date." };
    // `applications.applied_at` is NOT NULL; same note as `source` above.
    updates.applied_at = d as string;
  }
  if (patch.decided_at !== undefined) {
    const d = patch.decided_at?.trim() || null;
    if (d && !DATE_RE.test(d)) return { ok: false, error: "Enter a valid decided date." };
    updates.decided_at = d;
  }
  // Captured when the stage changes, so the move can be logged after the write.
  let stageMove: { from: string | null; to: string | null } | null = null;
  if (patch.current_stage_id !== undefined) {
    const { data: cur, error: curErr } = await companyOs.from("applications").select("current_stage_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (curErr) return { ok: false, error: curErr.message };
    const from = (cur?.current_stage_id as string | null) ?? null;
    if (patch.current_stage_id === null) {
      updates.current_stage_id = null;
      stageMove = { from, to: null };
    } else {
      const { data: stage, error: stageErr } = await companyOs.from("application_stages").select("is_terminal")
        .eq("id", patch.current_stage_id)
        .maybeSingle();
      if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? "Unknown stage." };
      if (stage.is_terminal) {
        const refused = await directDecisionRefusal(applicationId);
        if (refused) return { ok: false, error: refused };
      }
      updates.current_stage_id = patch.current_stage_id;
      // Same rule as moveApplicationStage: a terminal stage stamps the decision
      // and a non-terminal one clears it, unless the caller set the date itself.
      if (patch.decided_at === undefined) updates.decided_at = stage.is_terminal ? new Date().toISOString() : null;
      stageMove = { from, to: patch.current_stage_id };
    }
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  // Read before the write, and only on a hire: `candidate.hired` is a fact
  // about a transition, so the row as it stands is the only thing that can say
  // whether this write is one (S.2). Re-saving "hired" on somebody hired last
  // month is not a second hire.
  const hired = patch.status === "hired" ? candidateHiredFact(await applicationForHire(applicationId), patch.status) : null;

  const { error } = await companyOs.from("applications").update(updates).eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  if (stageMove) await logStageMove(applicationId, stageMove.from, stageMove.to);
  // Announced after the decision has persisted, never before: the bus awaits
  // its handlers, and onboarding opening a journey for a write the database
  // then refused would invent a new starter.
  await announceCandidateHired(hired, hired ? await personIdForEmailOrNull(admin.email, "hiring/applications") : null);
  await recordAudit({
    table: "applications",
    recordId: applicationId,
    operation: "update",
    actor: admin.email,
    newData: updates,
  });
  revalidatePath("/admin/talent/applications");
  // The detail route is now a name+short-code slug, so revalidate the dynamic
  // segment itself (the raw-uuid path would no longer match the rendered slug).
  revalidatePath("/admin/talent/applications/[id]", "page");
  // A decision, by status or by a terminal stage, cancels the interviews still
  // scheduled. Reported, never fatal: the decision itself has persisted.
  const decided = (patch.status !== undefined && NO_MORE_INTERVIEWS.has(patch.status)) || updates.decided_at != null;
  // A hire, rejection or withdrawal set by hand ends the application's hiring
  // chain run, so nothing it drafted or proposed goes out later (Z.9 review).
  const final = patch.status !== undefined && NO_MORE_INTERVIEWS.has(patch.status);
  if (final || (stageMove && updates.decided_at != null)) {
    await closeChainForDecided(applicationId, patch.status ?? "a final stage", { personId: personId ?? null, email: admin.email ?? "unknown" });
  }
  if (decided) {
    const cancelled = await cancelScheduledInterviews(applicationId);
    if (!cancelled.ok) return { ok: false, error: `Saved, but the scheduled interviews could not be cancelled: ${cancelled.error}` };
  }
  // Surface decided_at whenever this write set it (terminal-stage auto-stamp or a
  // manual date edit), so the caller can keep its form in sync without a reload.
  return Object.prototype.hasOwnProperty.call(updates, "decided_at")
    ? { ok: true, decidedAt: (updates.decided_at as string | null) ?? null }
    : { ok: true };
}
