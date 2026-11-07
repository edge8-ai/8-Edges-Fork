import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";

// Who still works here, for coaching. One predicate, read by the daily run
// (which must not write preps for someone who has left) and by the coach's page
// (which must not show them as current: Pham Tieu My, alumni, sat on Dave's
// current roster until 2026-10-08 because her profile was never switched off).
// The set is the kernel's PORTAL_STATUSES, staff now or starting, so coaching
// cannot drift from what every other surface means by "on staff" (A.61).

/** True when a team_members.status means the person is still on the team. */
export function isLiveMember(status: string | null | undefined): boolean {
  return PORTAL_STATUSES.includes(status ?? "");
}
