// The questions other entities ask of ai_programs, and the three acts they
// perform on it (A.66). Until A.66 the door handed out `selectAiPrograms`, and
// boards, crm, htt, portal and team each chose their own columns and spelled
// "live" (`status <> 'archived'`) for themselves at twenty sites. Each question
// here names what it answers and keeps the live rule, the order and the
// columns inside the entity that owns the table. The scope questions
// (programInCompanies, programInCompany) predate this file and stay in
// program-scope.ts.
import { companyOs } from "@/kernel/data/supabase";

export type AiProgramStatus = "draft" | "active" | "complete" | "archived";
/** The statuses a live programme can carry: "live" means not archived. */
export type LiveProgramStatus = Exclude<AiProgramStatus, "archived">;

const ARCHIVED = "archived";
const NEWEST = { ascending: false } as const;

/** The programme's company, or null when no programme has that id: the board settings' company match. */
export async function programOwner(programId: string) {
  return companyOs.from("ai_programs").select("id, company_id").eq("id", programId).maybeSingle();
}

/** Every programme, archived ones included, by name: the board settings' AI Program picker. */
export async function everyProgramByName() {
  return companyOs.from("ai_programs").select("id, name, company_id").order("name");
}

/** The names of these programmes, whatever their status: the labels on a board. */
export async function programNames(programIds: string[]) {
  return companyOs.from("ai_programs").select("id, name").in("id", programIds);
}

/**
 * Every programme a company has, archived ones included, newest first: the
 * options of the tag pickers on meetings and documents, where a row tagged to an
 * archived programme must keep its label.
 */
export async function programPickerOptions(companyId: string) {
  return companyOs.from("ai_programs").select("id, name").eq("company_id", companyId).order("created_at", NEWEST);
}

/** The company's live programmes, newest first, with their status: the bands a hub shows. */
export async function hubPrograms(companyId: string) {
  const { data, error } = await companyOs
    .from("ai_programs")
    .select("id, name, status")
    .eq("company_id", companyId)
    .neq("status", ARCHIVED)
    .order("created_at", NEWEST);
  return { data: data as { id: string; name: string; status: LiveProgramStatus }[] | null, error };
}

/** Whether the company has any programme at all, archived included: at most one id. */
export async function anyProgramOfCompany(companyId: string) {
  return companyOs.from("ai_programs").select("id").eq("company_id", companyId).limit(1);
}

/**
 * The company's live programme of this exact name, oldest first, at most one:
 * a repo registered under a programme's name joins it rather than opening a
 * second one (X.1.3).
 */
export async function liveProgramNamed(companyId: string, name: string) {
  return companyOs
    .from("ai_programs")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", name)
    .neq("status", ARCHIVED)
    .order("created_at", { ascending: true })
    .limit(1);
}

export type LiveProgram = { id: string; company_id: string; name: string; status: LiveProgramStatus; created_at: string };

/**
 * The live programmes of these companies, newest first: what the client portal
 * lists and links in its sidebar. The ids must come from the caller's own scope
 * (the portal passes the actor's companyScope); an empty list matches nothing.
 */
export async function liveProgramsOfCompanies(companyIds: string[]) {
  const { data, error } = await companyOs
    .from("ai_programs")
    .select("id, company_id, name, status, created_at")
    .in("company_id", companyIds)
    .neq("status", ARCHIVED)
    .order("created_at", NEWEST);
  return { data: data as LiveProgram[] | null, error };
}

/** One page (rows from..to, ordered by id) of these companies' live programmes: the ones a repo can bill through. */
export async function liveProgramNamesPage(companyIds: string[], from: number, to: number) {
  return companyOs
    .from("ai_programs")
    .select("id, name")
    .in("company_id", companyIds)
    .neq("status", ARCHIVED)
    .order("id")
    .range(from, to);
}

/** The company of every live programme, one row per programme: the per-company counts. */
export async function liveProgramCompanies() {
  return companyOs.from("ai_programs").select("company_id").neq("status", ARCHIVED);
}

/** Every programme of these companies, archived included, oldest first: the clients digest. */
export async function everyProgramOfCompanies(companyIds: string[]) {
  const { data, error } = await companyOs
    .from("ai_programs")
    .select("id, company_id, name, status")
    .in("company_id", companyIds)
    .order("created_at", { ascending: true });
  return { data: data as { id: string; company_id: string; name: string; status: AiProgramStatus }[] | null, error };
}

/**
 * Open an active programme for a company and return its id. Every programme
 * starts active; the portal's own draft state is never opened from here.
 */
export async function openProgram(input: { companyId: string; name: string; createdBy: string }) {
  return companyOs
    .from("ai_programs")
    .insert({ company_id: input.companyId, name: input.name, status: "active", created_by: input.createdBy })
    .select("id")
    .single();
}

/** Remove a programme that was opened a moment ago and could not be completed, so it is not left orphaned. */
export async function discardProgram(programId: string) {
  return companyOs.from("ai_programs").delete().eq("id", programId);
}

/** Set a programme's status, only when it belongs to this company. */
export async function changeProgramStatus(companyId: string, programId: string, status: AiProgramStatus) {
  return companyOs.from("ai_programs").update({ status }).eq("id", programId).eq("company_id", companyId);
}
