// The payer's read of the bank details of the people in one payment run (design
// §1.11, RB.6). Bank details live only in people_sensitive and are read here
// through the contacts door, for the run's people and nobody else, by a caller
// whose guard is reimbursements.pay. Every read is audited before anything is
// shown or sent: the run's page, and its spreadsheet before the first byte.
//
// The audit row names people_sensitive, says what was read and for which
// run, and its operation is "read": company_os.audit_log's operation check
// accepts it since 20261008090000 (design §1.11: "it gains view rather than
// mislabelling the read"). Until then it was recorded as an "update" with
// `context.access` saying "read"; that context stays, so a query written for
// the older rows still finds the newer ones.
import { selectPeopleSensitive } from "@/entities/contacts";
import { recordAudit } from "@/kernel/audit/audit";
import { ReadFailure } from "@/kernel/data/read";

const READ_OPERATION = "read" as const;

/** One person's bank details as the payer copies them into the bank. */
export type PayeeBank = { bankName: string; accountNumber: string; branch: string };

/** Why the details were read: the run's page, its spreadsheet, or the masked record a recorded payment keeps. */
export type BankReadPurpose = "run_page" | "run_spreadsheet" | "payment_snapshot";

/**
 * The bank details of `personIds`, by person id, for the run `runId`. A
 * person with nothing on file is absent from the map. A failed read raises:
 * an empty map would show "no bank details" for someone who has them.
 */
export async function readRunBankDetails(input: { runId: string; personIds: string[]; actor: string | null; purpose: BankReadPurpose }): Promise<Map<string, PayeeBank>> {
  const out = new Map<string, PayeeBank>();
  const ids = [...new Set(input.personIds)];
  if (ids.length === 0) return out;
  const { data, error } = await selectPeopleSensitive("person_id, bank_name, bank_account_number, bank_branch").in("person_id", ids);
  if (error) throw new ReadFailure("[reimbursements/bank] people_sensitive for a payment run", error.message);
  await recordAudit({
    table: "people_sensitive",
    recordId: null,
    operation: READ_OPERATION,
    actor: input.actor,
    context: { access: "read", bankDetailsViewed: true, runId: input.runId, purpose: input.purpose, personIds: ids },
  });
  for (const r of (data ?? []) as Record<string, string | null>[]) {
    const bank = { bankName: r.bank_name ?? "", accountNumber: r.bank_account_number ?? "", branch: r.bank_branch ?? "" };
    if (bank.bankName || bank.accountNumber || bank.branch) out.set(String(r.person_id), bank);
  }
  return out;
}

/**
 * One payee's bank details, read when their payment is recorded so the
 * payment keeps a masked record of the account (design §1.1). Audited like
 * the run's read. Answers a failed read rather than raising, so recording
 * refuses and says why.
 */
export async function readPayeeBank(input: { personId: string; runId: string; actor: string | null }): Promise<{ ok: true; bank: PayeeBank | null } | { ok: false; error: string }> {
  try {
    const banks = await readRunBankDetails({ runId: input.runId, personIds: [input.personId], actor: input.actor, purpose: "payment_snapshot" });
    return { ok: true, bank: banks.get(input.personId) ?? null };
  } catch (err) {
    return { ok: false, error: `Could not read the bank details: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The masked record of where money went (design §1.1): the bank's name and the account's last four digits. Pure. */
export function maskedSnapshot(bank: PayeeBank | null): { bank_name_snapshot: string | null; bank_account_last4: string | null } {
  if (!bank) return { bank_name_snapshot: null, bank_account_last4: null };
  const digits = bank.accountNumber.replace(/\D/g, "");
  return { bank_name_snapshot: bank.bankName.trim() || null, bank_account_last4: digits ? digits.slice(-4) : null };
}
