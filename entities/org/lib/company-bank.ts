// The company's bank account: what a person returning an advance transfers to
// (AD.13). It lives in company_os.legal_entities_sensitive, a table only the
// service role can read, because legal_entities is readable by all three
// assistant roles.
//
// The reads. Saving is company-bank-write.ts.
import { mustRows } from "@/kernel/data/read";
import type { BankAccountInput } from "./company-bank-rules";
import { selectLegalEntities, selectLegalEntitiesSensitive } from "./reads";
import { bankBinOf } from "./vn-banks";

const COLUMNS = "legal_entity_id, bank_name, bank_account_number, bank_account_holder, updated_at";

type Row = { legal_entity_id: string; bank_name: string; bank_account_number: string; bank_account_holder: string; updated_at: string };

/** An account as stored. `updatedAt` is what a save compares against, so the account itself never goes in a filter. */
export type StoredBankAccount = BankAccountInput & { updatedAt: string };

const accountOf = (r: Row): BankAccountInput => ({ bankName: r.bank_name, accountNumber: r.bank_account_number, holder: r.bank_account_holder });

/** Every company's account, by legal entity, for Settings. Raises on a failed read: an account that failed to load must not read as none, or someone types it in again. */
export async function loadBankAccounts(): Promise<Map<string, BankAccountInput>> {
  const rows = mustRows(await selectLegalEntitiesSensitive(COLUMNS), "[org/legal-entities] legal_entities_sensitive") as unknown as Row[];
  return new Map(rows.map((r) => [r.legal_entity_id, accountOf(r)]));
}

/** One company's account, or null when none is on file. Raises on a failed read. */
export async function readBankAccount(legalEntityId: string): Promise<StoredBankAccount | null> {
  const rows = mustRows(await selectLegalEntitiesSensitive(COLUMNS).eq("legal_entity_id", legalEntityId).limit(1), "[org/legal-entities] legal_entities_sensitive") as unknown as Row[];
  return rows[0] ? { ...accountOf(rows[0]), updatedAt: rows[0].updated_at } : null;
}

/** The account a person returns money to. `bin` is null for a stored bank the list no longer holds, and then no QR code is drawn. */
export type CompanyBankAccount = BankAccountInput & { bin: string | null };

/**
 * The account of the active legal entity that keeps its books in VND, the same
 * entity a red invoice names (`redInvoiceBuyerEntity`), or null when none is on
 * file. A question another entity asks through the door: the error comes back
 * for the caller to say what a failure means.
 */
export async function companyBankAccount(): Promise<{ data: CompanyBankAccount | null; error: { message: string } | null }> {
  const { data: entities, error } = await selectLegalEntities("id").eq("base_currency", "vnd").eq("active", true).order("slug").limit(1);
  if (error) return { data: null, error };
  const id = (entities as unknown as { id: string }[] | null)?.[0]?.id;
  if (!id) return { data: null, error: null };
  const { data: rows, error: accountError } = await selectLegalEntitiesSensitive(COLUMNS).eq("legal_entity_id", id).limit(1);
  if (accountError) return { data: null, error: accountError };
  const row = (rows as unknown as Row[] | null)?.[0];
  return { data: row ? { ...accountOf(row), bin: bankBinOf(row.bank_name) } : null, error: null };
}
