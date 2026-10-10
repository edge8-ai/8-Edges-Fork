// The person behind a sign-in that carries only an email. The admin session is
// the common case: requireAdmin answers { id, email }, while everything a
// person owns (an inbox, an approval they decided) is keyed on people.id. The
// same lookup had been copied inline across several entities, each escaping the
// address its own way; this is the one copy (S.5).
import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { escapeLikeLiteral } from "@/kernel/data/postgrest-filter";

/** people.id for this email, matched case-insensitively and literally; null when nobody has it. */
export async function personIdForEmail(email: string | null | undefined): Promise<string | null> {
  const address = email?.trim();
  if (!address) return null;
  const { data, error } = await companyOs
    .from("people")
    .select("id")
    .ilike("email", escapeLikeLiteral(address))
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new ReadFailure("[identity] people by email", error.message);
  return data?.id ?? null;
}

/**
 * The same lookup for a caller recording WHO did something after the fact
 * itself has landed (a decision, an approval row): a failed lookup is logged and
 * answers null, because the record without a name is still true and the action
 * it records must not fail over a name. `where` names the caller in the log.
 */
export async function personIdForEmailOrNull(email: string | null | undefined, where: string): Promise<string | null> {
  return personIdForEmail(email).catch((err) => {
    console.error(`[${where}] person by email`, err instanceof Error ? err.message : err);
    return null;
  });
}
