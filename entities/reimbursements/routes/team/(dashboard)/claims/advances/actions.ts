"use server";

import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember, type TeamActor } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { ADVANCES_OPEN } from "@/entities/reimbursements/lib/advance-policy";
import { advanceWriterFor, createAdvance, deleteDraftAdvance, editAdvance, readAdvanceRow, transitionAdvance, type AdvanceActor, type AdvanceRow } from "@/entities/reimbursements/lib/advance-lifecycle";
import { cancelAdvanceUpload, confirmAdvanceUpload, removeAdvanceEvidence, signAdvanceFile, startAdvanceUpload } from "@/entities/reimbursements/lib/advance-files";
import { reportReturnSent } from "@/entities/reimbursements/lib/advance-ledger";
import { advanceRef } from "@/entities/reimbursements/lib/advance-rules";
import { advanceTripOf, returnUnspent, settlementClaimOf } from "@/entities/reimbursements/lib/advance-settlement";
import { createClaim } from "@/entities/reimbursements/lib/claim-lifecycle";
import { Id, Reason, refresh } from "@/entities/reimbursements/lib/action-inputs";
import { advancePaths } from "@/entities/reimbursements/lib/paths";
import { readTrip } from "@/entities/reimbursements/lib/trips";

// The owner's actions on their own advances (AD.5): every one asks for
// reimbursements.mine first, then the team member it names, and reads the advance
// through that person. An id from someone else's advance is "Advance not found". No
// action here decides an advance or records money.

const NOT_FOUND = "Advance not found.";
const CLOSED = "Advances are not open yet.";

const Request = z.object({
  purpose: z.string().max(500, "Keep what it is for under 500 characters."),
  amountVnd: z.number(),
  spendEndsOn: z.string().max(10),
  tripEventId: z.string().uuid("That event was not found.").nullable(),
});
type AdvanceRequestInput = z.infer<typeof Request>;

function owner(actor: TeamActor): AdvanceActor {
  return { kind: "owner", personId: actor.personId, mayDecideOwn: false, label: actor.displayName };
}

/** The advance, when it is this person's: someone else's reads exactly as one that does not exist. */
async function ownRow(advanceId: string, personId: string): Promise<AdvanceRow | null> {
  if (!Id.safeParse(advanceId).success) return null;
  const row = await readAdvanceRow(advanceId);
  return row && row.personId === personId ? row : null;
}

async function tripOf(input: AdvanceRequestInput): Promise<{ ok: true; tripId: string | null } | { ok: false; error: string }> {
  if (!input.tripEventId) return { ok: true, tripId: null };
  return (await readTrip(input.tripEventId)) ? { ok: true, tripId: input.tripEventId } : { ok: false, error: "That event was not found." };
}

/** Saves what the form holds: a new draft, or the changes to one the owner may still change. Answers its id. */
export async function saveOwnAdvance(advanceId: string | null, input: AdvanceRequestInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const parsed = Request.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const trip = await tripOf(parsed.data);
  if (!trip.ok) return trip;
  const fields = { purpose: parsed.data.purpose, amountVnd: parsed.data.amountVnd, spendEndsOn: parsed.data.spendEndsOn, tripEventId: trip.tripId };

  if (advanceId === null) {
    if (!ADVANCES_OPEN) return { ok: false, error: CLOSED };
    const created = await createAdvance({ ...fields, owner: { personId: actor.personId, teamMemberId: actor.teamMemberId }, actor: owner(actor) });
    if (created.ok) refresh(advancePaths(created.id));
    return created;
  }
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const edited = await editAdvance({ ...fields, row, actor: owner(actor) });
  if (!edited.ok) return edited;
  refresh(advancePaths(row.id));
  return { ok: true, id: row.id };
}

/** Sends it for approval, or withdraws it, or cancels it before the transfer. */
export async function moveOwnAdvance(advanceId: string, move: "submit" | "withdraw" | "cancel", extra: { promised?: boolean; reason?: string } = {}): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const reason = Reason.safeParse(extra.reason ?? "");
  if (!reason.success) return { ok: false, error: zodIssuesToMessage(reason.error.issues) };
  if (move !== "submit" && move !== "withdraw" && move !== "cancel") return { ok: false, error: "That is not something you can do to an advance." };
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await transitionAdvance({
    row,
    move,
    actor: owner(actor),
    write: advanceWriterFor(row.id, { ownedBy: actor.personId }),
    reason: reason.data,
    facts: { promised: extra.promised === true },
  });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/**
 * Starts the claim that settles this advance, or finds the one already started, and answers
 * its id. The database allows one per advance, so two tabs land on the same claim.
 */
export async function settleOwnAdvance(advanceId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  if (row.status !== "paid_out") return { ok: false, error: "This advance is not waiting to be settled." };
  const existing = await settlementClaimOf(row.id);
  if (existing) return { ok: true, id: existing };
  const created = await createClaim({
    title: `Settlement ${advanceRef(row.refNo)}: ${row.purpose}`.slice(0, 200),
    tripEventId: await advanceTripOf(row.id),
    advanceId: row.id,
    owner: { personId: actor.personId, teamMemberId: actor.teamMemberId },
    actor: { kind: "owner", personId: actor.personId, mayDecideOwn: false, label: actor.displayName },
  });
  if (created.ok) {
    refresh(advancePaths(row.id));
    return created;
  }
  // Another tab may have won the unique index: its claim is this one.
  const raced = await settlementClaimOf(row.id);
  return raced ? { ok: true, id: raced } : created;
}

/** "I spent none of it": the whole amount is owed back, by transfer, with no claim. */
export async function returnOwnUnspent(advanceId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await returnUnspent({ row, actor: owner(actor) });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** Deletes a draft that was never sent. */
export async function deleteOwnAdvance(advanceId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await deleteDraftAdvance({ row, actor: owner(actor) });
  if (result.ok) refresh(advancePaths());
  return result;
}

/** The owner says the money is on its way back: a hint for Finance, never a record. */
export async function reportOwnReturn(advanceId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await reportReturnSent({ row, actor: owner(actor) });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** Begins an upload of the quote. A bank receipt is Finance's, so the owner's action names evidence and nothing else. */
export async function startOwnEvidence(advanceId: string, declared: { name: string; size: number; type: string }): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  return startAdvanceUpload({ advance: { id: row.id, status: row.status }, kind: "evidence", personId: actor.personId, declared: { name: String(declared.name), size: Number(declared.size), type: String(declared.type) } });
}

export async function confirmOwnEvidence(advanceId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await confirmAdvanceUpload({ advanceId: row.id, fileId: String(fileId), onlyKind: "evidence", status: row.status });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

export async function cancelOwnEvidence(advanceId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  return cancelAdvanceUpload({ advanceId: row.id, fileId: String(fileId), onlyKind: "evidence" });
}

export async function removeOwnEvidence(advanceId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await removeAdvanceEvidence({ advance: row, fileId: String(fileId), personId: actor.personId, actorLabel: actor.displayName });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** A short-lived link to one of the files on the owner's own advance. */
export async function openOwnAdvanceFile(advanceId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const row = await ownRow(advanceId, actor.personId);
  if (!row) return { ok: false, error: NOT_FOUND };
  return signAdvanceFile({ advanceId: row.id, fileId: String(fileId) });
}
