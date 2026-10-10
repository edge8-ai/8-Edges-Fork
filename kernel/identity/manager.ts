// Who a person's manager is, and how to reach them.
//
// `team_members` is a kernel table — identity resolves who is signed in and the
// reporting line hangs off the same row — so the lookup lives here rather than
// in whichever entity happens to need it. Coaching notifies a manager when a
// goal changes and team notifies one when leave is requested; an entity owning
// this made one of them import the other, which was a cycle (RS-12).
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { TeamActor } from "./team-auth";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type ManagerName = NamedPerson;
type ManagerPerson = ManagerName & { email: string | null };

// Resolve a manager's person record from a team_members id. Deliberately a
// separate lookup: embedding `team_members!manager_id` on the self-referencing
// FK is ambiguous, and PostgREST resolves it in the REVERSE direction (rows
// whose manager_id points at you — your reports), so the "manager" came back
// as the first direct report. Bit us on the /team home card; never re-embed.
export async function getManagerPerson(managerId: string | null): Promise<ManagerPerson | null> {
  if (!managerId) return null;
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select(`people:people!person_id(${NAME_COLUMNS})`)
    .eq("id", managerId)
    .maybeSingle();
  if (dataError) console.error("[identity/manager] team_members", dataError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  return one(r.people as ManagerPerson | ManagerPerson[] | null);
}

// The actor's manager's contact details, for notifying on a new time-off
// request or a changed coaching goal. Self-scoped by actor.teamMemberId;
// returns null if the actor has no manager or the manager has no email on file.
export type ManagerContact = { email: string; displayName: string };

export async function getManagerContact(actor: TeamActor): Promise<ManagerContact | null> {
  const { data, error: dataError } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (dataError) console.error("[identity/manager] team_members", dataError);
  const managerId = ((data as unknown as { manager_id: string | null } | null)?.manager_id) ?? null;
  const person = await getManagerPerson(managerId);
  if (!person?.email) return null;
  return { email: person.email, displayName: personName(person, person.email) };
}
