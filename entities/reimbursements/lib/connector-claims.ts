// Server-only. The owner's claim steps the Team Portal connector (MCP) takes on
// their behalf: drop a receipt into their open claim, and send that claim to
// Finance. Each step is the one the claims page takes (startDroppedReceipt,
// confirmReceiptUpload, readReceipt, transitionClaim), handed the actor the
// connector resolved from its token, so every read and write is filtered to
// their own claims exactly as on /team/claims.
import { supabase } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { claimWriterFor, createClaim, transitionClaim, type ClaimActor } from "./claim-lifecycle";
import { startDroppedReceipt } from "./claim-items";
import { confirmReceiptUpload } from "./claim-files";
import { removeClaimItem } from "./item-removal";
import { readReceipt, type ReceiptReadingType } from "./receipt-reading";
import { listMyClaims } from "./my-claims";
import { readClaimRow } from "./own-claims";

/**
 * The largest receipt the connector takes. A Vercel function accepts a request
 * body of about 4.5 MB, and the file arrives base64-encoded (a third larger),
 * so 3 MB is what fits: a phone photo or a PDF invoice.
 */
export const CONNECTOR_RECEIPT_MAX_BYTES = 3 * 1024 * 1024;

const owner = (actor: TeamActor): ClaimActor => ({ kind: "owner", personId: actor.personId, mayDecideOwn: false, label: actor.displayName });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The person's newest draft claim, or a new one named for this month: "the queue". */
async function openDraft(actor: TeamActor): Promise<{ ok: true; id: string; title: string; created: boolean } | { ok: false; error: string }> {
  const draft = (await listMyClaims(actor.personId)).find((c) => c.status === "draft");
  if (draft) return { ok: true, id: draft.id, title: draft.title, created: false };
  const today = saigonToday();
  const title = `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)} expenses`;
  const created = await createClaim({ title, owner: { personId: actor.personId, teamMemberId: actor.teamMemberId }, actor: owner(actor) });
  return created.ok ? { ok: true, id: created.id, title, created: true } : created;
}

export type AddedReceipt = {
  claimId: string;
  claimTitle: string;
  newClaim: boolean;
  reading: ReceiptReadingType | null;
  /** Set when the file was stored but the AI could not read it: the person fills it in on the claim page. */
  readingNote: string | null;
};

/**
 * Adds one receipt file to the person's open draft claim (starting one when
 * none is open), uploads it, and has the AI read it, as a drop on the claim
 * page does. The reading fills in only what is empty; a failed reading never
 * loses the upload.
 */
export async function addReceiptToOwnQueue(
  actor: TeamActor,
  file: { filename: string; mimeType: string; bytes: Uint8Array },
  claimId?: string,
): Promise<{ ok: true; value: AddedReceipt } | { ok: false; error: string }> {
  if (file.bytes.byteLength === 0) return { ok: false, error: "The receipt file is empty." };
  if (file.bytes.byteLength > CONNECTOR_RECEIPT_MAX_BYTES) return { ok: false, error: "Keep the receipt under 3 MB." };

  let target: { id: string; title: string; created: boolean };
  if (claimId) {
    const claim = await readClaimRow(claimId, { ownedBy: actor.personId });
    if (!claim.ok) return claim;
    target = { id: claimId, title: claim.value.title, created: false };
  } else {
    const draft = await openDraft(actor);
    if (!draft.ok) return draft;
    target = draft;
  }

  const started = await startDroppedReceipt({
    claimId: target.id,
    personId: actor.personId,
    declared: { name: file.filename.slice(0, 255) || "receipt", size: file.bytes.byteLength, type: file.mimeType.slice(0, 100) },
  });
  if (!started.ok) return started;

  // A receipt that did not land is taken off again, so no blank row is left
  // on the draft blocking its submit (the claim page clears its own the same way).
  const takeOff = () => removeClaimItem({ itemId: started.itemId, personId: actor.personId }).catch(() => undefined);
  const { error: uploadError } = await supabase.storage
    .from(started.bucket)
    .uploadToSignedUrl(started.path, started.token, file.bytes, { contentType: file.mimeType });
  if (uploadError) {
    await takeOff();
    return { ok: false, error: `Could not store the receipt: ${uploadError.message}` };
  }

  const confirmed = await confirmReceiptUpload({ fileId: started.fileId, personId: actor.personId });
  if (!confirmed.ok) {
    await takeOff();
    return confirmed;
  }

  let reading: ReceiptReadingType | null = null;
  let readingNote: string | null = null;
  const read = await readReceipt(started.fileId, { onlyIfUnread: true, fileDeductions: true });
  if (read.ok) reading = read.reading;
  else {
    console.error("[reimbursements] connector reading a receipt", read.error);
    readingNote = "The receipt is on the claim, but it could not be read. Fill in the amount and date on the claim page.";
  }
  return { ok: true, value: { claimId: target.id, claimTitle: target.title, newClaim: target.created, reading, readingNote } };
}

/** Sends one of the person's own claims to Finance (or resubmits one sent back), as the claim page's Submit does. */
export async function submitOwnClaim(actor: TeamActor, claimId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const claim = await readClaimRow(claimId, { ownedBy: actor.personId });
  if (!claim.ok) return claim;
  return transitionClaim({ row: claim.value, move: "submit", actor: owner(actor), write: claimWriterFor(claimId, { ownedBy: actor.personId }) });
}
