// What any person may do, read from the registers rather than from a session
// (ADR 0013). getAccess answers for the signed-in person; this answers for
// someone else: the person Settings → Access is asked about ("what can Anna see,
// and why"), or the recipient a notification is about to be sent to, who must
// not be mailed a link to a page they could not open.
//
// It gathers the same facts the session gates give getAccess, keyed on the
// person instead of the auth user, and resolves them through the same
// buildAccess, so both answers come from one rule:
//   - admin and Super Admin from the person's email, as the admin gate reads it;
//   - the team facts from their live team_members row, as getTeamActor reads it
//     (the active engagement first, then the first portal-eligible one), and
//     their direct reports from the rows that name it as manager;
//   - whether a request waits on their decision (the Approver role);
//   - portal membership only for someone not on the team, as getPortalActor
//     routes staff to their own surface;
//   - their live grants.
// Every read decides what someone may do, so a failure throws (A.12).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { holdsAdminGrant, holdsSuperAdminGrant, personIdsByEmail } from "@/kernel/identity/admin-register";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";
import { hasWaitingOn } from "@/kernel/approvals/waiting";
import { assignedRoles, rolePermissionsFromDb } from "@/kernel/identity/access-rows";
import { perRender } from "@/kernel/identity/per-render";
import { buildAccess, type AccessFacts } from "@/kernel/identity/access";
import type { Access } from "@/kernel/identity/access-model";

/** The facts the registers hold about one person; null when there is no such person. */
export async function accessFactsOf(personId: string): Promise<AccessFacts | null> {
  const people = mustRows(await companyOs.from("people").select("id, email").eq("id", personId).limit(1), "[access] people");
  const person = people[0];
  if (!person) return null;

  const memberships = mustRows(
    await companyOs
      .from("team_members")
      .select("id, status, employment_type")
      .eq("person_id", personId)
      .in("status", PORTAL_STATUSES),
    "[access] team_members",
  );
  const membership = memberships.find((m) => m.status === "active") ?? memberships[0] ?? null;

  const [reports, portal, granted, isAdmin, isApprover] = await Promise.all([
    membership
      ? companyOs.from("team_members").select("person_id").eq("manager_id", membership.id).in("status", PORTAL_STATUSES)
      : Promise.resolve({ data: [] as { person_id: string }[], error: null }),
    membership
      ? Promise.resolve({ data: [] as { company_id: string | null }[], error: null })
      : companyOs.from("portal_members").select("company_id").eq("person_id", personId).eq("status", "active"),
    assignedRoles(personId),
    holdsAdminGrant(person.email),
    hasWaitingOn(personId),
  ]);
  const reportRows = mustRows(reports, "[access] direct reports");
  const portalRows = mustRows(portal, "[access] portal_members");

  return {
    personId,
    teamMemberId: membership?.id ?? null,
    isAdmin,
    isSuperAdmin: isAdmin ? await holdsSuperAdminGrant(person.email) : false,
    employmentType: membership?.employment_type ?? null,
    directReportPersonIds: reportRows.map((r) => r.person_id).filter((id) => id !== personId),
    isApprover,
    isPortalMember: portalRows.length > 0,
    portalCompanyIds: portalRows.map((r) => r.company_id).filter((id): id is string => id !== null),
    assignedRoles: granted,
  };
}

/** What a person may do, and why; null when there is no such person. */
export async function accessOf(personId: string): Promise<Access | null> {
  const facts = await accessFactsOf(personId);
  return facts ? buildAccess(facts, rolePermissionsFromDb) : null;
}

/** The facts of someone who has an email and no person record: only the register can know them. */
async function factsOfEmailOnly(email: string): Promise<AccessFacts> {
  const isAdmin = await holdsAdminGrant(email);
  return {
    personId: null,
    teamMemberId: null,
    isAdmin,
    isSuperAdmin: isAdmin ? await holdsSuperAdminGrant(email) : false,
    employmentType: null,
    directReportPersonIds: [],
    isApprover: false,
    isPortalMember: false,
    portalCompanyIds: [],
    assignedRoles: [],
  };
}

/**
 * Whether the person with this email holds surface.admin: what "is an admin"
 * means everywhere outside the Admin view's own guard (ADR 0014). The sign-in
 * link, the landing after sign-in, the team and portal invite refusals, survey
 * identity, the affiliates refusal and the board digest all ask this, so a
 * custom role that opens the Admin view counts the same as the Admin role, and
 * the email match against the admin register is no longer the definition.
 *
 * Every person row with the email is asked (B.28 found duplicates), and an
 * email with no person is asked of the register alone, so the bootstrap
 * allowlist keeps working. A failed read throws rather than answering no: for
 * the invite refusals and the affiliates check, "not an admin" is the
 * permissive branch (A.12), so a hiccup must never read as it. A caller for
 * whom no is the safe side says so where it calls. Once per render per email.
 */
export const holdsSurfaceAdmin = perRender(async (email: string | null | undefined): Promise<boolean> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const personIds = await personIdsByEmail(normalized);
  if (personIds.length === 0) return (await buildAccess(await factsOfEmailOnly(normalized), rolePermissionsFromDb)).may("surface.admin");
  for (const personId of personIds) {
    if ((await accessOf(personId))?.may("surface.admin")) return true;
  }
  return false;
});
