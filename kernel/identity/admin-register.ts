// Admin and Super Admin as grants in Settings, Access (ADR 0013, AC.20). Since
// the cutover (AC.20, part 3) these grants are the only register of admins: the
// company_os.admins table is no longer read by the gate, and SENSITIVE_VIEWERS
// is gone.
//
// The admin gate is keyed on the signed-in email (admin-auth.ts), and an admin
// who is not on the team or in the portal has no person id in the access
// resolver, so a grant is found here from the email: the person with that
// email, then their live grants of the admin and super-admin roles.
//
// A failed read answers "no grant": the restrictive answer. The gate then
// refuses the person, which shows as a bounce to the sign-in page rather than
// as an open door. The two counts below are the opposite case: there "none" is
// the permissive answer (it opens the bootstrap, and it would let the last
// Super Admin be revoked), so a failed count raises instead.
import { companyOs } from "@/kernel/data/supabase";
import { mustCount, mustRows, ReadFailure } from "@/kernel/data/read";
import { perRender } from "@/kernel/identity/per-render";
import { liveRoles } from "@/kernel/identity/access-rows";
import { peopleByEmail } from "@/kernel/identity/person-by-email";

export type AdminGrants = { readonly admin: boolean; readonly superAdmin: boolean };

const NONE: AdminGrants = { admin: false, superAdmin: false };

/**
 * The grants of the person with this address, read once, with a failed read
 * raised as a ReadFailure. Each caller then says what a failure means: the
 * gate answers "no grant" (adminGrantsByEmail), and a caller for whom "no" is
 * the permissive answer lets it raise (holdsAdminGrantOrRaise).
 */
async function grantsOrRaise(normalized: string): Promise<AdminGrants> {
  // Archived rows count, which keeps the pre-A.56 answer: a grant is revoked in Settings, not by archiving.
  // The person and the role catalogue do not depend on each other (SR.1.6).
  const [peopleRes, catalogue] = await Promise.all([peopleByEmail(normalized, { archived: "include" }), liveRoles()]);
  const people = mustRows(peopleRes, "[admin register] people");
  if (people.length === 0) return NONE;
  const roles = catalogue.filter((r) => r.key === "admin" || r.key === "super-admin");
  if (roles.length === 0) return NONE;
  const grants = mustRows(
    await companyOs
      .from("access_role_assignments")
      .select("role_id")
      .in("person_id", people.map((p) => p.id))
      .in("role_id", roles.map((r) => r.id))
      .is("revoked_at", null),
    "[admin register] access_role_assignments",
  );
  const held = new Set(grants.map((g) => roles.find((r) => r.id === g.role_id)?.key));
  return { admin: held.has("admin"), superAdmin: held.has("super-admin") };
}

/** Whether the person with this email holds a live Admin or Super Admin grant. A failed read is logged and answers "no grant". */
export const adminGrantsByEmail = perRender(async (email: string | null | undefined): Promise<AdminGrants> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return NONE;
  try {
    return await grantsOrRaise(normalized);
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error(`[read] ${err.what}`, err.reason);
    return NONE;
  }
});

/**
 * How many live grants of the Admin or Super Admin role exist. Zero Admin grants
 * is what opens the ADMIN_ALLOWLIST bootstrap, and one Super Admin grant is the
 * last one, which may not be revoked. Zero is the permissive answer to both, so
 * a failed read raises (mustCount) rather than reading as zero. A role that is
 * missing or archived has no live grants.
 */
export async function liveGrantCount(roleKey: "admin" | "super-admin"): Promise<number> {
  const role = mustRows(
    await companyOs.from("access_roles").select("id").eq("key", roleKey).is("archived_at", null).limit(1),
    "[admin register] access_roles",
  )[0];
  if (!role) return 0;
  return mustCount(
    await companyOs.from("access_role_assignments").select("id", { count: "exact", head: true }).eq("role_id", role.id).is("revoked_at", null),
    "[admin register] access_role_assignments count",
  );
}

// The bootstrap allowlist from the environment. Editing it requires a redeploy.
// It names who may enter a deployment that has no Admin grant yet; it is not a
// second register of admins (B.28, AC.20).
export function envAllowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// The bootstrap (ADR 0013, spec story 29): an ADMIN_ALLOWLIST address holds
// Admin AND Super Admin while no live Admin grant exists anywhere, so the first
// person into an empty system can grant the first roles. Once one Admin grant
// exists the allowlist grants nothing, and the boot log says so until it is
// emptied (admin-bootstrap.ts). The count is read only for an allowlisted
// address without a grant, and a failed count raises (liveGrantCount uses
// mustCount): "no grants" is the permissive branch, so a database hiccup must
// never read as it.
async function bootstrapHolds(normalized: string): Promise<boolean> {
  if (!envAllowlist().has(normalized)) return false;
  return (await liveGrantCount("admin")) === 0;
}

/**
 * Whether the email's person holds the Admin role as a fact of the register: a
 * live Admin or Super Admin grant, or the bootstrap. The kernel's `admin` role
 * comes from this (access.ts) and nothing else does: "is an admin" in the
 * product means holding `surface.admin` (ADR 0014), which the Admin role gives
 * by declaration and a custom role may give too. A Super Admin grant alone
 * counts, so a grant of Super Admin without Admin never leaves someone holding
 * the sensitive atoms of a view they cannot enter (2026-10-07). A failed grants
 * read answers "no grant", so a hiccup refuses rather than admits.
 */
export async function holdsAdminGrant(email: string | null | undefined): Promise<boolean> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const grants = await adminGrantsByEmail(normalized);
  if (grants.admin || grants.superAdmin) return true;
  return bootstrapHolds(normalized);
}

/**
 * holdsAdminGrant for a caller where "not an admin" is the PERMISSIVE answer:
 * the portal's uploader label shows a non-admin's name to a client, so a failed
 * read answered "no grant" would put a staffer's name on a client's screen
 * (A.56). Every read here raises a ReadFailure instead, the grants and the
 * bootstrap count alike, and the caller names its own fallback.
 */
export const holdsAdminGrantOrRaise = perRender(async (email: string | null | undefined): Promise<boolean> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const grants = await grantsOrRaise(normalized);
  if (grants.admin || grants.superAdmin) return true;
  return bootstrapHolds(normalized);
});

/**
 * Whether the email's person holds the Super Admin role as a fact of the
 * register: a live Super Admin grant, or the bootstrap (the first admin of an
 * empty system must be able to grant the first Super Admin). The kernel's
 * `super-admin` role comes from this; what it may see is its atoms, among them
 * people.pay and people.identity (ADR 0014). A failed read is "no grant".
 */
export const holdsSuperAdminGrant = perRender(async (email: string | null | undefined): Promise<boolean> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  if ((await adminGrantsByEmail(normalized)).superAdmin) return true;
  return bootstrapHolds(normalized);
});

/**
 * Every person row with this email. Usually one; more than one is the duplicate
 * that B.28 found, and a rule about "yourself" must count every row that is you.
 * A failed read raises, because "nobody" would let a refusal about yourself pass.
 */
export async function personIdsByEmail(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  // Archived rows count, which keeps the pre-A.56 answer: an archived duplicate is still you.
  return mustRows(await peopleByEmail(normalized, { archived: "include" }), "[admin register] people").map((p) => p.id);
}
