import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { actorDisplayName } from "@/kernel/config/people-name";

/**
 * How the signed-in account is named in its own shell, by the rule the Team
 * actor uses (actorDisplayName): preferred, then first, then full name, then
 * the address. The Admin surface knows its user only by the sign-in, so its
 * account row (TH.29) asks this of the person linked to that sign-in, and
 * names them as Team does instead of by their email alone.
 *
 * By the sign-in, never by the access check's person: while a Super Admin
 * assumes someone, that person is the one assumed, but the row's face and
 * address are still the admin's own, and a name from the other would mislabel
 * who is signed in (the boundary review on PR #2340).
 *
 * `address` when no person is linked or the read fails: the sign-in address,
 * which is what the row showed before, so a failure costs a name and nothing
 * else.
 */
export async function displayNameOfAuthUser(authUserId: string, address: string): Promise<string> {
  const rows = readOr(
    await companyOs.from("people").select("preferred_name, first_name, full_name, email").eq("auth_user_id", authUserId).limit(1),
    "[identity] people (display name)",
    [],
  );
  const person = rows[0];
  return person ? actorDisplayName({ ...person, email: person.email ?? address }) : address;
}
