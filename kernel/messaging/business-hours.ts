// Business time for notices (Z.7): when a notice may reach a person, read in
// Asia/Ho_Chi_Minh, where the company works. The notification router holds a
// non-urgent immediate notice that lands outside these hours until the next
// working morning, and every digest goes out on a working morning.
//
// Vietnam has kept UTC+7 all year since 1975, with no daylight saving, so the
// offset is a constant rather than a time-zone lookup. That keeps these pure
// and cheap, and makes the boundaries in the tests exact.
//
// Public holidays are not known here yet (v1): a holiday weekday counts as a
// working day. The working window is org-level configuration in code; there is
// no per-person setting, which would need a design Khoa approves first.

const OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The working window on a weekday, in minutes after midnight, Saigon time: 08:30 to 18:00. */
export const WORKING_HOURS = { startMinute: 8 * 60 + 30, endMinute: 18 * 60 } as const;

// The Saigon wall clock for an instant: the weekday (0 Sunday) and the minute of the day.
function wallClock(at: Date): { weekday: number; minute: number; midnightUtcMs: number } {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return {
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    // Saigon midnight of that day, as a real instant.
    midnightUtcMs: midnightShifted - OFFSET_MS,
  };
}

const isWeekday = (weekday: number) => weekday >= 1 && weekday <= 5;

/** Whether `at` falls inside the working window: Monday to Friday, 08:30 up to (not including) 18:00 Saigon time. */
export function inWorkingHours(at: Date): boolean {
  const { weekday, minute } = wallClock(at);
  return isWeekday(weekday) && minute >= WORKING_HOURS.startMinute && minute < WORKING_HOURS.endMinute;
}

/** Quiet hours are everything else: weekday nights and the whole weekend. */
export function inQuietHours(at: Date): boolean {
  return !inWorkingHours(at);
}

/**
 * The first working morning (a weekday at 08:30 Saigon time) strictly after
 * `at`. A held notice waits for it, and a digest item is sent on it. Strictly
 * after, so a digest queued at 08:30 on the dot goes in the next morning's
 * digest rather than racing the one being sent.
 */
export function nextWorkingMorning(at: Date): Date {
  const { midnightUtcMs } = wallClock(at);
  for (let day = 0; day <= 7; day++) {
    const morning = midnightUtcMs + day * DAY_MS + WORKING_HOURS.startMinute * MINUTE_MS;
    if (morning > at.getTime() && isWeekday(wallClock(new Date(morning)).weekday)) return new Date(morning);
  }
  // Unreachable: any eight consecutive days hold a weekday morning after `at`.
  throw new Error("no working morning within a week");
}
