"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { openCycleForClient, type OpenForClientResult } from "@/entities/org/lib/client-reviews/proposal";
import { teamMemberIdsOf } from "@/entities/org/lib/client-reviews/access";
import { OpenCycleFormInput } from "./schemas";

/**
 * Opens a client review cycle from the screen (CR.2.5), as the signed-in
 * person, who becomes its owner: the one told when a part comes in. Opening
 * emails the members, never anyone at the client.
 */
export async function openCycleAction(raw: OpenCycleFormInput): Promise<OpenForClientResult> {
  const access = await requirePermission("org.reviews");
  const input = OpenCycleFormInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  if (!access.personId) return { ok: false, error: "Your sign-in has no person record, so the cycle cannot name its owner." };
  // Every team-member row of the person, a must-read: a failed read refuses
  // rather than letting someone open a cycle with themselves in it.
  return openCycleForClient(input.data, { personId: access.personId, ownTeamMemberIds: await teamMemberIdsOf(access.personId) });
}
