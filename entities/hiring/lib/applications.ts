import { companyOs } from "@/kernel/data/supabase";
import { insertDocuments } from "@/kernel/identity/writes";

// Application intake writes (company_os.applications and the resume document).
// Moved out of kernel/data/company-os.ts in ME-13: the hiring module owns the
// applications and documents tables, so the writes live behind its door.
// Applications link straight to people; the candidates table is retired.

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

// Get-or-create the application for (person, requisition). Sets the first
// pipeline stage if the requisition has one. Cover letter is pasted text;
// answers pair the requisition's questions with the applicant's responses,
// snapshotted at apply time. Source defaults to the careers site; recruiter
// intake passes its own.
export async function getOrCreateApplication(
  personId: string,
  jobRequisitionId: string,
  input: {
    coverLetter?: string | null;
    answers?: { q: string; a: string }[];
    meta?: Record<string, string>;
    source?: string;
    sourceDetail?: string;
  },
): Promise<Ok<{ id: string }> | Err> {
  const { data: stage, error: stageErr } = await companyOs.from("application_stages").select("id")
    .eq("job_requisition_id", jobRequisitionId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stageErr) return { ok: false, error: stageErr.message };

  const { error: upErr } = await companyOs.from("applications").upsert(
    {
      person_id: personId,
      job_requisition_id: jobRequisitionId,
      source: input.source ?? "career_site",
      source_detail: input.sourceDetail ?? "edge8.ai/careers",
      status: "active",
      current_stage_id: stage?.id ?? null,
      cover_letter: input.coverLetter?.trim() || null,
      answers: input.answers ?? [],
      metadata: input.meta ?? {},
    },
    { onConflict: "person_id,job_requisition_id", ignoreDuplicates: true },
  );
  if (upErr) {
    console.error("[company-os] application upsert failed:", upErr.message);
    return { ok: false, error: "Could not save the application." };
  }
  const { data, error } = await companyOs.from("applications").select("id")
    .eq("person_id", personId)
    .eq("job_requisition_id", jobRequisitionId)
    .single();
  if (error || !data) {
    console.error("[company-os] application select failed:", error?.message);
    return { ok: false, error: "Could not save the application." };
  }
  return { ok: true, id: data.id };
}

// Insert a resume document (path in the `resumes` bucket) and link it to the
// application. Returns the document id.
export async function attachApplicationResume(
  applicationId: string,
  doc: { storagePath: string; mimeType: string | null; byteSize: number | null; personName: string },
): Promise<Ok<{ documentId: string }> | Err> {
  const { data, error } = await insertDocuments({
      title: `Resume — ${doc.personName}`,
      storage_path: doc.storagePath,
      mime_type: doc.mimeType,
      byte_size: doc.byteSize,
      entity_type: "application",
      entity_id: applicationId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[company-os] document insert failed:", error?.message);
    return { ok: false, error: "Could not save the resume." };
  }
  const { error: linkErr } = await companyOs.from("applications").update({ resume_document_id: data.id })
    .eq("id", applicationId);
  if (linkErr) console.error("[company-os] application resume link failed:", linkErr.message);
  return { ok: true, documentId: data.id };
}

/**
 * The ATS slice of one person: their candidate profile and their applications.
 * It lives here rather than inside company-os's Person 360 aggregator because
 * that aggregator sits in company-os's door graph, and company-os is what
 * renders the ATS screens — an entity cannot both be imported by the page and
 * import the page's other half. The contact route fans out to both and merges,
 * which is what a person page is: a composition of what each entity knows.
 */
export async function getPersonHiring(personId: string): Promise<{
  candidateProfile: Record<string, unknown> | null;
  applications: Record<string, unknown>[];
}> {
  const [profile, apps] = await Promise.all([
    companyOs
      .from("candidate_profile")
      .select("headline, current_title, portfolio_url, do_not_hire, pool_status")
      .eq("person_id", personId),
    companyOs
      .from("applications")
      .select("id, job_requisition_id, status, rating, applied_at, created_at, resume_document_id, job_requisitions(title)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
  ]);
  if (profile.error) console.error("[hiring] candidate_profile read failed:", profile.error.message);
  if (apps.error) console.error("[hiring] applications read failed:", apps.error.message);
  return {
    candidateProfile: ((profile.data ?? []) as Record<string, unknown>[])[0] ?? null,
    applications: (apps.data ?? []) as Record<string, unknown>[],
  };
}
