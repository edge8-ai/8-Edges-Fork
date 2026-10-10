// The owner's bank details on their own claim (design §1.1, §1.11; RB.5).
//
// Bank details are not copied into this entity: they live only in
// people_sensitive, read here through the contacts door and written back by
// the claim page's action through crm's upsertPeopleSensitive, which audits by
// field name. Only the claim owner's own row is ever read here; the payer's
// read of a run's people is a separate, audited module (RB.6). What this
// entity keeps is the fact, never the values: whether details are on file
// (a claim is not submitted without them) and when the owner confirmed them
// on a claim (`metadata.bankConfirmedAt`).
import { z } from "zod";
import { selectPeopleSensitive } from "@/entities/contacts";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { ReadFailure } from "@/kernel/data/read";
import { OWNER_OPEN } from "./claim-rules";
import { selectReimbursementClaims } from "./reads";
import { updateReimbursementClaims } from "./writes";

/** What the claim page shows and the person confirms or changes. */
export type BankDetails = { bankName: string; accountNumber: string; branch: string };

const BANK_COLUMNS = "bank_name, bank_account_number, bank_branch";

// The fields people_sensitive's audit names when one of them changed, which is
// what decides whether the bank-change alert goes out.
const BANK_FIELDS = new Set(["bank_name", "bank_account_number", "bank_branch"]);

/** True when a write changed any bank field. */
export function bankFieldsChanged(changed: readonly string[]): boolean {
  return changed.some((f) => BANK_FIELDS.has(f));
}

/**
 * The person's bank details, or null when none are on file. A failed read is
 * raised rather than shown as an empty form, because an empty form invites the
 * person to type over details that are really there.
 */
export async function readOwnBankDetails(personId: string): Promise<BankDetails | null> {
  const { data, error } = await selectPeopleSensitive(BANK_COLUMNS).eq("person_id", personId).maybeSingle();
  if (error) throw new ReadFailure("[reimbursements/bank] people_sensitive", error.message);
  const row = (data ?? null) as Record<string, string | null> | null;
  const details = {
    bankName: row?.bank_name ?? "",
    accountNumber: row?.bank_account_number ?? "",
    branch: row?.bank_branch ?? "",
  };
  return details.bankName || details.accountNumber || details.branch ? details : null;
}

/** Whether Finance could pay to these details: a bank's name and an account number. The branch is optional. */
export function bankDetailsOnFile(details: { bankName: string; accountNumber: string } | null): boolean {
  return Boolean(details?.bankName.trim() && details.accountNumber.trim());
}

/**
 * Whether the person has details Finance could pay to, for the submit rule.
 * Answers a failed read rather than raising, so the move that asked refuses
 * and says why. Only the two facts the rule needs are selected.
 */
export async function readBankDetailsOnFile(personId: string): Promise<{ ok: true; onFile: boolean } | { ok: false; error: string }> {
  const { data, error } = await selectPeopleSensitive("bank_name, bank_account_number").eq("person_id", personId).maybeSingle();
  if (error) return { ok: false, error: `Could not read your bank details: ${error.message}` };
  const row = (data ?? null) as Record<string, string | null> | null;
  return { ok: true, onFile: bankDetailsOnFile(row ? { bankName: row.bank_name ?? "", accountNumber: row.bank_account_number ?? "" } : null) };
}

// While the claim is still the owner's to change (OWNER_OPEN, the statuses
// ownerCan reads): confirming where to be paid is part of getting it ready,
// and a decided claim's record stays as it was.
const CONFIRMABLE: readonly string[] = OWNER_OPEN;

/** Whether "These are right" is offered on a claim in this status. */
export function bankConfirmable(status: string): boolean {
  return CONFIRMABLE.includes(status);
}

/**
 * Records on the owner's claim that they confirmed their bank details
 * (`metadata.bankConfirmedAt`, no column of its own), so the confirmation
 * survives a reload and is there for the payer (RB.6). The read and the write
 * are both filtered to the owner, and the write to a claim still theirs to
 * change, so a claim submitted from another tab in between is left alone.
 */
export async function confirmBankDetailsOnClaim(input: { claimId: string; personId: string; actorLabel: string | null }): Promise<Result> {
  const { claimId, personId } = input;
  const { data: claim, error } = await selectReimbursementClaims("id, status, metadata").eq("id", claimId).eq("person_id", personId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the claim: ${error.message}` };
  if (!claim) return { ok: false, error: "Claim not found." };
  if (!bankConfirmable(String(claim.status))) return { ok: false, error: "Bank details are confirmed while the claim is yours to change." };
  const onFile = await readBankDetailsOnFile(personId);
  if (!onFile.ok) return onFile;
  if (!onFile.onFile) return { ok: false, error: "Add your bank details before confirming them." };
  const metadata = { ...((claim.metadata ?? {}) as Record<string, unknown>), bankConfirmedAt: new Date().toISOString() };
  const { data: landed, error: writeError } = await updateReimbursementClaims({ metadata })
    .eq("id", claimId)
    .eq("person_id", personId)
    .in("status", CONFIRMABLE)
    .select("id");
  if (writeError) return { ok: false, error: `Could not record the confirmation: ${writeError.message}` };
  if (!landed?.length) return { ok: false, error: "This claim changed while you were working on it. Reload and try again." };
  await recordAudit({
    table: "reimbursement_claims",
    recordId: claimId,
    operation: "update",
    actor: input.actorLabel,
    newData: { bankConfirmedAt: metadata.bankConfirmedAt },
    context: { move: "confirm_bank_details" },
  });
  return { ok: true };
}

// An account Finance can transfer to: a bank's name and an account number of
// digits, which people often group with spaces or dashes. The branch is
// optional, because most Vietnamese banks no longer ask for it.
export const BankDetailsInput = z.object({
  bankName: z.string().trim().min(1, "Add the bank's name.").max(120, "The bank's name is too long."),
  accountNumber: z
    .string()
    .trim()
    .min(1, "Add the account number.")
    .max(40, "The account number is too long.")
    .regex(/^[0-9][0-9 -]*[0-9]$|^[0-9]$/, "The account number is digits only (spaces and dashes are fine)."),
  branch: z.string().trim().max(120, "The branch is too long."),
});
export type BankDetailsInputType = z.input<typeof BankDetailsInput>;

/** The people_sensitive columns a confirmed form writes; an empty branch clears it. */
export function bankPatch(details: z.output<typeof BankDetailsInput>) {
  return {
    bank_name: details.bankName,
    bank_account_number: details.accountNumber,
    bank_branch: details.branch || null,
  };
}
