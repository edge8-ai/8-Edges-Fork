// Server-only auth gate for the /team self-service portal. The mirror of
// kernel/identity/admin-auth.ts, but for employees and managers instead of admins.
//
// SECURITY MODEL (see docs/plans/2026-07-05-team-portal-design.md):
// company_os has RLS enabled with NO policies and NO grants to the browser key,
// so the publishable key can read nothing there. All /team data goes through the
// service-role client (kernel/data/supabase) exactly like /admin. This gate is the
// ONLY boundary, so every /team page and server action must call
// requireTeamMember() first AND scope every query to the actor's own ids (use
// entities/team/lib/data.ts). Identity is matched on people.auth_user_id (the cryptographic
// id from the JWT), NEVER on email, which is mutable/reusable.

import { perRender } from "./per-render";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/kernel/data/supabase/server";
import { companyOs } from "@/kernel/data/supabase";
import { holdsAdminGrant } from "@/kernel/identity/admin-register";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { PORTAL_STATUSES } from "./team-statuses";
import { actorDisplayName, GREETING_COLUMNS, greetingName, personName } from "@/kernel/config/people-name";

export type TeamRole = "employee" | "manager";

export type TeamActor = {
  authUserId: string;
  personId: string;
  teamMemberId: string;
  role: TeamRole;
  displayName: string;
  // What a page that addresses this person calls them: greetingName over the
  // same row, null when there is no given name, so each page supplies its own
  // word. displayName stays how they are named to others (S.16.17).
  greeting: string | null;
  // How they are named to someone outside Edge8, a client approver above all:
  // personName over the same row, the display name every screen shows, and
  // never an address, so a member with no name is "Team member" (S.19.6).
  // displayName keeps its older order because audit rows depend on it.
  name: string;
  avatarUrl: string | null;
  // Auth email, lowercased. Identity/scope is NEVER keyed on this (see the id
  // rationale below); it labels audit rows and keys the email-keyed registers.
  email: string;
  // Scope sets, computed server-side from the JWT — never from client input.
  // Employees: just their own id. Managers: own id + active direct reports.
  teamMemberScope: string[]; // team_members.id values this actor may read
  personScope: string[]; // people.id values this actor may read
  directReportIds: string[]; // team_members.id of direct reports (managers only)
  // True if this same person holds the Admin role as a register fact (an Admin
  // or Super Admin grant, or the bootstrap). Some /team pages widen scope for
  // it; whether the person may switch to the Admin view is surface.admin, which
  // the team layout reads from the access object instead (ADR 0014).
  isAdmin: boolean;
  // How the person is engaged (full-time, part-time, intern, contract). The
  // access resolver reads it for the baseline role: contract is Contractor,
  // anything else Team member (ADR 0013). Null when the row has none.
  employmentType: string | null;
};

export { PORTAL_STATUSES } from "./team-statuses";

type GetActorResult =
  | { actor: TeamActor; redirectTo?: undefined }
  | { actor: null; redirectTo: "/admin" | "/team/login" };

type TeamMembershipLookup = {
  person: { id: string; display_name: string | null; full_name: string | null; first_name: string | null; preferred_name: string | null; email: string; avatar_url: string | null };
  membership: { id: string; status: string; employment_type: string | null };
};

// Identity by auth_user_id, never by email. Shared by getTeamActor() and the
// Admin sidebar's "Team" switch-view eligibility check — wrapped in perRender() so
// those two callers in one render pass share a single people+team_members lookup.
const findActiveTeamMembership = perRender(async (authUserId: string): Promise<TeamMembershipLookup | null> => {
  const { data: person, error: personError } = await companyOs
    .from("people")
    .select(`id, ${GREETING_COLUMNS}, avatar_url`)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  // A failed lookup must never read as "this person exists": answer the same as
  // the no-account case so the caller lands on the login/admin redirect rather
  // than on a portal built from a half-read identity.
  if (personError) {
    console.error("[team-auth] people lookup failed for auth user", authUserId, personError.message);
    return null;
  }
  if (!person) return null;

  // Active employment record. A person may have several engagements; prefer an
  // 'active' one, else the first portal-eligible row.
  const { data: memberships, error: membershipsError } = await companyOs
    .from("team_members")
    .select("id, status, employment_type")
    .eq("person_id", person.id)
    .in("status", PORTAL_STATUSES);
  if (membershipsError) {
    console.error("[team-auth] team_members lookup failed for person", person.id, membershipsError.message);
    return null;
  }
  const rows = (memberships ?? []) as { id: string; status: string; employment_type: string | null }[];
  const membership = rows.find((r) => r.status === "active") ?? rows[0];
  if (!membership) return null;

  return { person, membership };
});

// True if the signed-in admin also has a linked, active team_members record —
// i.e. whether the Admin sidebar's "Team" view switch is live for them.
export async function hasTeamAccess(authUserId: string): Promise<boolean> {
  return Boolean(await findActiveTeamMembership(authUserId));
}

// Resolve the signed-in user to a team actor. Returns a redirect target instead
// of an actor when the caller is not a portal user:
//   - not signed in                                       -> /team/login
//   - no linked, active team_members record, is an admin   -> /admin
//   - no linked, active team_members record, not an admin  -> /team/login
// An admin WITH a linked team_members record is a valid team actor — they
// deliberately switched into /team via the sidebar and use their own team
// scope, same as anyone else. Admin status never widens that scope.
export const getTeamActor = perRender(async (): Promise<GetActorResult> => {
  const supabase = await createSessionClient();
  // Revalidates the JWT against GoTrue here rather than trusting middleware to
  // have done it: the matcher does not cover /api, and /api/team/chat calls this
  // gate. Identity is still matched on the cryptographic auth_user_id below,
  // never on email. See getAdminUser() for the full rationale.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return { actor: null, redirectTo: "/team/login" };

  const found = await findActiveTeamMembership(user.id);
  if (!found) {
    // Landing (ADR 0014): someone with no team identity who holds surface.admin
    // belongs on the Admin view, whichever role gave it to them.
    if (await holdsSurfaceAdmin(email)) return { actor: null, redirectTo: "/admin" };
    return { actor: null, redirectTo: "/team/login" };
  }
  const { person, membership } = found;
  // The Admin role as a register fact, not "may enter the Admin view": the
  // /team pages that widen scope for an admin (every board, everyone's hours)
  // key on the role, so a custom role that opens the Admin view for one job
  // never widens what the person sees in /team.
  const isAdmin = await holdsAdminGrant(email);

  // Manager iff at least one active team member reports to this one.
  const { data: reports, error: reportsError } = await companyOs
    .from("team_members")
    .select("id, person_id")
    .eq("manager_id", membership.id)
    .in("status", PORTAL_STATUSES);
  // This read decides both the role and the two scope sets, so a swallowed
  // failure would silently demote a manager to employee and hide their reports.
  // Refuse the actor instead, taking the same redirect as a caller with no team
  // record.
  if (reportsError) {
    console.error("[team-auth] direct-reports lookup failed for member", membership.id, reportsError.message);
    return { actor: null, redirectTo: isAdmin ? "/admin" : "/team/login" };
  }
  const reportRows = (reports ?? []) as { id: string; person_id: string }[];
  const isManager = reportRows.length > 0;

  const directReportIds = reportRows.map((r) => r.id);
  const teamMemberScope = [membership.id, ...directReportIds];
  const personScope = [person.id, ...reportRows.map((r) => r.person_id)];

  return {
    actor: {
      authUserId: user.id,
      personId: person.id,
      teamMemberId: membership.id,
      role: isManager ? "manager" : "employee",
      displayName: actorDisplayName(person),
      greeting: greetingName(person, null),
      name: personName({ ...person, email: null }, "Team member"),
      avatarUrl: person.avatar_url,
      email,
      teamMemberScope,
      personScope,
      directReportIds,
      isAdmin,
      employmentType: membership.employment_type ?? null,
    },
  };
});

// Gate for /team pages and server actions. Redirects when the caller has no
// team identity. Call at the top of the /team layout and EVERY /team action.
export async function requireTeamMember(): Promise<TeamActor> {
  const { actor, redirectTo } = await getTeamActor();
  if (!actor) redirect(redirectTo);
  return actor;
}
