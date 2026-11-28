import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { byFirstName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { isUuid } from "@/kernel/config/slug";
import { CURRENT_TEAM_STATUSES } from "@/kernel/identity/team-statuses";
import { contactIdsOfCompanies, contactLinkAt } from "@/entities/contacts";

// Who a job is for, checked on the server: the client company, its hiring
// manager and our recruiter. The drawer and New job send ids, and each id must
// name who its field says. A hiring manager is one of our current team, or,
// once the job has a client, one of that client's contacts in CRM, and only a
// viewer who may see client contacts may pick one (crm's seesEveryClient). The
// recruiter is a current team_members row, because candidates' replies go to
// the recruiter (entities/hiring/lib/chain/store.ts).

type Named = { id: string; name: string };
type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

/** The fields of a create or an edit that say who the job is for. Omitted keys are left as they are. */
export type JobPeoplePatch = {
  client_company_id?: string | null;
  hiring_manager_id?: string | null;
  recruiter_id?: string | null;
};

type JobPeopleUpdates = Pick<CompanyOsUpdate<"job_requisitions">, "client_company_id" | "hiring_manager_id" | "recruiter_id">;

/** A client's contacts in CRM who are not archived, by first name. The caller checks the viewer may see them. */
export async function contactsOfClient(companyId: string): Promise<{ ok: true; contacts: Named[] } | Failure> {
  if (!isUuid(companyId)) return fail("Unknown client.");
  const links = await contactIdsOfCompanies([companyId]);
  if (links.error) return fail(links.error.message);
  const ids = [...new Set((links.data ?? []).map((l) => l.person_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return { ok: true, contacts: [] };
  const { data, error } = await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", ids).is("archived_at", null);
  if (error) return fail(error.message);
  const contacts = ((data ?? []) as unknown as (NamedPerson & { id: string })[])
    .map((p) => ({ id: p.id, name: personName(p) }))
    .sort((a, b) => byFirstName(a.name, b.name));
  return { ok: true, contacts };
}

/**
 * The columns a patch to who a job is for writes, once every id it names has
 * been checked. `currentClient` is the job's client before the patch (null for
 * a new job). Changing the client clears the hiring manager unless the patch
 * names a new one, because the old manager was someone else's person, or ours.
 */
export async function jobPeopleUpdates(
  patch: JobPeoplePatch,
  currentClient: string | null,
  mayPickContacts: boolean,
): Promise<{ ok: true; updates: JobPeopleUpdates } | Failure> {
  const updates: JobPeopleUpdates = {};
  let client = currentClient;

  if (patch.client_company_id !== undefined) {
    client = patch.client_company_id || null;
    if (client) {
      if (!isUuid(client)) return fail("Unknown client.");
      const { data, error } = await companyOs.from("companies").select("id").eq("id", client).is("archived_at", null).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("That client is not an active company in CRM.");
    }
    updates.client_company_id = client;
    if (client !== currentClient && patch.hiring_manager_id === undefined) updates.hiring_manager_id = null;
  }

  if (patch.hiring_manager_id !== undefined) {
    const manager = patch.hiring_manager_id || null;
    if (manager) {
      if (!isUuid(manager)) return fail("Unknown hiring manager.");
      const team = await companyOs.from("team_members").select("id").eq("person_id", manager).in("status", CURRENT_TEAM_STATUSES).limit(1);
      if (team.error) return fail(team.error.message);
      if ((team.data ?? []).length === 0) {
        if (!client) return fail("Pick the hiring manager from our team.");
        if (!mayPickContacts) return fail("Picking a client's contact needs access to CRM.");
        const link = await contactLinkAt(client, manager);
        if (link.error) return fail(link.error.message);
        if (!link.data) return fail("That person is not one of the client's contacts in CRM.");
      }
    }
    updates.hiring_manager_id = manager;
  }

  if (patch.recruiter_id !== undefined) {
    const recruiter = patch.recruiter_id || null;
    if (recruiter) {
      if (!isUuid(recruiter)) return fail("Unknown recruiter.");
      const { data, error } = await companyOs.from("team_members").select("id").eq("id", recruiter).in("status", CURRENT_TEAM_STATUSES).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Pick the recruiter from the current team.");
    }
    updates.recruiter_id = recruiter;
  }

  return { ok: true, updates };
}

/** Seats to fill: a whole number from 1 to 999, or an error to show. */
export function seatsError(headcount: unknown): string | null {
  return Number.isInteger(headcount) && (headcount as number) >= 1 && (headcount as number) <= 999
    ? null
    : "Seats to fill must be a whole number from 1 to 999.";
}
