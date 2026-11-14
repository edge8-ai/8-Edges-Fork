"use server";

import type { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import {
  addCycleMember,
  changeClientManager,
  closeClientCycle,
  reissueClientManagerLink,
  reopenClientPart,
  unlockClientManagerPart,
  withdrawCycleMember,
  type Actor,
} from "@/entities/org/lib/client-reviews/owner-actions";
import { teamMemberIdsOf } from "@/entities/org/lib/client-reviews/access";
import { cancelSkipManagerLink, markSkipManagerLinkCopied, reissueSkipManagerLink, type SkipLinkResult } from "@/entities/org/lib/client-reviews/skip-link";
import { releaseClientReview, saveHrSummary, waiveSkipManagerMark } from "@/entities/org/lib/client-reviews/release";
import { AddMemberInput, ChangeClientManagerInput, CycleInput, MemberInput, ReopenInput, SummaryInput } from "./schemas";

// The owner's actions on a client review cycle (CR.2.4). Each guards first
// with the reviews permission, parses its input next, and then acts as the
// signed-in person, whose id and address the command records.

const NO_PERSON: { ok: false; error: string } = { ok: false, error: "Your sign-in has no person record, so the change cannot be recorded." };

/**
 * Who is acting, from the guard's answer and every team-member row of their
 * person, which the commands use to refuse them their own review. The rows
 * are a must-read, so a failed read refuses the action rather than letting it
 * through as someone else's review. Null for an env-only admin with no person
 * record, who therefore cannot be the member.
 */
async function actingPerson(access: { personId: string | null; user: { email: string } }): Promise<Actor | null> {
  if (!access.personId) return null;
  return { personId: access.personId, email: access.user.email, ownTeamMemberIds: await teamMemberIdsOf(access.personId) };
}

const refused = (error: z.ZodError): Result => ({ ok: false, error: zodIssuesToMessage(error.issues) });

export async function unlockPartAction(raw: MemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = MemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return unlockClientManagerPart(input.data.cycleId, input.data.teamMemberId, by);
}

export async function reopenPartAction(raw: ReopenInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = ReopenInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return reopenClientPart(input.data.cycleId, input.data.teamMemberId, input.data.kind, by);
}

export async function reissueLinkAction(raw: MemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = MemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return reissueClientManagerLink(input.data.cycleId, input.data.teamMemberId, by);
}

export async function changeClientManagerAction(raw: ChangeClientManagerInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = ChangeClientManagerInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return changeClientManager(input.data.cycleId, input.data.teamMemberId, input.data.clientManagerPersonId, by);
}

export async function addMemberAction(raw: AddMemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = AddMemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return addCycleMember(input.data.cycleId, input.data.teamMemberId, input.data.clientManagerPersonId, by);
}

export async function withdrawMemberAction(raw: MemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = MemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return withdrawCycleMember(input.data.cycleId, input.data.teamMemberId, by);
}

export async function closeCycleAction(raw: CycleInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = CycleInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return closeClientCycle(input.data.cycleId, by);
}

// The skip-manager's one link to the cycle (CR.3.2): record a copy, cancel it,
// or replace it. Each refuses someone reviewed in the cycle, so each needs the person.

export async function skipLinkCopiedAction(raw: CycleInput): Promise<SkipLinkResult> {
  const access = await requirePermission("org.reviews");
  const input = CycleInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return markSkipManagerLinkCopied(input.data.cycleId, by);
}

export async function cancelSkipLinkAction(raw: CycleInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = CycleInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return cancelSkipManagerLink(input.data.cycleId, by);
}

export async function reissueSkipLinkAction(raw: CycleInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = CycleInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return reissueSkipManagerLink(input.data.cycleId, by);
}

// The member's page (CR.3.3): the HR summary, waiving the skip-manager's mark,
// and the release. The commands refuse one's own review and anything the
// rules refuse; a waiver and a release are recorded.

export async function saveSummaryAction(raw: SummaryInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = SummaryInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return saveHrSummary(input.data.cycleId, input.data.teamMemberId, input.data.summary, by);
}

export async function waiveMarkAction(raw: MemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = MemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return waiveSkipManagerMark(input.data.cycleId, input.data.teamMemberId, by);
}

export async function releaseAction(raw: MemberInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = MemberInput.safeParse(raw);
  if (!input.success) return refused(input.error);
  const by = await actingPerson(access);
  if (!by) return NO_PERSON;
  return releaseClientReview(input.data.cycleId, input.data.teamMemberId, by);
}
