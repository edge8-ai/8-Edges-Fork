// Resolve the signed-in user to a history owner for a given surface, using the
// SAME guard each assistant already uses so identity is checked correctly:
// the admin gate for 'admin', getTeamActor() for 'team'. Both are Supabase Auth
// sessions, so authUserId (= auth.uid()) is a reliable per-user owner key on
// either surface. Returns null when the caller is not authorised for that surface
// (the API route group turns that into a 401). NEVER import from a client component.

import { getAdminUser } from "@/kernel/identity/admin-auth";
import { getTeamActor } from "@/kernel/identity/team-auth";
import type { Surface } from "@/entities/assistant/lib/history/store";

export type AssistantActor = {
  surface: Surface;
  authUserId: string;
  personId: string | null;
};

export function isSurface(value: string): value is Surface {
  return value === "admin" || value === "team";
}

export async function resolveAssistantActor(
  surface: string,
): Promise<AssistantActor | null> {
  if (!isSurface(surface)) return null;

  if (surface === "admin") {
    const user = await getAdminUser();
    // Admins are matched by email and may have no linked person record.
    return user ? { surface, authUserId: user.id, personId: null } : null;
  }

  const { actor } = await getTeamActor();
  return actor
    ? { surface, authUserId: actor.authUserId, personId: actor.personId }
    : null;
}
