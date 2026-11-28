"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { chooseMemberEmail, clearMemberEmail, markMemberEmailSent, type MemberEmailResult } from "@/entities/org/lib/client-reviews/member-email";
import { NO_PERSON, signedInPerson } from "@/entities/org/lib/client-reviews/acting-person";
import { MemberEmailClearInput, MemberEmailMarkInput, MemberEmailPlanInput } from "./email-schemas";

// The "Email the members" card's actions (CR.5.4). Each guards first with the
// reviews permission, parses its input next, and then acts as the signed-in
// person, whose id and address the command records.

/** Now, on a date, or "I'll email them myself"; also how a plan is changed. */
export async function chooseMemberEmailAction(raw: MemberEmailPlanInput): Promise<MemberEmailResult> {
  const access = await requirePermission("org.reviews");
  const input = MemberEmailPlanInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = signedInPerson(access);
  if (!by) return NO_PERSON;
  return chooseMemberEmail(input.data.cycleId, input.data.pick, input.data.expected, by);
}

/** "Don't send it": back to not chosen. */
export async function clearMemberEmailAction(raw: MemberEmailClearInput): Promise<MemberEmailResult> {
  const access = await requirePermission("org.reviews");
  const input = MemberEmailClearInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = signedInPerson(access);
  if (!by) return NO_PERSON;
  return clearMemberEmail(input.data.cycleId, input.data.expected, by);
}

/** The owner sent the message themselves. */
export async function markMemberEmailSentAction(raw: MemberEmailMarkInput): Promise<MemberEmailResult> {
  const access = await requirePermission("org.reviews");
  const input = MemberEmailMarkInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = signedInPerson(access);
  if (!by) return NO_PERSON;
  return markMemberEmailSent(input.data.cycleId, by);
}
