"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { readBankAccount } from "@/entities/org/lib/company-bank";
import { saveBankAccount } from "@/entities/org/lib/company-bank-write";
import { checkBankAccount } from "@/entities/org/lib/company-bank-rules";
import { readLegalEntity } from "@/entities/org/lib/legal-entities";
import { checkReason } from "@/entities/org/lib/legal-entity-rules";
import { updateBankSchema, type UpdateBankInput } from "./schemas";

// The account people return an advance to (AD.13): entered here by whoever keeps
// the registration details, and never by a migration or an agent. Vietnamese
// companies only, because the list of banks and the QR code are Vietnamese.

export async function updateLegalEntityBank(raw: UpdateBankInput): Promise<Result> {
  const { user } = await requirePermission("org.legal-registration");
  const parsed = updateBankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { id, reason, ...input } = parsed.data;
  const why = checkReason(reason);
  if (!why.ok) return { ok: false, error: why.error };

  const record = await readLegalEntity(id);
  if (!record) return { ok: false, error: "That legal entity does not exist." };
  if (record.country?.trim().toUpperCase() !== "VN") return { ok: false, error: "A bank account can be kept only for a Vietnamese company." };

  const stored = await readBankAccount(id);
  const change = checkBankAccount(input, stored);
  if (!change.ok) return { ok: false, error: change.error };

  const saved = await saveBankAccount(id, stored, change.account, { actor: user.email, reason: why.value });
  if (!saved.ok) return saved;
  revalidatePath("/admin/settings/legal-entities");
  return { ok: true };
}
