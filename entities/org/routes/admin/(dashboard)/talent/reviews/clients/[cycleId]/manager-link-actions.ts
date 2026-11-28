"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { actingPerson, NO_PERSON } from "@/entities/org/lib/client-reviews/acting-person";
import { cancelManagerLink, markManagerLinkCopied, reissueManagerLink, type ManagerLinkResult } from "@/entities/org/lib/client-reviews/manager-link";
import { ManagerLinkInput } from "./manager-link-schemas";

// The owner's hold on each client manager's one link to a cycle (CR.5.6):
// record a copy, cancel it, or replace it. Each guards first with the reviews
// permission, parses its input next, and then acts as the signed-in person.
// Each command refuses someone the manager reviews in the cycle, so each
// needs every team-member row of the person. None sends anything to anyone:
// the owner sends the link themselves.

export async function managerLinkCopiedAction(raw: ManagerLinkInput): Promise<ManagerLinkResult> {
  const access = await requirePermission("org.reviews");
  const input = ManagerLinkInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return markManagerLinkCopied(input.data.cycleId, input.data.clientManagerPersonId, by);
}

export async function cancelManagerLinkAction(raw: ManagerLinkInput): Promise<ManagerLinkResult> {
  const access = await requirePermission("org.reviews");
  const input = ManagerLinkInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return cancelManagerLink(input.data.cycleId, input.data.clientManagerPersonId, by);
}

export async function reissueManagerLinkAction(raw: ManagerLinkInput): Promise<ManagerLinkResult> {
  const access = await requirePermission("org.reviews");
  const input = ManagerLinkInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return reissueManagerLink(input.data.cycleId, input.data.clientManagerPersonId, by);
}
