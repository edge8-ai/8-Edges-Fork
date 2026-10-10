"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { runInBackground } from "@/kernel/audit/background";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { getOrCreateApplication, attachApplicationResume } from "@/entities/hiring/lib/applications";
import { extractResumeFields, type ExtractedCandidate } from "@/entities/hiring/lib/resume-extract";
import { screenNewApplication } from "@/entities/hiring/lib/chain/entry";
import { isEmail } from "@/kernel/config/validate";
import { updatePeople } from "@/kernel/identity/writes";
import { parseLinkInput, LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

// Recruiter intake actions: add candidates by hand or from a batch of resumes.
// Both paths converge on createCandidate — person → candidate_profile →
// application → resume document — the same chain the public apply route uses.

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

type ResumeUpload = { storagePath: string; mimeType: string | null; byteSize: number; fileName: string };

// Upload one resume into the private `resumes` bucket under an intake prefix.
// Runs before we know the person/application, so the path is keyed by upload id;
// abandoned drafts just leave an unreferenced file (same keep-everything policy
// as resume replacement).
async function uploadIntakeResume(file: File): Promise<{ ok: true; upload: ResumeUpload } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_RESUME_BYTES) return { ok: false, error: "Resume is too large (max 10 MB)." };

  const fileName = (file.name || "resume.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `admin/intake/${randomUUID()}-${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("resumes").upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  return { ok: true, upload: { storagePath, mimeType: file.type || null, byteSize: file.size, fileName } };
}

// One resume in, one draft out: store the file, then extract fields with Claude.
// A failed extraction still returns the stored upload so the recruiter can fill
// the fields by hand without re-uploading.
export type DraftResult =
  | { ok: true; upload: ResumeUpload; fields: ExtractedCandidate | null; extractError: string | null }
  | { ok: false; error: string };

export async function extractResumeDraft(formData: FormData): Promise<DraftResult> {
  await requirePermission("hiring.ats");

  const file = formData.get("resume");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file first." };

  const uploaded = await uploadIntakeResume(file);
  if (!uploaded.ok) return uploaded;

  const extracted = await extractResumeFields(uploaded.upload.storagePath, uploaded.upload.mimeType);
  return {
    ok: true,
    upload: uploaded.upload,
    fields: extracted.ok ? extracted.fields : null,
    extractError: extracted.ok ? null : extracted.error,
  };
}

export type CreateCandidateInput = {
  jobRequisitionId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  headline?: string | null;
  currentTitle?: string | null;
  // From extractResumeDraft — already sitting in the `resumes` bucket.
  resume?: ResumeUpload | null;
};

export type CreateCandidateResult =
  | { ok: true; applicationId: string }
  | { ok: false; error: string; existingApplicationId?: string };

// Manual tab: the resume arrives as a file alongside the fields.
export async function createCandidateWithFile(
  input: Omit<CreateCandidateInput, "resume">,
  formData: FormData,
): Promise<CreateCandidateResult> {
  await requirePermission("hiring.ats");
  const file = formData.get("resume");
  let resume: ResumeUpload | null = null;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadIntakeResume(file);
    if (!uploaded.ok) return uploaded;
    resume = uploaded.upload;
  }
  return createCandidate({ ...input, resume });
}

export async function createCandidate(input: CreateCandidateInput): Promise<CreateCandidateResult> {
  const { user: admin } = await requirePermission("hiring.ats");

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (!isEmail(email)) return { ok: false, error: "A valid email is required." };
  if (!input.jobRequisitionId) return { ok: false, error: "Pick a position." };
  const linkedin = parseLinkInput(input.linkedinUrl);
  if (!linkedin.ok) return { ok: false, error: LINKEDIN_NOT_A_LINK };
  const portfolio = parseLinkInput(input.portfolioUrl);
  if (!portfolio.ok) return { ok: false, error: "Portfolio isn't a web link. Paste the full address." };

  const { data: req, error: reqErr } = await companyOs.from("job_requisitions").select("id, title")
    .eq("id", input.jobRequisitionId)
    .maybeSingle();
  if (reqErr || !req) return { ok: false, error: reqErr?.message ?? "Job requisition not found." };

  const person = await getOrCreatePerson({
    email,
    name: fullName,
    phone: input.phone?.trim() || null,
    linkedin: linkedin.value,
    source: "recruiter",
  });
  if (!person.ok) return { ok: false, error: person.error };

  // A person can only hold one application per req — surface the duplicate
  // instead of silently reusing it (the recruiter may be re-adding by mistake,
  // and attaching this resume would clobber the existing one).
  const { data: existing, error: existingErr } = await companyOs.from("applications").select("id")
    .eq("person_id", person.id)
    .eq("job_requisition_id", input.jobRequisitionId)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existing) {
    return {
      ok: false,
      error: `${fullName} already has an application for ${req.title ?? "this role"}.`,
      existingApplicationId: existing.id as string,
    };
  }

  // Mirror the apply route: tag as job seeker only where no persona is set.
  const { error: personaErr } = await updatePeople({ persona: "job_seeker" })
    .eq("id", person.id)
    .is("persona", null);
  if (personaErr) return { ok: false, error: personaErr.message };

  const profile: Record<string, unknown> = {};
  if (input.headline?.trim()) profile.headline = input.headline.trim();
  if (input.currentTitle?.trim()) profile.current_title = input.currentTitle.trim();
  if (portfolio.value) profile.portfolio_url = portfolio.value;
  if (Object.keys(profile).length > 0) {
    const { error: cpErr } = await companyOs.from("candidate_profile").upsert({ person_id: person.id, ...profile, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
    if (cpErr) return { ok: false, error: cpErr.message };
  }

  const application = await getOrCreateApplication(person.id, input.jobRequisitionId, {
    meta: { job_title: req.title ?? "" },
    source: "recruiter",
    sourceDetail: "admin_add_candidates",
  });
  if (!application.ok) return { ok: false, error: application.error };

  if (input.resume) {
    const doc = await attachApplicationResume(application.id, {
      storagePath: input.resume.storagePath,
      mimeType: input.resume.mimeType,
      byteSize: input.resume.byteSize,
      personName: fullName,
    });
    if (!doc.ok) return { ok: false, error: doc.error };
    // AI screen runs after the response, exactly like the apply route.
    runInBackground("/background/resume-screen/", `application ${application.id}`, () => screenNewApplication(application.id));
  }

  await recordAudit({
    table: "applications",
    recordId: application.id,
    operation: "insert",
    actor: admin.email,
    newData: {
      person_email: email,
      job_requisition_id: input.jobRequisitionId,
      source: "recruiter",
      resume_file: input.resume?.fileName ?? null,
    },
    context: { via: "add_candidates" },
  });
  revalidatePath("/admin/talent/applications");
  return { ok: true, applicationId: application.id };
}
