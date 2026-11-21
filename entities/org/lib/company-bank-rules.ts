// A proposed company bank account, checked as a whole (AD.13). The drawer runs
// this on every keystroke and the action runs it again on the stored row, as the
// other legal entity checks do. Pure and client-safe.
import { bankBinOf } from "./vn-banks";

export type BankAccountInput = { bankName: string; accountNumber: string; holder: string };

/** The longest account holder: a registered legal name, not a paragraph. */
const HOLDER_MAX = 160;
/** A VietQR code carries an account of at most 19 characters, so a longer one could not be paid by it. */
const ACCOUNT = /^[0-9A-Za-z]{4,19}$/;

export type BankAccountCheck = { ok: true; account: BankAccountInput } | { ok: false; error: string; fields: Record<string, string> };

const LABEL: Record<keyof BankAccountInput, string> = { bankName: "Bank", accountNumber: "Account number", holder: "Account holder" };

/** The account as it would be stored, or what is wrong with it. An account is all three fields or none. */
export function checkBankAccount(input: BankAccountInput, stored: BankAccountInput | null): BankAccountCheck {
  // Banks print account numbers in groups, so a pasted number may carry spaces.
  const account = { bankName: input.bankName.trim(), accountNumber: input.accountNumber.replace(/\s/g, ""), holder: input.holder.trim() };
  const fields: Record<string, string> = {};
  if (bankBinOf(account.bankName) === null) fields.bankName = "Choose the bank.";
  if (!ACCOUNT.test(account.accountNumber)) fields.accountNumber = "Enter 4 to 19 letters or digits, as the bank shows it.";
  if (account.holder === "") fields.holder = "Enter the name on the account.";
  else if (account.holder.length > HOLDER_MAX) fields.holder = `Use at most ${HOLDER_MAX} characters.`;
  const wrong = Object.entries(fields);
  if (wrong.length > 0) return { ok: false, error: wrong.map(([k, m]) => `${LABEL[k as keyof BankAccountInput]}: ${m}`).join(" "), fields };
  if (stored && stored.bankName === account.bankName && stored.accountNumber === account.accountNumber && stored.holder === account.holder) {
    return { ok: false, error: "Nothing changed.", fields: {} };
  }
  return { ok: true, account };
}
