"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { upsertCandidateSalary, type SalaryInput } from "@/entities/hiring/lib/candidate-sensitive";
import { logStageMove } from "@/entities/hiring/lib/ats/stage-log";
import { APPLICATION_SOURCES, POOL_STATUSES } from "@/entities/hiring/lib/recruiting-options";
import type { AiScreenSummary } from "@/entities/hiring/lib/resume-screen";
import { insertDocuments, updatePeople } from "@/kernel/identity/writes";
import { insertInteractions } from "@/kernel/messaging/writes";
import { one } from "@/kernel/config/embedded";
import { parseLinkInput, LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";
import type { Result } from "@/kernel/data/result";
import { legalName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { closeChainForArchived } from "@/entities/hiring/lib/chain/close";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export type StageOption = { id: string; name: string; isTerminal: boolean };
export type AppNote = {
  id: string;
  kind: string;
  body: string | null;
  occurredAt: string | null;
  author: string | null;
};

// The hiring stages belong to the application's job req, so the drawer loads
// them lazily when it opens (the flat list spans many reqs).
export async function getApplicationStages(
  jobReqId: string,
): Promise<{ ok: true; stages: StageOption[] } | { ok: false; error: string }> {
  await requirePermission("hiring.ats");
  const { data, error } = await companyOs.from("application_stages").select("id, name, is_terminal, position")
    .eq("job_requisition_id", jobReqId)
    .order("position");
  if (error) return { ok: false, error: error.message };
  const stages: StageOption[] = (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isTerminal: Boolean(s.is_terminal),
  }));
  return { ok: true, stages };
}

export type ApplicationExtras = {
  coverLetter: string | null;
  answers: { q: string; a: string }[];
  aiRating: number | null;
  aiStatus: string | null;
  aiError: string | null;
  aiScreenedAt: string | null;
  aiSummary: AiScreenSummary | null;
};

// Cover letter + free-form answers are large per-application columns shown only
// in the manage drawer, so they load lazily on open instead of shipping with the
// whole applications list (mirrors getApplicationStages / the lazy resume load).
export async function getApplicationExtras(
  applicationId: string,
): Promise<{ ok: true; extras: ApplicationExtras } | { ok: false; error: string }> {
  await requirePermission("hiring.ats");
  const { data, error } = await companyOs.from("applications").select("cover_letter, answers, ai_rating, ai_screen_status, ai_screen_error, ai_screened_at, ai_summary")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    extras: {
      coverLetter: (data?.cover_letter as string | null) ?? null,
      answers: Array.isArray(data?.answers) ? (data.answers as { q: string; a: string }[]) : [],
      aiRating: (data?.ai_rating as number | null) ?? null,
      aiStatus: (data?.ai_screen_status as string | null) ?? null,
      aiError: (data?.ai_screen_error as string | null) ?? null,
      aiScreenedAt: (data?.ai_screened_at as string | null) ?? null,
      aiSummary: (data?.ai_summary as AiScreenSummary | null) ?? null,
    },
  };
}

// Soft-archive: a recruiter "deletes" a duplicate or wrong-person application by
// archiving it (reversible) rather than a hard delete, so nothing is lost. The
// list hides archived rows by default and the full-page profile offers Restore.
export async function archiveApplication(applicationId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("hiring.ats");
  const { error } = await companyOs.from("applications").update({ archived_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "applications",
    recordId: applicationId,
    operation: "update",
    actor: admin.email,
    newData: { archived_at: "now" },
  });
  await closeChainForArchived(applicationId, { personId, email: admin.email ?? "unknown" }); // Z.9: leaves the hiring chain
  revalidatePath("/admin/talent/applications");
  // The detail route is now a name+short-code slug, so revalidate the dynamic
  // segment itself (the raw-uuid path would no longer match the rendered slug).
  revalidatePath("/admin/talent/applications/[id]", "page");
  return { ok: true };
}

export async function unarchiveApplication(applicationId: string): Promise<Result> {
  const { user: admin } = await requirePermission("hiring.ats");
  const { error } = await companyOs.from("applications").update({ archived_at: null }).eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "applications",
    recordId: applicationId,
    operation: "update",
    actor: admin.email,
    newData: { archived_at: null },
  });
  revalidatePath("/admin/talent/applications");
  // The detail route is now a name+short-code slug, so revalidate the dynamic
  // segment itself (the raw-uuid path would no longer match the rendered slug).
  revalidatePath("/admin/talent/applications/[id]", "page");
  return { ok: true };
}

// Profile edits from the application shelf. Identity fields (phone, LinkedIn)
// are person attributes and write to people; recruiting-profile fields
// (headline, title, portfolio, do_not_hire) live on the candidate_profile
// satellite and upsert there. do_not_hire is the recruiting flag ("would we
// look at them again?"), kept strictly separate from do_not_contact (consent
// opt-out), which this action never touches.
export type ApplicantProfilePatch = {
  headline?: string | null;
  current_title?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  do_not_hire?: boolean;
  pool_status?: string | null;
  // Recruiter overrides for the fields the AI extracts from the resume. Shown in
  // place of the AI value once set; persist across the person's applications.
  english_proficiency?: string | null;
  salary_expectation_cents?: number | null;
  salary_expectation_currency?: string | null;
  notice_period?: string | null;
};

export async function updateApplicantProfile(personId: string, patch: ApplicantProfilePatch): Promise<Result> {
  const access = await requirePermission("hiring.ats");
  const admin = access.user;
  const personUpdates: Record<string, unknown> = {};
  const profileUpdates: Record<string, unknown> = {};

  if (patch.linkedin_url !== undefined) {
    const link = parseLinkInput(patch.linkedin_url);
    if (!link.ok) return { ok: false, error: LINKEDIN_NOT_A_LINK };
    personUpdates.linkedin_url = link.value;
  }
  if (patch.phone !== undefined) personUpdates.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) {
    const e = patch.email?.trim() || null;
    if (e && !EMAIL_RE.test(e)) return { ok: false, error: "Enter a valid email." };
    personUpdates.email = e;
  }
  if (patch.city !== undefined) personUpdates.city = patch.city?.trim() || null;
  if (patch.country !== undefined) personUpdates.country = patch.country?.trim() || null;
  if (patch.pool_status !== undefined) {
    const s = patch.pool_status?.trim() || null;
    if (s && !POOL_STATUSES.has(s)) return { ok: false, error: "Unknown pool status." };
    profileUpdates.pool_status = s;
  }
  if (patch.headline !== undefined) profileUpdates.headline = patch.headline?.trim() || null;
  if (patch.current_title !== undefined) profileUpdates.current_title = patch.current_title?.trim() || null;
  if (patch.portfolio_url !== undefined) {
    const link = parseLinkInput(patch.portfolio_url);
    if (!link.ok) return { ok: false, error: "Portfolio isn't a web link. Paste the full address." };
    profileUpdates.portfolio_url = link.value;
  }
  if (patch.do_not_hire !== undefined) profileUpdates.do_not_hire = patch.do_not_hire;
  if (patch.english_proficiency !== undefined)
    profileUpdates.english_proficiency = patch.english_proficiency?.trim() || null;
  if (patch.notice_period !== undefined) profileUpdates.notice_period = patch.notice_period?.trim() || null;

  // Salary is sensitive: it is stored on candidate_sensitive (super-admin-only),
  // never on candidate_profile. Writing it needs people.pay (ADR 0014), which
  // Super Admin holds by declaration; opening the ATS is not enough on its own.
  const salaryPatch: SalaryInput = {};
  if (patch.salary_expectation_cents !== undefined)
    salaryPatch.salary_expectation_cents = patch.salary_expectation_cents;
  if (patch.salary_expectation_currency !== undefined)
    salaryPatch.salary_expectation_currency = patch.salary_expectation_currency;
  const hasSalary = Object.keys(salaryPatch).length > 0;
  if (hasSalary && !access.may("people.pay")) return { ok: false, error: "Not authorized." };

  if (
    Object.keys(personUpdates).length === 0 &&
    Object.keys(profileUpdates).length === 0 &&
    !hasSalary
  ) {
    return { ok: true };
  }

  if (Object.keys(personUpdates).length > 0) {
    const { error } = await updatePeople(personUpdates).eq("id", personId);
    if (error) {
      const msg = /duplicate|unique/i.test(error.message)
        ? "That email is already used by another person."
        : error.message;
      return { ok: false, error: msg };
    }
    await recordAudit({
      table: "people",
      recordId: personId,
      operation: "update",
      actor: admin.email,
      newData: personUpdates,
    });
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await companyOs.from("candidate_profile").upsert(
      { person_id: personId, ...profileUpdates, updated_at: new Date().toISOString() },
      { onConflict: "person_id" },
    );
    if (error) return { ok: false, error: error.message };
    await recordAudit({
      table: "candidate_profile",
      recordId: personId,
      operation: "update",
      actor: admin.email,
      newData: profileUpdates,
    });
  }

  if (hasSalary) {
    const res = await upsertCandidateSalary(personId, salaryPatch, admin.email);
    if (!res.ok) return res;
  }

  revalidatePath("/admin/talent/applications");
  revalidatePath(`/admin/contacts/${personId}`);
  return { ok: true };
}

// Upload (or replace) the resume on an application. The file goes to the same
// private `resumes` bucket the careers form uses; the documents row hangs off
// the application. Replacing links a new document — the old file is kept for
// the audit trail rather than deleted.
export async function uploadApplicationResume(
  applicationId: string,
  formData: FormData,
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("hiring.ats");

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
  if (file.size > MAX_RESUME_BYTES) return { ok: false, error: "Resume is too large (max 10 MB)." };

  const { data: app, error: aErr } = await companyOs.from("applications").select(`id, person_id, people!person_id(${NAME_COLUMNS})`)
    .eq("id", applicationId)
    .maybeSingle();
  if (aErr || !app) return { ok: false, error: aErr?.message ?? "Application not found." };
  const person = one(app.people);
  // The resume is a record, so its title carries the name on record.
  const personLabel = legalName(person, "applicant");

  const filename = (file.name || "resume.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `admin/${applicationId}/${randomUUID()}-${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from("resumes").upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data: doc, error: dErr } = await insertDocuments({
      title: `Resume — ${personLabel}`,
      storage_path: storagePath,
      mime_type: file.type || null,
      byte_size: file.size,
      entity_type: "application",
      entity_id: applicationId,
    })
    .select("id")
    .single();
  if (dErr || !doc) return { ok: false, error: dErr?.message ?? "Could not save the document." };

  const { error: linkErr } = await companyOs.from("applications").update({ resume_document_id: doc.id })
    .eq("id", applicationId);
  if (linkErr) return { ok: false, error: linkErr.message };

  await recordAudit({
    table: "applications",
    recordId: applicationId,
    operation: "update",
    actor: admin.email,
    newData: { resume_document_id: doc.id, resume_file: filename },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true, documentId: doc.id };
}

// Application notes live in the shared interactions activity log, scoped with
// subject_type='application' + subject_id. Automatic 'status_change' rows are
// hidden so the thread reads as a human note history. Mirrors deal comms.
const AUTO_INTERACTION_KINDS = ["status_change"];

export async function getApplicationNotes(
  applicationId: string,
): Promise<{ ok: true; items: AppNote[] } | { ok: false; error: string }> {
  await requirePermission("hiring.ats");
  const { data, error } = await companyOs
    .from("interactions")
    .select("id, kind, body, occurred_at, metadata")
    .eq("subject_type", "application")
    .eq("subject_id", applicationId)
    .not("kind", "in", `(${AUTO_INTERACTION_KINDS.join(",")})`)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  const items: AppNote[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: (r.kind as string) ?? "note",
    body: (r.body as string | null) ?? null,
    occurredAt: (r.occurred_at as string | null) ?? null,
    author: noteAuthor(r.metadata),
  }));
  return { ok: true, items };
}

// Author display for an interview-results entry. New entries stamp the acting
// admin's name/email into metadata (see addApplicationNote); older entries have
// no author and render without one.
function noteAuthor(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const name = typeof m.author_name === "string" ? m.author_name.trim() : "";
  const email = typeof m.author_email === "string" ? m.author_email.trim() : "";
  return name || email || null;
}

export async function addApplicationNote(
  applicationId: string,
  body: string,
): Promise<{ ok: true; item: AppNote } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("hiring.ats");

  const text = body.trim();
  if (!text) return { ok: false, error: "Write something before saving." };

  // Copy the applicant's person onto the log entry so the note also lands on
  // the contact's 360 timeline (which filters interactions by person_id).
  const { data: app, error: aErr } = await companyOs.from("applications").select("person_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (aErr || !app) return { ok: false, error: aErr?.message ?? "Application not found." };

  // Interview Results are multi-author: stamp who wrote each entry so the thread
  // reads as attributed feedback. Admins may not have a people row, so the email
  // is the reliable identity; use their display name when one exists.
  // Only the note's display author, so a failed lookup falls back to null
  // rather than losing the note the admin just typed.
  const { data: person, error: personErr } = await companyOs.from("people").select(NAME_COLUMNS).eq("email", admin.email).maybeSingle();
  if (personErr) console.error("[talent/applications] author lookup failed:", personErr.message);
  const authorName = personName(person as NamedPerson | null, null);

  const occurredAt = new Date().toISOString();
  const { data, error } = await insertInteractions({
      kind: "note",
      body: text,
      person_id: app.person_id,
      subject_type: "application",
      subject_id: applicationId,
      occurred_at: occurredAt,
      metadata: { source: "application_profile", author_email: admin.email, author_name: authorName },
    })
    .select("id, kind, body, occurred_at")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/talent/applications");
  // The detail route is now a name+short-code slug, so revalidate the dynamic
  // segment itself (the raw-uuid path would no longer match the rendered slug).
  revalidatePath("/admin/talent/applications/[id]", "page");
  return {
    ok: true,
    item: {
      id: data.id as string,
      kind: (data.kind as string) ?? "note",
      body: (data.body as string | null) ?? null,
      occurredAt: (data.occurred_at as string | null) ?? occurredAt,
      author: authorName || admin.email,
    },
  };
}
