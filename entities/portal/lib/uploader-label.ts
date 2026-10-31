import { companyOs } from "@/kernel/data/supabase";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { peopleByEmails } from "@/kernel/identity/person-by-email";
import { holdsAdminGrantOrRaise } from "@/kernel/identity/admin-register";

// Who uploaded a document, as a client may read it (S.16.21, S.16.24).
//
// program_documents.uploaded_by stores the uploader's EMAIL, and the portal's
// list printed it whenever no name was resolved — so a client could read a
// staff member's address, or another client contact's. The portal says
// "Edge8" for anything staff uploaded (a client is working with the company,
// not with whoever held the file), the person's name for a client contact,
// and nothing at all for an uploader it cannot name. Never the address: the
// name comes from NAME_ONLY_COLUMNS, which carries no email for personName()
// to fall back to.
//
// STAFF is anyone with a team_members row, whatever its status, or an admin.
// Not people.is_team_member, which is /team ACCESS: revoking it made a former
// staffer read under their personal name (S.16.24). An admin is whoever the
// grant register says holds Admin or Super Admin (kernel/identity/
// admin-register.ts, AC.20), the bootstrap allowlist included; until A.56 this
// read company_os.admins, a table nothing else has read since the cutover.

/** What a client reads for a staff upload. */
export const STAFF_UPLOADER = "Edge8";

export type Uploader = NamedPerson & { staff: boolean };

/** The label for one uploader, or null to say nothing. Never an email. */
export function uploaderLabel(person: Uploader | undefined): string | null {
  if (!person) return null;
  if (person.staff) return STAFF_UPLOADER;
  return personName({ display_name: person.display_name, preferred_name: person.preferred_name, full_name: person.full_name }, null);
}

type PersonRow = { id: string; email: string | null; display_name: string | null; preferred_name: string | null; full_name: string | null };

/**
 * Labels for a list's uploaders, keyed by lower-cased email. Emails match
 * whatever their capitals (S.16.24): people.email keeps them as typed.
 *
 * Any failed read names nobody, which the list shows as no uploader at all:
 * the one fallback that cannot put an address, or a staffer's personal name,
 * on screen.
 */
export async function uploaderLabels(emails: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  // Archived rows count, which keeps the pre-A.56 answer.
  const [people, adminEmails] = await Promise.all([
    peopleByEmails<PersonRow>(unique, { columns: `id, email, ${NAME_ONLY_COLUMNS}`, archived: "include" }),
    adminUploaders(unique),
  ]);
  if (people.error || !adminEmails) {
    if (people.error) console.error("[portal] uploader lookup failed:", people.error.message);
    return out;
  }
  const rows = people.data;

  const ids = rows.map((p) => p.id);
  const teamPeople = new Set<string>();
  if (ids.length > 0) {
    const team = await companyOs.from("team_members").select("person_id").in("person_id", ids);
    if (team.error) {
      console.error("[portal] uploader lookup failed:", team.error.message);
      return out;
    }
    for (const t of (team.data ?? []) as { person_id: string | null }[]) if (t.person_id) teamPeople.add(t.person_id);
  }

  // An admin with no people row (the bootstrap allowlist) is still staff.
  for (const email of adminEmails) out.set(email, STAFF_UPLOADER);
  for (const p of rows) {
    const email = p.email!.toLowerCase();
    const staff = adminEmails.has(email) || teamPeople.has(p.id);
    const label = uploaderLabel({ ...p, staff });
    if (label) out.set(email, label);
  }
  return out;
}

/**
 * The uploaders who hold Admin or Super Admin, by lower-cased email; null when
 * the check could not be made, which names nobody, as every other failed read
 * in this file does. Not holdsAdminGrant: it answers "no grant" on a failed
 * read, the restrictive answer at the admin gate, but here "not an admin" is
 * the permissive one: it would put an admin's personal name on a client's
 * screen. holdsAdminGrantOrRaise raises instead, and this names nobody.
 */
async function adminUploaders(emails: string[]): Promise<Set<string> | null> {
  try {
    const held = await Promise.all(emails.map((e) => holdsAdminGrantOrRaise(e)));
    return new Set(emails.filter((_, i) => held[i]));
  } catch (err) {
    console.error("[portal] uploader lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
