import { z } from "zod";
import { ADDRESS_MAX, NAME_MAX, REASON_MAX_LENGTH, REGISTRATION_VALUE_MAX } from "@/entities/org/lib/legal-entity-rules";

// The shape each Settings → Legal entities action accepts. These check only
// that the input is the right kind of thing and not absurdly long; whether a
// value is right for the entity (a tax code in its country's format, a person
// on the team, a field not emptied once set) is decided by the checks in
// lib/legal-entity-changes.ts, which need the stored row and so run after the
// read. The reason's length is checked there too, so the sentence the person
// sees is the one the drawer shows.

const text = (max: number) => z.string().max(max, `Use at most ${max} characters.`);
const reason = z.string().max(REASON_MAX_LENGTH, `Keep the reason under ${REASON_MAX_LENGTH} characters.`);
const id = z.string().uuid("That legal entity does not exist.");

export const updateCompanySchema = z.object({
  id,
  name: text(NAME_MAX),
  legalName: text(NAME_MAX),
  entityType: text(64),
  baseCurrency: text(8),
  active: z.boolean(),
  reason,
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const createEntitySchema = z.object({
  slug: text(80),
  name: text(NAME_MAX),
  legalName: text(NAME_MAX),
  country: text(8),
  entityType: text(64),
  baseCurrency: text(8),
  reason,
});
export type CreateEntityInput = z.infer<typeof createEntitySchema>;

export const updateRegistrationSchema = z.object({
  id,
  taxId: text(REGISTRATION_VALUE_MAX * 2),
  registrationNumber: text(REGISTRATION_VALUE_MAX * 2),
  registeredAddress: text(ADDRESS_MAX * 2),
  legalRepresentativePersonId: z.union([z.literal(""), z.string().uuid("Choose someone on the team.")]),
  jurisdiction: text(NAME_MAX * 2),
  incorporatedOn: text(16),
  reason,
});
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;
