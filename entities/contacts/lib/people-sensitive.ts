// The restricted personal record (people_sensitive: legal identity, tax, bank
// details, ID document paths) as other entities read and write it (A.64,
// ADR 0018). The callers are the guard: each one has already decided the
// actor may see this person's record (an admin, the person themselves, a
// payment run) and audits what it reads.
//
// Unlike the other questions in this entity, these never return the union of
// what their callers read. Each question selects only the columns its own
// callers read before A.64, so a caller that wanted a bank's name is never
// handed a tax code it did not ask for (H1-DESIGN rule 7). That is why there
// are several bank questions that differ by a column.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { upsertPeopleSensitiveRow } from "./writes";

/** A person's whole restricted record, or null when none exists yet: the admin editor and the person's own view. */
export async function sensitiveRecordOf(personId: string) {
  return companyOs.from("people_sensitive").select("*").eq("person_id", personId).maybeSingle();
}

export type IdDocumentSide = "front" | "back";

/** The storage path of one side of a person's ID document, or null. Only that one column is read. */
export async function idDocumentPathOf(personId: string, side: IdDocumentSide): Promise<{ data: string | null; error: { message: string } | null }> {
  const table = companyOs.from("people_sensitive");
  if (side === "front") {
    const { data, error } = await table.select("id_front_path").eq("person_id", personId).maybeSingle();
    return { data: data?.id_front_path ?? null, error };
  }
  const { data, error } = await table.select("id_back_path").eq("person_id", personId).maybeSingle();
  return { data: data?.id_back_path ?? null, error };
}

/** A person's bank name, account number and branch, or null: the person's own reimbursement form. */
export async function bankDetailsOf(personId: string) {
  return companyOs.from("people_sensitive").select("bank_name, bank_account_number, bank_branch").eq("person_id", personId).maybeSingle();
}

/** Only a person's bank name and account number, or null: whether Finance could pay them. */
export async function bankNameAndAccountOf(personId: string) {
  return companyOs.from("people_sensitive").select("bank_name, bank_account_number").eq("person_id", personId).maybeSingle();
}

/** A person's bank name and account number as a list of at most one row: the assistant's "my records", which masks the number. */
export async function bankNameAndAccountRowsOf(personId: string) {
  return companyOs.from("people_sensitive").select("person_id, bank_name, bank_account_number").eq("person_id", personId).limit(1);
}

/** The bank details of each of these people: a payment run's payees. */
export async function bankDetailsOfPeople(personIds: string[]) {
  return companyOs.from("people_sensitive").select("person_id, bank_name, bank_account_number, bank_branch").in("person_id", personIds);
}

/** Everyone's tax code and national ID number: matching a payroll workbook's rows to people. */
export async function taxIdentifiersOfEveryone() {
  return companyOs.from("people_sensitive").select("person_id, tax_code, national_id_number");
}

export type SensitivePatch = Omit<TablesInsert<{ schema: "company_os" }, "people_sensitive">, "person_id" | "updated_at">;

/** Write these fields of a person's restricted record, creating it when there is none. Other fields keep their values. */
export async function saveSensitiveFields(personId: string, patch: SensitivePatch) {
  return upsertPeopleSensitiveRow({ person_id: personId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
}
