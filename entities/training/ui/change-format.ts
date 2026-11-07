// How change notes read on a page (TR.8): the day a note was posted, whether
// it is new enough to pop in, the feelings line, and how many leaves the
// learner's sprout grows. Pure, so the page's words are tested.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import type { Figures } from "../lib/programme-read-rules";
import { FEELINGS, FEELING_LABEL, type Feeling } from "../lib/training-rules";

/** A note is new for a week after it is posted. */
export const NEW_FOR_DAYS = 7;
/** The sprout has room for this many leaves; more changes still say their number. */
export const MAX_LEAVES = 5;

const FRICTION: ReadonlySet<Feeling> = new Set(["too_fast", "confusing", "boring", "hard"]);

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });

/** "30 Oct": the day a note was posted, in Vietnam time. */
export function dayLabel(iso: string): string {
  return DAY.format(new Date(iso));
}

/** Pure: whether a note posted at `iso` is still new at `now`. */
export function isNew(iso: string, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() < NEW_FOR_DAYS * 86_400_000;
}

/** Pure: how many leaves the sprout shows for this many changes. */
export function leaves(changes: number): number {
  return Math.max(0, Math.min(changes, MAX_LEAVES));
}

/** Pure: the read's feelings for the "Your learners say" line, with whether each is friction. */
export function feelingsLine(f: Figures | null): { label: string; n: number; friction: boolean }[] | null {
  if (!f) return null;
  const byLabel = new Map(FEELINGS.map((k) => [FEELING_LABEL[k], k]));
  return f.tags.slice(0, 5).map((t) => ({ label: t.label, n: t.n, friction: FRICTION.has(byLabel.get(t.label) as Feeling) }));
}
