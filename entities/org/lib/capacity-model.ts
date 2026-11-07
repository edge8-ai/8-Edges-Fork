import { addDays, dateMs } from "@/kernel/config/dates";

// The capacity model (S.7): what each ROLE can supply per week against what has
// already been committed of it. Pure and browser-safe, so the admin screen can
// answer a fit check as the form is typed, with no round trip, from the same
// rows the forecast was drawn from.
//
// It models roles and hours only. There is no person anywhere in these shapes,
// by the CEO's house rule: the question is "what capacity does this role have",
// never "how busy is this individual", and a per-person figure is exactly what
// this module must not be able to produce.
//
// Dates are YYYY-MM-DD business dates and weeks run Monday to Sunday. Every
// overlap is inclusive on both ends.

/** How far ahead the forecast looks, and how far an open-ended fit check does. */
export const HORIZON_WEEKS = 12;

/** What the model needs of a capacity role. */
export type ModelRole = { id: string; hoursPerWeek: number; effectiveFrom: string };

/** What the model needs of a commitment. `endsOn` null is open-ended. */
export type ModelCommitment = { roleId: string; hoursPerWeek: number; startsOn: string; endsOn: string | null };

export type CapacityWeek = { weekStart: string; supply: number; committed: number; free: number };

export type RoleForecast = { roleId: string; weeks: CapacityWeek[] };

export type FitRequest = { roleId: string; hoursPerWeek: number; startsOn: string; endsOn: string | null };

/** `shortBy` is the worst single week's shortfall in hours; `shortWeeks` are the Mondays of every short week. */
export type FitResult = { fits: true } | { fits: false; shortBy: number; shortWeeks: string[] };

// Hours are numeric(6,2) in the database. Summing them in floating point turns
// 0.1 + 0.2 into 0.30000000000000004, which would read as a shortfall of a
// ten-billionth of an hour, so every figure is rounded back to the column's scale.
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The Monday of the week `iso` falls in. */
export function mondayOf(iso: string): string {
  const weekday = new Date(dateMs(iso)).getUTCDay(); // 0 is Sunday
  return addDays(iso, -((weekday + 6) % 7));
}

/** `count` consecutive Mondays from `monday`. */
export function weekStarts(monday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(monday, i * 7));
}

// A role supplies its full hours in any week that overlaps its effective date,
// the same inclusive rule a commitment follows, so a role added mid-week and a
// commitment starting that same day meet in the same week rather than one of
// them a week late.
function supplyIn(role: ModelRole | undefined, weekStart: string): number {
  if (!role) return 0;
  return role.effectiveFrom <= addDays(weekStart, 6) ? role.hoursPerWeek : 0;
}

function committedIn(roleId: string, commitments: ModelCommitment[], weekStart: string): number {
  const weekEnd = addDays(weekStart, 6);
  let sum = 0;
  for (const c of commitments) {
    if (c.roleId !== roleId) continue;
    if (c.startsOn > weekEnd) continue;
    if (c.endsOn !== null && c.endsOn < weekStart) continue;
    sum += c.hoursPerWeek;
  }
  return round2(sum);
}

function weekFor(role: ModelRole | undefined, roleId: string, commitments: ModelCommitment[], weekStart: string): CapacityWeek {
  const supply = round2(supplyIn(role, weekStart));
  const committed = committedIn(roleId, commitments, weekStart);
  return { weekStart, supply, committed, free: round2(supply - committed) };
}

/**
 * Per role, in the order given, `count` weeks from `startMonday` of supply,
 * committed and free hours. Free goes negative when a role is over-committed.
 */
export function forecast(
  roles: ModelRole[],
  commitments: ModelCommitment[],
  startMonday: string,
  count: number = HORIZON_WEEKS,
): RoleForecast[] {
  const weeks = weekStarts(startMonday, count);
  return roles.map((role) => ({
    roleId: role.id,
    weeks: weeks.map((w) => weekFor(role, role.id, commitments, w)),
  }));
}

/**
 * Would `request` fit on top of what is already committed? Checks every week the
 * request spans — from the week of its start to the week of its end, or
 * HORIZON_WEEKS weeks for an open-ended request — but never a week before
 * `currentMonday`: a week already gone can be neither staffed nor freed, so a
 * shortfall there is nothing anyone could act on.
 */
export function fitCheck(
  request: FitRequest,
  roles: ModelRole[],
  commitments: ModelCommitment[],
  currentMonday: string,
): FitResult {
  const requestedFirst = mondayOf(request.startsOn);
  const first = requestedFirst < currentMonday ? currentMonday : requestedFirst;
  const last = request.endsOn === null ? addDays(first, (HORIZON_WEEKS - 1) * 7) : mondayOf(request.endsOn);
  if (first > last) return { fits: true };

  const role = roles.find((r) => r.id === request.roleId);
  const span = Math.round((dateMs(last) - dateMs(first)) / (7 * 86_400_000)) + 1;

  let shortBy = 0;
  const shortWeeks: string[] = [];
  for (const weekStart of weekStarts(first, span)) {
    const { free } = weekFor(role, request.roleId, commitments, weekStart);
    const shortfall = round2(request.hoursPerWeek - free);
    if (shortfall > 0) {
      shortWeeks.push(weekStart);
      shortBy = Math.max(shortBy, shortfall);
    }
  }
  return shortWeeks.length === 0 ? { fits: true } : { fits: false, shortBy, shortWeeks };
}
