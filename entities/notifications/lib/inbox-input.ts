// What the inbox actions accept from the browser (S.3), checked at the boundary.
// Shared by the team and admin actions, which differ only in their guard.
import { z } from "zod";
import { isNotificationKind } from "./kinds";

export const readIds = z.array(z.string().uuid()).max(200);
export const muteInput = z.object({
  kind: z.string().refine(isNotificationKind, "not an inbox kind"),
  muted: z.boolean(),
});

/** A thrown write, as the Result an action returns. */
export function failure(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "The inbox could not be updated." };
}
