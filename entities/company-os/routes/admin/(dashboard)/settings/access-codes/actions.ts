"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { setAccessCode } from "@/kernel/identity/access-codes";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { setAccessCodeSchema, type SetAccessCodeInput } from "./schemas";

// Set the shared code for one gated scope. The next unlock attempt reads the
// row, so the change is live as soon as this returns. Browsers that already
// unlocked keep their signed cookie until it expires: the cookie proves "typed
// the right code once", not "knows the current code".
export async function saveAccessCode(raw: SetAccessCodeInput): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.settings");
  const parsed = setAccessCodeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { scope, code } = parsed.data;

  const saved = await setAccessCode(scope, code, admin.email);
  if (!saved.ok) return { ok: false, error: `Could not save the code: ${saved.error}` };

  // The audit row records that the code changed and who changed it, never the
  // code itself: audit_log is read far more widely than this table. The table
  // is keyed by its text scope and audit_log.record_id is a uuid, so the scope
  // goes in the context and the row names no record id (B.13).
  await recordAudit({ table: "access_codes", recordId: null, operation: "update", actor: admin.email, context: { scope } });

  revalidatePath("/admin/settings/access-codes");
  return { ok: true };
}
