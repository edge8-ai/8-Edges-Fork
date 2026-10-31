"use server";

// The invite drawer and the Invitations tab's writes (AE.4). Every export asks
// for access.manage first: the tab is readable with access.explain, but only
// someone who manages access may invite, resend or cancel. The work is in
// access-invite.ts and access-invite-pending.ts, which take the access this
// guard returns.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { InviteInput, previewInvite, sendInvite, type InviteMatch, type Result } from "./access-invite";
import { cancelInvite, resendInvite } from "./access-invite-pending";
import type { InvitePlan } from "./access-invite-plan";

const Reason = z.string().trim().min(3, "Say why, in a few words.").max(500);
const AuthUserId = z.string().uuid();

function refresh() {
  revalidatePath("/admin/settings/access");
}

export async function previewInviteAction(raw: unknown): Promise<{ ok: true; plan: InvitePlan; match: InviteMatch } | { ok: false; error: string }> {
  const access = await requirePermission("access.manage");
  // The preview runs before a reason is typed, so it plans without one.
  const input = InviteInput.omit({ reason: true }).safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Fill in the invite." };
  return { ok: true, ...(await previewInvite(access, { ...input.data, reason: "" })) };
}

export async function sendInviteAction(raw: unknown): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = InviteInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Fill in the invite." };
  const res = await sendInvite(access, input.data);
  refresh();
  return res;
}

export async function resendInviteAction(authUserId: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const id = AuthUserId.safeParse(authUserId);
  if (!id.success) return { ok: false, error: "That invitation is not valid." };
  const res = await resendInvite(access, id.data);
  refresh();
  return res;
}

export async function cancelInviteAction(authUserId: string, reason: string): Promise<Result> {
  const access = await requirePermission("access.manage");
  const input = z.object({ id: AuthUserId, reason: Reason }).safeParse({ id: authUserId, reason });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Say why the invitation is cancelled." };
  const res = await cancelInvite(access, input.data.id, input.data.reason);
  refresh();
  return res;
}
