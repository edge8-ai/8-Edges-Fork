// The questions other entities ask of job_requisitions (A.69, ADR 0018). Until
// A.69 the door handed out `selectJobRequisitions(columns)`, and the team hub,
// the company dashboards, the public careers pages and onboarding each chose
// their own columns and spelled "open", "public" and "the hiring board's
// statuses" for themselves. Each question here makes exactly the query its
// caller made, and keeps those rules inside the entity that owns the table.
import { companyOs } from "@/kernel/data/supabase";
import type { Database } from "@/kernel/data/supabase/database.types";
import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { Embedded } from "@/kernel/config/embedded";

/** The statuses the team hiring board counts as a role still in play. */
export const BOARD_OPEN_STATUSES = ["open", "on_hold", "draft"];
/** The statuses the team hiring board lists as a role that has ended. */
const BOARD_CLOSED_STATUSES = ["filled", "closed", "cancelled"];

const NEWEST_OPENED = { ascending: false } as const;

/**
 * Every open requisition, with its posting link and owner: the open headcount
 * the team hub's org chart hangs on each hiring manager. Never salary bands or
 * candidate data.
 */
export async function openRequisitions() {
  return companyOs
    .from("job_requisitions")
    .select("id, title, slug, location, employment_type, is_public, hiring_manager_id")
    .eq("status", "open");
}

/**
 * How many requisitions, of any status, this person is the hiring manager of:
 * whether they may see the team hiring board at all.
 */
export async function countRequisitionsManagedBy(personId: string) {
  return companyOs
    .from("job_requisitions")
    .select("id", { count: "exact", head: true })
    .eq("hiring_manager_id", personId);
}

/** A requisition as the team hiring board shows it, with its hiring manager's name. */
export type BoardRequisition = Pick<
  Database["company_os"]["Tables"]["job_requisitions"]["Row"],
  "id" | "title" | "status" | "headcount" | "location" | "employment_type" | "opened_at" | "closed_at" | "hiring_manager_id"
> & { people: Embedded<NamedPerson> };

const BOARD_REQUISITION = `id, title, status, headcount, location, employment_type, opened_at, closed_at, hiring_manager_id, people:people!hiring_manager_id(${NAME_COLUMNS})`;

/**
 * The roles still in play on the team hiring board, newest first. A manager
 * passes their own person id and sees only the roles they own; an admin passes
 * null and sees every one.
 */
export async function boardOpenRequisitions(managerPersonId: string | null) {
  let query = companyOs
    .from("job_requisitions")
    .select(BOARD_REQUISITION)
    .in("status", BOARD_OPEN_STATUSES)
    .order("opened_at", NEWEST_OPENED);
  if (managerPersonId !== null) query = query.eq("hiring_manager_id", managerPersonId);
  const { data, error } = await query;
  return { data: data as unknown as BoardRequisition[] | null, error };
}

/**
 * The roles that ended on or after `closedSince`, most recently closed first,
 * at most `cap` of them: the board's recent-history list. Scoped like
 * boardOpenRequisitions.
 */
export async function boardClosedRequisitions(managerPersonId: string | null, closedSince: string, cap: number) {
  let query = companyOs
    .from("job_requisitions")
    .select(BOARD_REQUISITION)
    .in("status", BOARD_CLOSED_STATUSES)
    .gte("closed_at", closedSince)
    .order("closed_at", { ascending: false })
    .limit(cap);
  if (managerPersonId !== null) query = query.eq("hiring_manager_id", managerPersonId);
  const { data, error } = await query;
  return { data: data as unknown as BoardRequisition[] | null, error };
}

/** A role as the public careers page lists it. */
export type PublicRole = Pick<
  Database["company_os"]["Tables"]["job_requisitions"]["Row"],
  "id" | "slug" | "title" | "employment_type" | "location" | "opened_at" | "full_jd" | "description"
> & { metadata: Record<string, unknown> | null };

/** The roles live on /careers (open and public), newest first. */
export async function publicOpenRoles() {
  const { data, error } = await companyOs
    .from("job_requisitions")
    .select("id, slug, title, employment_type, location, opened_at, full_jd, description, metadata")
    .eq("status", "open")
    .eq("is_public", true)
    .order("opened_at", NEWEST_OPENED);
  return { data: data as PublicRole[] | null, error };
}

/** One role's id if it is open and public, else null: whether a resume may still be uploaded to it. */
export async function openPublicRole(requisitionId: string) {
  return companyOs
    .from("job_requisitions")
    .select("id")
    .eq("id", requisitionId)
    .eq("status", "open")
    .eq("is_public", true)
    .maybeSingle();
}

/**
 * A requisition's per-role screening questions, whatever its status, or null
 * when no requisition has that id. The apply form asks them and the apply
 * route snapshots the answers against them.
 */
export async function applicationQuestionsOf(requisitionId: string) {
  return companyOs.from("job_requisitions").select("application_questions").eq("id", requisitionId).maybeSingle();
}

/** How many requisitions are open: the company dashboard's open-roles figure. */
export async function countOpenRequisitions() {
  return companyOs.from("job_requisitions").select("id", { count: "exact", head: true }).eq("status", "open");
}

/** The open and filled requisitions, newest opened first: the talent dashboard's hiring section. */
export async function openAndFilledRequisitions() {
  return companyOs
    .from("job_requisitions")
    .select("id, title, status, opened_at, closed_at")
    .in("status", ["open", "filled"])
    .order("opened_at", NEWEST_OPENED);
}

/** A requisition's recruiter (a team_members id), or null when no requisition has that id. */
export async function requisitionRecruiter(requisitionId: string) {
  return companyOs.from("job_requisitions").select("recruiter_id").eq("id", requisitionId).maybeSingle();
}
