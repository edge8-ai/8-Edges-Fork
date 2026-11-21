"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { openCycleForClient, type OpenForClientResult } from "@/entities/org/lib/client-reviews/proposal";
import { actingPerson, NO_PERSON } from "@/entities/org/lib/client-reviews/acting-person";
import { OpenCycleFormInput } from "./schemas";

/**
 * Opens a client review cycle from the screen (CR.2.5), as the signed-in
 * person, who becomes its owner: the one told when a part comes in. Opening
 * emails nobody: members find the form in their team app and Inbox, and
 * the owner chooses when they are emailed (CR.5).
 */
export async function openCycleAction(raw: OpenCycleFormInput): Promise<OpenForClientResult> {
  const access = await requirePermission("org.reviews");
  const input = OpenCycleFormInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  // Every team-member row of the person, a must-read: a failed read refuses
  // rather than letting someone open a cycle with themselves in it.
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return openCycleForClient(input.data, { personId: by.personId, ownTeamMemberIds: by.ownTeamMemberIds });
}
