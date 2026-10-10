// Who still works here, for coaching. One list, read by the daily run (which
// must not write preps for someone who has left) and by the coach's page
// (which must not show them as current: Pham Tieu My, alumni, sat on Dave's
// current roster until 2026-10-08 because her profile was never switched off).
export const LIVE_MEMBER_STATUSES: readonly string[] = ["active", "pre_start", "on_leave", "notice"];

/** True when a team_members.status means the person is still on the team. */
export function isLiveMember(status: string | null | undefined): boolean {
  return LIVE_MEMBER_STATUSES.includes(status ?? "");
}
