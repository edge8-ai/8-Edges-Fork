"use server";

import { revalidatePath } from "next/cache";
import type { CompanyOsUpdate } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { APPLICATION_SOURCES } from "@/entities/hiring/lib/recruiting-options";
import { changeApplicationByHand } from "./hand-decision";

// updateApplication moved out of routes/(dashboard)/talent/applications/actions.ts
// because ApplicantStatusSelect — shared hiring UI rendered from several admin
// pages — calls it, and shared UI must not depend on a route. Only this action
// and the two constants it alone used moved; the rest of that route file
// (stages, extras, notes, resumes, the candidate pool) stays there.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const fields: CompanyOsUpdate<"applications"> = {};

  if (patch.status !== undefined && !APP_STATUSES.has(patch.status)) return { ok: false, error: "Unknown status." };
  if (patch.rating !== undefined) {
    if (patch.rating === null) fields.rating = null;
    else {
      const n = Math.round(patch.rating);
      if (n < 1 || n > 5) return { ok: false, error: "Rating must be between 1 and 5." };
      fields.rating = n;
    }
  }
  if (patch.rejection_reason !== undefined) {
    fields.rejection_reason = patch.rejection_reason?.trim() || null;
  }
  if (patch.hr_assessment !== undefined) {
    fields.hr_assessment = patch.hr_assessment?.trim() || null;
  }
  if (patch.source !== undefined) {
    const s = patch.source?.trim() || null;
    if (s && !APPLICATION_SOURCES.has(s)) return { ok: false, error: "Unknown source." };
    // `applications.source` is NOT NULL, but clearing the field here has always
    // sent a null (PostgREST then rejects it). Cast rather than change what the
    // action does.
    fields.source = s as string;
  }
  if (patch.source_detail !== undefined) {
    fields.source_detail = patch.source_detail?.trim() || null;
  }
  if (patch.referrer_person_id !== undefined) {
    fields.referrer_person_id = patch.referrer_person_id?.trim() || null;
  }
  if (patch.applied_at !== undefined) {
    const d = patch.applied_at?.trim() || null;
    if (d && !DATE_RE.test(d)) return { ok: false, error: "Enter a valid applied date." };
    // `applications.applied_at` is NOT NULL; same note as `source` above.
    fields.applied_at = d as string;
  }
  let decidedAt: string | null | undefined;
  if (patch.decided_at !== undefined) {
    const d = patch.decided_at?.trim() || null;
    if (d && !DATE_RE.test(d)) return { ok: false, error: "Enter a valid decided date." };
    decidedAt = d;
  }

  // The status, the stage and the decision date are the decision, and the
  // hiring chain's rule, the stage log, the hire, the audit, the chain run and
  // the interviews follow from them in the one module every surface uses.
  const res = await changeApplicationByHand(
    applicationId,
    { status: patch.status, stageId: patch.current_stage_id, decidedAt, fields },
    { personId: personId ?? null, email: admin.email ?? "unknown" },
  );
  revalidatePath("/admin/talent/applications");
  // The detail route is now a name+short-code slug, so revalidate the dynamic
  // segment itself (the raw-uuid path would no longer match the rendered slug).
  revalidatePath("/admin/talent/applications/[id]", "page");
  if (!res.ok) return { ok: false, error: res.error };
  return res;
}
