"use server";

// The team hub's inbox actions (S.3). Each guards first (ADR 0007) and takes the
// person from the guard, never from the browser, so a person only ever touches
// their own inbox.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { markAllRead, markRead, setMuted } from "@/entities/notifications/lib/inbox";
import { failure, muteInput, readIds } from "@/entities/notifications/lib/inbox-input";
import type { NotificationKind } from "@/entities/notifications/lib/kinds";

export async function markInboxRead(ids: unknown): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const parsed = readIds.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Those are not inbox items." };
  try {
    await markRead(actor.personId, parsed.data);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function markInboxAllRead(): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  try {
    await markAllRead(actor.personId);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function setInboxMuted(kind: unknown, muted: unknown): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const parsed = muteInput.safeParse({ kind, muted });
  if (!parsed.success) return { ok: false, error: "That is not an inbox kind." };
  try {
    await setMuted(actor.personId, parsed.data.kind as NotificationKind, parsed.data.muted);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
