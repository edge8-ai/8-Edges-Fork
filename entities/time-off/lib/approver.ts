// "Who approves this person's leave?" — one answer, used by every surface that
// routes or gates a leave decision (docs/plans/2026-08-12-client-manager-time-off-approval.md).
//
// Edge8 staff placed at a client are managed day to day by someone at the
// client. The order is: the client manager named on their active placement,
// else their Edge8 manager, else nobody. Approval power comes from being that
// named client manager, never from a portal role — a client admin with no
// placements naming them decides nothing.
//
// Every lookup inside the resolver raises on a failed read (S.19.5). Each step
// falls through to the next when the answer is "nobody", so a failed client
// placement read used to answer "no client manager" and hand the decision to
// the Edge8 manager: the wrong person, with the power to decide. The callers
// catch the failure and refuse, or route to the admins, who may decide anything.

import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure, readOr } from "@/kernel/data/read";
// staff_assignments is company-os's table; its door hands back the builder so
// the filters below stay here (design §4).
import { selectStaffAssignments } from "@/entities/contacts";
import { GREETING_COLUMNS, type GreetedPerson, greetingName, personName } from "@/kernel/config/people-name";

export type LeaveApprover = {
  kind: "client" | "edge8";
  personId: string;
  email: string;
  displayName: string;
  // Set only for kind "client": the company whose placement names them.
  companyId: string | null;
};

type PersonRow = GreetedPerson & { id: string; email: string };

// The approver as named to the employee and in the client watchers' emails:
// the name to show, then their given name, then the caller's word. The chain
// before S.16 tried first_name before the email (S.16.22). A client-side
// approver's name reaches the client's watchers, so it never falls back to an
// address: "Client manager" (S.16.26). An Edge8 approver is named only to
// staff, where the address is the last resort.
const approverName = (p: PersonRow, fallback: string) => personName({ ...p, email: null }, null) ?? greetingName(p, fallback);

async function person(id: string | null): Promise<PersonRow | null> {
  if (!id) return null;
  const { data, error } = await companyOs
    .from("people")
    .select(`id, ${GREETING_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ReadFailure("[time-off] approver person", error.message);
  return (data as PersonRow | null) ?? null;
}

// The client manager named on this member's active placement, if any. A member
// placed at two clients at once is not a case we have; if it ever happens the
// oldest active placement wins, deterministically.
async function clientManagerFor(
  teamMemberId: string,
): Promise<{ personId: string; companyId: string } | null> {
  const { data, error } = await selectStaffAssignments("client_manager_person_id, company_id")
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new ReadFailure("[time-off] client manager placement", error.message);
  const row = ((data ?? []) as unknown as { client_manager_person_id: string | null; company_id: string }[])[0];
  if (!row?.client_manager_person_id) return null;
  return { personId: row.client_manager_person_id, companyId: row.company_id };
}

/** Who approves this member's leave, or null for nobody. Raises when a read fails, rather than guessing. */
export async function resolveLeaveApprover(teamMemberId: string): Promise<LeaveApprover | null> {
  const client = await clientManagerFor(teamMemberId);
  if (client) {
    const p = await person(client.personId);
    if (p?.email) {
      return {
        kind: "client",
        personId: p.id,
        email: p.email,
        displayName: approverName(p, "Client manager"),
        companyId: client.companyId,
      };
    }
  }

  const { data: member, error: memberError } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (memberError) throw new ReadFailure("[time-off] member manager", memberError.message);
  const managerId = (member as { manager_id: string | null } | null)?.manager_id ?? null;
  if (!managerId) return null;

  const { data: mgr, error: mgrError } = await companyOs
    .from("team_members")
    .select("person_id")
    .eq("id", managerId)
    .maybeSingle();
  if (mgrError) throw new ReadFailure("[time-off] manager person", mgrError.message);
  const p = await person((mgr as { person_id: string | null } | null)?.person_id ?? null);
  if (!p?.email) return null;
  return { kind: "edge8", personId: p.id, email: p.email, displayName: approverName(p, p.email), companyId: null };
}

// Other people to keep in the loop on a client-approved request: the client's
// active portal admins (visibility only, they cannot decide). Excludes the
// approver themselves. Empty for Edge8-approved leave.
export async function clientWatcherEmails(approver: LeaveApprover): Promise<string[]> {
  if (approver.kind !== "client" || !approver.companyId) return [];

  const { data, error } = await companyOs
    .from("portal_members")
    .select("person_id")
    .eq("company_id", approver.companyId)
    .eq("status", "active")
    .eq("role", "admin");
  if (error) console.error("[time-off] client portal admins", error);
  const ids = ((data ?? []) as { person_id: string }[])
    .map((r) => r.person_id)
    .filter((id) => id !== approver.personId);
  if (ids.length === 0) return [];

  const { data: people, error: peopleError } = await companyOs
    .from("people")
    .select("email")
    .in("id", ids);
  if (peopleError) console.error("[time-off] watcher emails", peopleError);
  return ((people ?? []) as { email: string | null }[])
    .map((p) => p.email)
    .filter((e): e is string => !!e);
}

// The team_member ids whose active placement names this person as client
// manager, restricted to companies the caller already has in scope. The gate
// for every client-side decision: scope first, then the request id.
export async function teamMemberIdsManagedBy(
  personId: string,
  companyScope: string[],
): Promise<string[]> {
  if (companyScope.length === 0) return [];
  const { data, error } = await selectStaffAssignments("team_member_id")
    .eq("client_manager_person_id", personId)
    .eq("status", "active")
    .in("company_id", companyScope);
  if (error) console.error("[time-off] members managed by", error);
  const rows = (data ?? []) as unknown as { team_member_id: string }[];
  return [...new Set(rows.map((r) => r.team_member_id))];
}

/**
 * Whether this team member leads the organisation: active, with no manager
 * above them. Leave is decided by somebody else, always, except for this one
 * person, because above them there is nobody to ask (the CEO). The rule is the
 * org chart's, not a name: whoever the chart puts at the top holds it, which is
 * one person today and follows the chart when it changes. A failed read answers
 * false, the restrictive side: the request then waits on the admins, and nobody
 * gains a self-approval from a database hiccup.
 */
export async function leadsTheOrg(teamMemberId: string): Promise<boolean> {
  const row = readOr(
    await companyOs.from("team_members").select("manager_id, status").eq("id", teamMemberId).maybeSingle(),
    "[time-off] leads the org",
    null,
  );
  return row !== null && row.manager_id === null && row.status === "active";
}
