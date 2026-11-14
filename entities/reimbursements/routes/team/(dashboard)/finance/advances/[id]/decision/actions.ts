"use server";

import { z } from "zod";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { requirePermission } from "@/kernel/identity/access-request";
import { Id, Reason, refresh } from "@/entities/reimbursements/lib/action-inputs";
import { signAdvanceFile } from "@/entities/reimbursements/lib/advance-files";
import { advanceWriterFor, readAdvanceRow, transitionAdvance } from "@/entities/reimbursements/lib/advance-lifecycle";
import { advanceApproverOf, NO_PERSON_RECORD } from "@/entities/reimbursements/lib/deciders";
import { advancePaths } from "@/entities/reimbursements/lib/paths";

// The approver's actions on an advance (AD.6, design section 2). Each asks for
// reimbursements.approve first, whose reach is every advance, then reads the advance
// unscoped. What a permission cannot say, never your own without decide-own, is refused
// by the lifecycle module. Nothing here moves money: an approval tells Finance to.

const NOT_FOUND = "Advance not found.";

const Move = z.enum(["approve", "send_back", "reject"]);

/**
 * Approve it, send it back to fix or reject it. The last two need a reason. `submittedAt`
 * says which request the approver read: withdrawn, changed and sent again, it is a
 * different request with the same status, and a decision on the old one must not land on
 * the new one. The lifecycle module compares it, in words and again in the write.
 */
export async function decideAdvance(advanceId: string, move: z.infer<typeof Move>, input: { submittedAt: string; reason?: string }): Promise<Result> {
  const access = await requirePermission("reimbursements.approve");
  const actor = advanceApproverOf(access);
  if (!actor) return { ok: false, error: NO_PERSON_RECORD };
  const which = Move.safeParse(move);
  if (!which.success) return { ok: false, error: "Unknown move." };
  if (!Id.safeParse(advanceId).success) return { ok: false, error: NOT_FOUND };
  const reason = Reason.safeParse(input?.reason ?? "");
  if (!reason.success) return { ok: false, error: zodIssuesToMessage(reason.error.issues) };
  const row = await readAdvanceRow(advanceId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await transitionAdvance({
    row,
    move: which.data,
    actor,
    write: advanceWriterFor(row.id, {}),
    reason: reason.data,
    mark: { submittedAt: typeof input?.submittedAt === "string" ? input.submittedAt : "" },
  });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** A fresh one-minute link to the evidence on an advance, for an approver whose page has sat open longer than its own links last. Never a bank receipt: that is Finance's. */
export async function openAdvanceFileToDecide(advanceId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.approve");
  if (!Id.safeParse(advanceId).success || !Id.safeParse(fileId).success) return { ok: false, error: "File not found." };
  return signAdvanceFile({ advanceId, fileId, onlyKind: "evidence" });
}
