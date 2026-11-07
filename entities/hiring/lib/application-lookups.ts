// The questions other entities ask of applications and application_stages, and
// the one write they make to an application (A.69, ADR 0018). Until A.69 the
// door handed out `selectApplications(columns)`, `selectApplicationStages` and
// `updateApplications(patch)`, and the team hub, the company dashboards and
// onboarding each built their own query. Each question here makes exactly the
// query its caller made.
import { companyOs } from "@/kernel/data/supabase";
import type { Database, Json } from "@/kernel/data/supabase/database.types";
import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { Embedded } from "@/kernel/config/embedded";

/** An application as the team hiring board lists it, with the candidate's name. */
export type BoardApplication = Pick<
  Database["company_os"]["Tables"]["applications"]["Row"],
  "id" | "job_requisition_id" | "current_stage_id" | "rating" | "applied_at" | "archived_at" | "metadata"
> & { people: Embedded<NamedPerson> };

/**
 * When each live application still in review arrived, the newest first: the
 * Admin Home's "applications in review" line counts them and names the newest
 * day (AH.2.7). An archived or decided application is not in review.
 */
export async function activeApplicationDates() {
  return companyOs
    .from("applications")
    .select("applied_at")
    .eq("status", "active")
    .is("archived_at", null)
    .order("applied_at", { ascending: false })
    .limit(500);
}

/** The live (unarchived) applications to these requisitions: the board's candidates. */
export async function boardApplications(requisitionIds: string[]) {
  const { data, error } = await companyOs
    .from("applications")
    .select(
      "id, job_requisition_id, current_stage_id, rating, applied_at, archived_at, metadata, " +
        `people:people!person_id(${NAME_COLUMNS})`,
    )
    .in("job_requisition_id", requisitionIds)
    .is("archived_at", null);
  return { data: data as unknown as BoardApplication[] | null, error };
}

/** The pipeline stages of these requisitions, in pipeline order. */
export async function stagesOfRequisitions(requisitionIds: string[]) {
  return companyOs
    .from("application_stages")
    .select("id, job_requisition_id, name, position, is_terminal")
    .in("job_requisition_id", requisitionIds)
    .order("position");
}

/** One application's metadata and resume, or null: what the family AI screen reads before it rates the resume. */
export async function applicationForScreen(applicationId: string) {
  return companyOs.from("applications").select("id, metadata, resume_document_id").eq("id", applicationId).maybeSingle();
}

/** Replaces one application's metadata, as the family AI screen does after it rates the resume. */
export async function setApplicationMetadata(applicationId: string, metadata: Json) {
  return companyOs.from("applications").update({ metadata }).eq("id", applicationId);
}

/**
 * The hiring manager (a person id) of the requisition an application belongs
 * to: who may drive that candidate from the team board. Null when no
 * application has that id, or its requisition names no manager.
 */
export async function hiringManagerOfApplication(applicationId: string) {
  const { data, error } = await companyOs
    .from("applications")
    .select("job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )")
    .eq("id", applicationId)
    .maybeSingle();
  return {
    data: data as unknown as { job_requisitions: Embedded<{ hiring_manager_id: string | null }> } | null,
    error,
  };
}

/** When each application of the last stretch came in, at most `limit` of them: the company dashboard's intake chart. */
export async function applicationDatesSince(since: string, limit: number) {
  return companyOs.from("applications").select("applied_at").gte("applied_at", since).limit(limit);
}

/** Every application's status and dates, at most `limit` of them: the talent dashboard's funnel. */
export async function applicationFunnel(limit: number) {
  return companyOs.from("applications").select("status, applied_at, decided_at, job_requisition_id").limit(limit);
}

/** The requisition of a person's most recent application, or null when they never applied. */
export async function latestApplicationOf(personId: string) {
  return companyOs
    .from("applications")
    .select("job_requisition_id")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** Any one application of this person, or null: whether they came through the hiring pipeline. */
export async function anyApplicationOf(personId: string) {
  return companyOs.from("applications").select("id").eq("person_id", personId).limit(1).maybeSingle();
}
