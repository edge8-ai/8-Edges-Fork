// Which recording belongs to which session (English Program PR 7), pure: a
// Lark minute matches a session when its title is the plan's Lark title and
// it started between fifteen minutes before the session and its end, so a
// 1-1 recorded the same afternoon never attaches to the group session, and a
// session is looked for only once thirty minutes have passed since its end.
import { foldDiacritics } from "@/kernel/config/people-name";

export const PICKUP_DELAY_MS = 30 * 60_000;
export const EARLY_START_MS = 15 * 60_000;
export const LOOKBACK_DAYS = 14;

export function titleMatches(larkTitle: string, minuteTitle: string): boolean {
  return foldDiacritics(minuteTitle.trim()).includes(foldDiacritics(larkTitle.trim()));
}

export function startedInWindow(session: { startsAt: string; endsAt: string }, startedAt: string): boolean {
  const t = new Date(startedAt).getTime();
  return t >= new Date(session.startsAt).getTime() - EARLY_START_MS && t <= new Date(session.endsAt).getTime();
}

/** Whether the pickup should look for this session's recording now: it ended at least thirty minutes ago and within the lookback. */
export function dueForPickup(session: { endsAt: string }, now: Date): boolean {
  const end = new Date(session.endsAt).getTime();
  return end + PICKUP_DELAY_MS <= now.getTime() && end >= now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60_000;
}
