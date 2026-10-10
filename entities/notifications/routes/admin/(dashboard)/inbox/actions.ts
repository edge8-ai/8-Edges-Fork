"use server";

// The admin surface's inbox actions (S.3). Each guards first (ADR 0007). The
// admin session carries only an email, so the person is looked up from it; a
// sign-in with no person record has no inbox to change.
import { requirePermission } from "@/kernel/identity/access-request";
import type { Result } from "@/kernel/data/result";
import { markAllRead, markRead, setMuted } from "@/entities/notifications/lib/inbox";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { failure, muteInput, readIds } from "@/entities/notifications/lib/inbox-input";
import type { NotificationKind } from "@/entities/notifications/lib/kinds";

const NO_PERSON = { ok: false as const, error: "This sign-in has no person record, so it has no inbox." };

export async function markInboxRead(ids: unknown): Promise<Result> {
  const { user: admin } = await requirePermission("surface.admin");
  const parsed = readIds.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Those are not inbox items." };
  try {
    const personId = await personIdForEmail(admin.email);
    if (!personId) return NO_PERSON;
    await markRead(personId, parsed.data);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function markInboxAllRead(): Promise<Result> {
  const { user: admin } = await requirePermission("surface.admin");
  try {
    const personId = await personIdForEmail(admin.email);
    if (!personId) return NO_PERSON;
    await markAllRead(personId);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function setInboxMuted(kind: unknown, muted: unknown): Promise<Result> {
  const { user: admin } = await requirePermission("surface.admin");
  const parsed = muteInput.safeParse({ kind, muted });
  if (!parsed.success) return { ok: false, error: "That is not an inbox kind." };
  try {
    const personId = await personIdForEmail(admin.email);
    if (!personId) return NO_PERSON;
    await setMuted(personId, parsed.data.kind as NotificationKind, parsed.data.muted);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
