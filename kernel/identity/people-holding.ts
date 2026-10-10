// Who holds a permission (design §1.8): the people a message about work that
// waits on a role, not on a person, is addressed to — the approvers told that
// a claim was checked, the Monday nudge's checkers and approvers. One read
// over the registers Settings → Access writes, by permission key, lifted here
// so no two entities spell it twice.
//
// It answers the holders through a granted role: a live grant of an
// unarchived role carrying an unrevoked pair. Implied roles (team-member,
// manager, coach…) are facts, not rows, and a role-addressed message is never
// sent to everyone a fact reaches, so they are left out on purpose. A caller
// that links to a page still asks each recipient's access of that page
// (`recipientMayOpen`), because a scope or a surface can stop a holder at it.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

/** The people ids holding `permission` through a live grant, each once, in the order the grants were read. */
export async function peopleHolding(permission: string): Promise<string[]> {
  // A failed read throws (A.12): "nobody holds it" would silently tell nobody.
  const pairs = mustRows(
    await companyOs.from("access_role_permissions").select("role_id").eq("permission", permission).is("revoked_at", null),
    "[access] who holds a permission: access_role_permissions",
  );
  if (pairs.length === 0) return [];
  const roles = mustRows(
    await companyOs
      .from("access_roles")
      .select("id")
      .in("id", [...new Set(pairs.map((p) => p.role_id))])
      .is("archived_at", null),
    "[access] who holds a permission: access_roles",
  );
  if (roles.length === 0) return [];
  const grants = mustRows(
    await companyOs
      .from("access_role_assignments")
      .select("person_id")
      .in(
        "role_id",
        roles.map((r) => r.id),
      )
      .is("revoked_at", null),
    "[access] who holds a permission: access_role_assignments",
  );
  return [...new Set(grants.map((g) => g.person_id))];
}
