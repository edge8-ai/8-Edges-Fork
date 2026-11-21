"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { readLegalEntity, legalEntitySlugTaken } from "@/entities/org/lib/legal-entities";
import { checkCompany, checkNewEntity } from "@/entities/org/lib/legal-entity-changes";
import { checkReason } from "@/entities/org/lib/legal-entity-rules";
import { insertLegalEntity, writeLegalEntityChange } from "@/entities/org/lib/legal-entity-write";
import { createEntitySchema, updateCompanySchema, type CreateEntityInput, type UpdateCompanyInput } from "./schemas";

// The company itself: adding a legal entity and changing its name, legal name,
// type, currency or active flag. A Super Admin's (org.legal-entities); the
// registration details beside them are Finance's, in registration-actions.ts.
// The country is set when the entity is added and not changed afterwards: the
// registration details are checked against it, so a different country is a
// different legal entity.

const PAGE = "/admin/settings/legal-entities";

export async function updateLegalEntityCompany(raw: UpdateCompanyInput): Promise<Result> {
  const { user } = await requirePermission("org.legal-entities");
  const parsed = updateCompanySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { id, reason, ...input } = parsed.data;
  const why = checkReason(reason);
  if (!why.ok) return { ok: false, error: why.error };

  const record = await readLegalEntity(id);
  if (!record) return { ok: false, error: "That legal entity does not exist." };
  const change = checkCompany(record, input);
  if (!change.ok) return { ok: false, error: change.error };

  const saved = await writeLegalEntityChange(record, change.patch, { actor: user.email, reason: why.value });
  if (!saved.ok) return saved;
  revalidatePath(PAGE);
  return { ok: true };
}

export async function createLegalEntity(raw: CreateEntityInput): Promise<Result> {
  const { user } = await requirePermission("org.legal-entities");
  const parsed = createEntitySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { reason, ...input } = parsed.data;
  const why = checkReason(reason);
  if (!why.ok) return { ok: false, error: why.error };

  const checked = checkNewEntity(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  // The unique index refuses a duplicate anyway; asking first gives the
  // person a sentence instead of a constraint name.
  if (await legalEntitySlugTaken(checked.row.slug)) {
    return { ok: false, error: `Another legal entity already uses the address ${checked.row.slug}. Change the name.` };
  }

  const saved = await insertLegalEntity(checked.row, { actor: user.email, reason: why.value });
  if (!saved.ok) return { ok: false, error: saved.error };
  revalidatePath(PAGE);
  return { ok: true };
}
