"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { signAdvanceFile } from "@/entities/reimbursements/lib/advance-files";

// Admin reads advances and decides nothing about them (AD.12), so this is the only action it
// has: opening the quote behind one. Never a bank receipt, which shows an account, because
// reimbursements.view is every claim without bank details.
export async function openAdvanceEvidenceInAdmin(advanceId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.view");
  if (!Id.safeParse(advanceId).success || !Id.safeParse(fileId).success) return { ok: false, error: "File not found." };
  return signAdvanceFile({ advanceId, fileId, onlyKind: "evidence" });
}
