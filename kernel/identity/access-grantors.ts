// Who can grant access, for the page that tells a refused person whom to ask
// (AC.16). Granting is access.manage, which the kernel gives the super-admin
// role (kernel/identity/permissions.ts), and since AC.20 a Super Admin is
// whoever holds a live Super Admin grant in Settings, Access.
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { personName } from "@/kernel/config/people-name";

/** What the page says when no grantor can be named: informational, so a vague answer beats a failed page. */
export const GRANTOR_FALLBACK = "a Super Admin";

type Named = { display_name: string | null; preferred_name: string | null; full_name: string | null; email: string | null };

/** The names of the people who may grant access; never empty. */
export async function accessGrantorNames(): Promise<string[]> {
  const rows = readOr(
    await companyOs
      .from("access_role_assignments")
      .select("person:people!person_id(display_name, preferred_name, full_name, email), role:access_roles!role_id(key, archived_at)")
      .is("revoked_at", null)
      .order("created_at"),
    "[access] Super Admin grants",
    [] as { person: Named | null; role: { key: string; archived_at: string | null } | null }[],
  );
  const names = new Set<string>();
  for (const r of rows) {
    const role = Array.isArray(r.role) ? r.role[0] : r.role;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    if (role?.key === "super-admin" && !role.archived_at && person) names.add(personName(person));
  }
  return names.size > 0 ? [...names] : [GRANTOR_FALLBACK];
}
