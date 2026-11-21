import { revalidatePath } from "next/cache";

// Which screens a coaching write invalidates, named once (A.13).
//
// This existed as five near-identical `refresh()` functions — byte-identical in
// actions.ts, commitment-actions.ts, goal-actions.ts and meeting-actions.ts,
// and different in schedule-actions.ts, which revalidates the member's page
// instead of the directory. That difference is not drift: schedule-actions.ts
// says why at its top ("Both the coach's profile page and the member's My Coach
// show the date, so both are refreshed"). Two real concerns, spelled five
// times, where the only way to see that four agreed and one did not was to open
// all five files.
//
// So these name the SETS rather than merging them. Each is exactly what its
// callers did before; nothing changed about which paths are invalidated.
//
// OPEN QUESTION for a human, deliberately not decided here: a coach adding a
// commitment or editing a goal refreshes the coach's pages and the directory,
// but not /team/my-coaching — yet those writes do show on the member's board.
// Whether the coach-side writes should also refresh the member's page is a
// product decision about what a member sees without a reload, so it is asked
// rather than quietly widened.

const COACH_LIST = "/team/coaching";
const DIRECTORY = "/team/directory";
const MEMBER = "/team/my-coaching";
const coachProfile = (profileId: string) => `${COACH_LIST}/${profileId}`;

/**
 * The coach's roster, one profile page, and the directory — where FAST goals
 * also render, because goals are team-wide transparent. Used by the goal,
 * commitment, meeting and profile writes.
 */
export function refreshCoachAndDirectory(profileId?: string): void {
  revalidatePath(COACH_LIST);
  if (profileId) revalidatePath(coachProfile(profileId));
  revalidatePath(DIRECTORY);
}

/**
 * The coach's roster, one profile page, and the member's own page. Used by the
 * scheduling writes, because the date of the next 1-1 is shown on both sides.
 */
export function refreshCoachAndMember(profileId: string): void {
  revalidatePath(COACH_LIST);
  revalidatePath(coachProfile(profileId));
  revalidatePath(MEMBER);
}

/** The member's own page. Used by the member's own writes. */
export function refreshMember(): void {
  revalidatePath(MEMBER);
}

/**
 * The coach's roster alone. Used by the member's own writes that the coach sees
 * in their list but which touch no profile page directly — a preferred slot, a
 * proposed date. Paired with `refreshMember` by the member actions' `done()`.
 */
export function refreshCoachList(): void {
  revalidatePath(COACH_LIST);
}

/**
 * Both lists — the coach's roster and the member's page — and neither profile
 * page nor the directory. Used by the writes either side makes to the shared
 * pre-meeting form and the row action bar.
 */
export function refreshBothLists(): void {
  revalidatePath(COACH_LIST);
  revalidatePath(MEMBER);
}

/**
 * The composer behind the named sets above, for the handful of actions whose
 * set is its own — a minutes attach that touches one profile and the roster but
 * not the directory, a pre-meeting form that touches both sides' lists. Prefer
 * a named set when one fits; reach for this rather than calling
 * `revalidatePath` directly, so every coaching path stays in this file.
 */
export function refreshCoaching(opts: {
  coachList?: boolean;
  /** Also refresh this coach profile page. */
  profileId?: string;
  directory?: boolean;
  member?: boolean;
}): void {
  if (opts.coachList) revalidatePath(COACH_LIST);
  if (opts.profileId) revalidatePath(coachProfile(opts.profileId));
  if (opts.directory) revalidatePath(DIRECTORY);
  if (opts.member) revalidatePath(MEMBER);
}
