// Saving the company's bank account (AD.13).
//
// company_os.audit_log is not closed the way the account's own table is:
// chatbot_reader and chatbot_writer both read it. So the audit row of a change
// says that the account changed, who changed it and why, and never holds the
// bank, the number or the holder. Writing them there would hand the assistants
// what the table keeps from them.
//
// The same goes for the compare-and-set. A filter travels in the request's URL, and URLs reach
// request logs, so it compares `updated_at` and never the account's own values.
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import type { StoredBankAccount } from "./company-bank";
import type { BankAccountInput } from "./company-bank-rules";
import { LEGAL_ENTITIES_AUDIT_TABLE } from "./legal-entities";
import { STALE_CHANGE } from "./legal-entity-write";
import { insertLegalEntitiesSensitive, updateLegalEntitiesSensitive } from "./writes";

/** Postgres' unique_violation: someone saved the first account between the read and this insert. */
const UNIQUE_VIOLATION = "23505";

/**
 * Save a checked account, compare-and-set against the one the change was checked
 * on, so a second person's save finds no row and is told to reload. Errors name
 * no value: a database message can quote the row it refused.
 */
export async function saveBankAccount(legalEntityId: string, stored: StoredBankAccount | null, next: BankAccountInput, by: { actor: string | null; reason: string }): Promise<Result> {
  const columns = { bank_name: next.bankName, bank_account_number: next.accountNumber, bank_account_holder: next.holder };
  if (stored) {
    const { data, error } = await updateLegalEntitiesSensitive(columns)
      .eq("legal_entity_id", legalEntityId)
      .eq("updated_at", stored.updatedAt)
      .select("legal_entity_id");
    if (error) return { ok: false, error: "Could not save the bank account. Nothing was changed." };
    if (!data || data.length === 0) return { ok: false, error: STALE_CHANGE };
  } else {
    const { error } = await insertLegalEntitiesSensitive({ legal_entity_id: legalEntityId, ...columns });
    if (error) return { ok: false, error: (error as { code?: string }).code === UNIQUE_VIOLATION ? STALE_CHANGE : "Could not save the bank account. Nothing was changed." };
  }
  await recordAudit({
    table: LEGAL_ENTITIES_AUDIT_TABLE,
    recordId: legalEntityId,
    operation: "update",
    actor: by.actor,
    newData: { bank_account: stored ? "changed" : "set" },
    context: { reason: by.reason },
  });
  return { ok: true };
}
