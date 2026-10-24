"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { saigonToday } from "@/kernel/config/dates";
import type { Result } from "@/kernel/data/result";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { readLegalEntity } from "@/entities/org/lib/legal-entities";
import { checkRegistration } from "@/entities/org/lib/legal-entity-changes";
import { checkReason } from "@/entities/org/lib/legal-entity-rules";
import { writeLegalEntityChange } from "@/entities/org/lib/legal-entity-write";
import { updateRegistrationSchema, type UpdateRegistrationInput } from "./schemas";

// The registration details: tax number, business registration number,
// registered address, legal representative, jurisdiction and date of
// incorporation. The law expects them to match the registration whenever it
// changes, so whoever keeps the books (org.legal-registration: Finance, and a
// Super Admin) keeps them current. Every change carries a reason and is
// recorded with the values before and after.

export async function updateLegalEntityRegistration(raw: UpdateRegistrationInput): Promise<Result> {
  const { user } = await requirePermission("org.legal-registration");
  const parsed = updateRegistrationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { id, reason, ...input } = parsed.data;
  const why = checkReason(reason);
  if (!why.ok) return { ok: false, error: why.error };

  const record = await readLegalEntity(id);
  if (!record) return { ok: false, error: "That legal entity does not exist." };
  // Read only when a new representative is named: everything else is checked
  // against the row alone.
  const naming = input.legalRepresentativePersonId !== "" && input.legalRepresentativePersonId !== record.legal_representative_person_id;
  const teamPeopleIds = new Set(naming ? (await listCurrentTeamPeople()).map((p) => p.id) : []);
  const change = checkRegistration(record, input, { today: saigonToday(), teamPeopleIds });
  if (!change.ok) return { ok: false, error: change.error };

  const saved = await writeLegalEntityChange(record, change.patch, { actor: user.email, reason: why.value });
  if (!saved.ok) return saved;
  revalidatePath("/admin/settings/legal-entities");
  return { ok: true };
}
