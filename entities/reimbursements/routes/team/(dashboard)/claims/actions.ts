"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember, type TeamActor } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { claimWriterFor, createClaim, deleteDraftClaim, transitionClaim, type ClaimActor } from "@/entities/reimbursements/lib/claim-lifecycle";
import { addClaimItem, startDroppedReceipt, updateClaimItem, type ClaimItemInputType } from "@/entities/reimbursements/lib/claim-items";
import { markClaimItemRemoved, removeClaimItem } from "@/entities/reimbursements/lib/item-removal";
import { readReceipt } from "@/entities/reimbursements/lib/receipt-reading";
import { readBankDeduction } from "@/entities/reimbursements/lib/bank-deduction-reading";
import { joinLoneRow, unjoinDocument } from "@/entities/reimbursements/lib/item-joining";
import { refileDocument } from "@/entities/reimbursements/lib/file-kind";
import { isDocumentKind } from "@/entities/reimbursements/lib/claim-labels";
import { updateItemAmounts, type ItemAmountsInputType } from "@/entities/reimbursements/lib/item-amounts";
import { cancelReceiptUpload, confirmReceiptUpload, signReceiptDownload } from "@/entities/reimbursements/lib/claim-files";
import { signOwnBankReceipt } from "@/entities/reimbursements/lib/payments";
import { readClaimRow } from "@/entities/reimbursements/lib/own-claims";
import { createTrip, readTrip, setClaimTrip } from "@/entities/reimbursements/lib/trips";
import type { Trip, TripInputType } from "@/entities/reimbursements/lib/trip-rules";
import {
  BankDetailsInput,
  bankFieldsChanged,
  bankPatch,
  confirmBankDetailsOnClaim,
  type BankDetailsInputType,
} from "@/entities/reimbursements/lib/own-bank-details";
import { upsertPeopleSensitive } from "@/entities/crm";
import { sendBankChangeAlert } from "@/kernel/messaging/email";
import { claimPaths } from "@/entities/reimbursements/lib/paths";
import { Id, refresh } from "@/entities/reimbursements/lib/action-inputs";

// The owner's actions on their own claims (/team/claims, design §1.5): every
// one asks for `reimbursements.mine` first, then the team member it names, and
// hands the lib modules that person's id, which every read and write filters
// on in the query. A claim id from someone else's claim is "Claim not found".
// No action here decides a claim: checking, approving and paying are other
// permissions, on other pages, in later tickets.

const TripId = z.string().uuid("That event was not found.");

function owner(actor: TeamActor): ClaimActor {
  return { kind: "owner", personId: actor.personId, mayDecideOwn: false, label: actor.displayName };
}

// A move by the owner shows on the deciders' queues too, so every surface the claim is on refreshes.
const refreshClaim = (claimId?: string) => refresh(claimPaths(claimId));

/**
 * Starts a claim as a draft, naming the trip it belongs to when one was
 * picked (RB.11), and answers its id, so the page can open it.
 */
export async function startClaim(title: string, tripEventId?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  let trip: string | null = null;
  if (tripEventId) {
    const id = TripId.safeParse(tripEventId);
    if (!id.success || !(await readTrip(id.data))) return { ok: false, error: "That event was not found." };
    trip = id.data;
  }
  const created = await createClaim({
    title: String(title ?? ""),
    tripEventId: trip,
    owner: { personId: actor.personId, teamMemberId: actor.teamMemberId },
    actor: owner(actor),
  });
  if (created.ok) refreshClaim();
  return created;
}

/**
 * Adds a trip from the claim form (RB.11): a draft, internal event the person
 * owns, so it never reaches the public events pages. Answers the trip so the
 * picker can select it at once.
 */
export async function addOwnTrip(input: TripInputType): Promise<{ ok: true; trip: Trip } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  return createTrip({ input, personId: actor.personId, actorLabel: actor.displayName });
}

/** Names a trip on one of the owner's claims, or clears it, while the claim is theirs to change. */
export async function setOwnClaimTrip(claimId: string, tripEventId: string | null): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  let trip: string | null = null;
  if (tripEventId) {
    const parsed = TripId.safeParse(tripEventId);
    if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
    trip = parsed.data;
  }
  const set = await setClaimTrip({ claimId: id.data, personId: actor.personId, tripEventId: trip });
  if (set.ok) refreshClaim(id.data);
  return set;
}

/** Submit, resubmit (a sent-back claim) or withdraw (a submitted one, back to draft). */
export async function moveOwnClaim(claimId: string, move: "submit" | "withdraw"): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  if (move !== "submit" && move !== "withdraw") return { ok: false, error: "Unknown move." };
  const claim = await readClaimRow(id.data, { ownedBy: actor.personId });
  if (!claim.ok) return claim;
  const moved = await transitionClaim({ row: claim.value, move, actor: owner(actor), write: claimWriterFor(id.data, { ownedBy: actor.personId }) });
  if (moved.ok) refreshClaim(id.data);
  return moved;
}

/** Deletes a draft that was never submitted. */
export async function deleteOwnDraft(claimId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const claim = await readClaimRow(id.data, { ownedBy: actor.personId });
  if (!claim.ok) return claim;
  const deleted = await deleteDraftClaim({ row: claim.value, actor: owner(actor) });
  if (deleted.ok) refreshClaim();
  return deleted;
}

export async function addOwnItem(claimId: string, item: ClaimItemInputType): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const added = await addClaimItem({ claimId: id.data, personId: actor.personId, item });
  if (added.ok) refreshClaim(id.data);
  return added;
}

export async function updateOwnItem(claimId: string, itemId: string, item: ClaimItemInputType): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Receipt not found." };
  const saved = await updateClaimItem({ itemId: id.data, personId: actor.personId, item });
  if (saved.ok) refreshClaim(claimId);
  return saved;
}

/**
 * Deletes a receipt from a draft that was never submitted. From a claim that
 * was, the lib refuses and says to mark it removed instead (plan §10): the
 * database would refuse the delete too.
 */
export async function removeOwnItem(claimId: string, itemId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Receipt not found." };
  const removed = await removeClaimItem({ itemId: id.data, personId: actor.personId });
  if (removed.ok) refreshClaim(claimId);
  return removed;
}

const RemoveReason = z.string().trim().min(1, "Say why you are removing this receipt.").max(1000, "Keep the reason under 1,000 characters.");

/**
 * Takes a receipt off a claim that was ever submitted (sent back, or
 * withdrawn): it stays on the claim, marked removed with the owner's reason,
 * and counts toward nothing (20261008090000).
 */
export async function markOwnItemRemoved(claimId: string, itemId: string, reason: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Receipt not found." };
  const why = RemoveReason.safeParse(reason);
  if (!why.success) return { ok: false, error: zodIssuesToMessage(why.error.issues) };
  const marked = await markClaimItemRemoved({ itemId: id.data, personId: actor.personId, reason: why.data });
  if (marked.ok) refreshClaim(claimId);
  return marked;
}

const Declared = z.object({
  name: z.string().min(1, "The file has no name.").max(255),
  size: z.number().int().nonnegative(),
  type: z.string().max(100),
});

/**
 * The amounts of a receipt whose files were read (RB.26): the amount on the
 * receipt in its currency, and what was paid in dong. A receipt typed by hand
 * with no file keeps the whole form (`updateOwnItem`).
 */
export async function updateOwnItemAmounts(claimId: string, itemId: string, amounts: ItemAmountsInputType): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Receipt not found." };
  const saved = await updateItemAmounts({ itemId: id.data, personId: actor.personId, amounts });
  if (saved.ok) refreshClaim(claimId);
  return saved;
}

/**
 * Joins a bank deduction or a red invoice that came in on its own to the
 * receipt it belongs to (RB.26). Nothing joins by itself. The claim refreshes
 * whatever the answer: a join that half landed says so, and the page must
 * show what the database now holds.
 */
export async function joinOwnRow(claimId: string, loneItemId: string, receiptItemId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const lone = Id.safeParse(loneItemId);
  const receipt = Id.safeParse(receiptItemId);
  if (!lone.success || !receipt.success) return { ok: false, error: "Pick the receipt it belongs to." };
  const joined = await joinLoneRow({ personId: actor.personId, loneItemId: lone.data, receiptItemId: receipt.data });
  refreshClaim(claimId);
  return joined;
}

/**
 * Files one of the owner's documents as what they say it is (RB.26.6): the
 * AI's read is the default, never the last word. Edit calls this for each file
 * whose kind changed, before it saves the amounts.
 */
export async function refileOwnDocument(claimId: string, fileId: string, kind: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(fileId);
  if (!id.success) return { ok: false, error: "File not found." };
  if (!isDocumentKind(kind)) return { ok: false, error: "Pick a receipt, a red invoice or a bank deduction." };
  const refiled = await refileDocument({ personId: actor.personId, fileId: id.data, kind });
  if (refiled.ok) refreshClaim(claimId);
  return refiled;
}

/** Takes a joined bank deduction or red invoice back off its receipt, onto a row of its own (RB.26). */
export async function unjoinOwnDocument(claimId: string, itemId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const item = Id.safeParse(itemId);
  const file = Id.safeParse(fileId);
  if (!item.success || !file.success) return { ok: false, error: "File not found." };
  const unjoined = await unjoinDocument({ personId: actor.personId, itemId: item.data, fileId: file.data });
  refreshClaim(claimId);
  return unjoined;
}

/**
 * Many receipts at once (RB.9): one dropped or photographed file becomes its
 * own new receipt on the claim, and its upload starts. The browser calls this
 * once per file, then uploads them side by side and confirms each.
 */
export async function startOwnDrop(
  claimId: string,
  declared: { name: string; size: number; type: string },
): Promise<{ ok: true; itemId: string; fileId: string; bucket: string; path: string; token: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const file = Declared.safeParse(declared);
  if (!file.success) return { ok: false, error: zodIssuesToMessage(file.error.issues) };
  return startDroppedReceipt({ claimId: id.data, personId: actor.personId, declared: file.data });
}

/**
 * Confirms an upload, then has the AI read it once (RB.9, design §1.9) while
 * its item has no reading yet, or, for a bank deduction, for the amount the
 * bank took (RB.20). The reading fills in only what the person left
 * empty and raises warnings; a reading that fails is logged and never fails
 * the upload, which has already landed. The person's own file, confirmed by
 * the line before, is the only one read.
 */
export async function confirmOwnUpload(claimId: string, fileId: string): Promise<{ ok: true; asDeduction: boolean } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(fileId);
  if (!id.success) return { ok: false, error: "File not found." };
  const confirmed = await confirmReceiptUpload({ fileId: id.data, personId: actor.personId });
  // Whether the reading filed it as a bank deduction (RB.26), so the drop row can say to join it.
  let asDeduction = false;
  if (confirmed.ok) {
    // A bank deduction is read for its dong figure (RB.20); every other document as the receipt.
    if (confirmed.kind === "bank_deduction") {
      const read = await readBankDeduction(id.data);
      if (!read.ok) console.error("[reimbursements] reading a bank deduction after its upload", read.error);
    } else {
      const read = await readReceipt(id.data, { onlyIfUnread: true, fileDeductions: true });
      if (!read.ok) console.error("[reimbursements] reading a document after its upload", read.error);
      else asDeduction = read.filedAsDeduction === true;
    }
  }
  refreshClaim(claimId);
  return confirmed.ok ? { ok: true, asDeduction } : confirmed;
}

export async function cancelOwnUpload(fileId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(fileId);
  if (!id.success) return { ok: false, error: "File not found." };
  return cancelReceiptUpload({ fileId: id.data, personId: actor.personId });
}

/** A one-minute link to one of the owner's documents, signed when asked for. */
export async function openOwnFile(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(fileId);
  if (!id.success) return { ok: false, error: "File not found." };
  return signReceiptDownload({ fileId: id.data, personId: actor.personId });
}

/**
 * A one-minute link to the bank's receipt for the transfer that paid one of
 * the owner's claims (RB.7, decision 7: the Paid email links here). Read
 * through the claim, filtered to the owner; the file id the page names must be
 * that payment's receipt.
 */
export async function openOwnBankReceipt(claimId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  const file = Id.safeParse(fileId);
  if (!id.success || !file.success) return { ok: false, error: "File not found." };
  return signOwnBankReceipt({ claimId: id.data, personId: actor.personId, fileId: file.data });
}

/**
 * Confirm or change the bank details a claim is paid to (RB.5). Writes only
 * the signed-in person's own people_sensitive row, through crm's upsert, which
 * audits the field names that changed and never their values. The alert to
 * the person and HR is the caller's job, as on /team/profile, so it is sent
 * here, and only when a bank field actually changed: confirming details that
 * are already right sends nothing.
 */
export async function saveOwnBankDetails(input: BankDetailsInputType): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const parsed = BankDetailsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const saved = await upsertPeopleSensitive(actor.personId, bankPatch(parsed.data), actor.email);
  if (!saved.ok) return saved;
  if (bankFieldsChanged(saved.changed) && actor.email.includes("@")) {
    await sendBankChangeAlert({ employeeName: actor.displayName, employeeEmail: actor.email });
  }
  revalidatePath("/team/claims", "layout");
  revalidatePath("/team/profile");
  return { ok: true };
}

/**
 * "These are right": records on the owner's own claim that they confirmed the
 * bank details on file (RB.5), so the panel still says so after a reload and
 * the payer can see it. Nothing is written to people_sensitive and no alert
 * goes out: nothing changed.
 */
export async function confirmOwnBankDetails(claimId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const confirmed = await confirmBankDetailsOnClaim({ claimId: id.data, personId: actor.personId, actorLabel: actor.displayName });
  if (confirmed.ok) refreshClaim(id.data);
  return confirmed;
}
