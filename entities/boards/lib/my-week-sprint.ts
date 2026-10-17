// Your sprint (W.173): the rail beside My Week's agenda, the part of the page
// that shows work moving rather than work owed.
//
// WHY IT EXISTS. The 2026-10-07 review found the page left most of a wide screen
// empty and that nobody visited it: a correct list of what you owe earns no
// visit. The rail answers the other question — what have I done, and what do
// I do now — and it plays: a ring that fills, a plant every finished card
// feeds, badges that unlock by doing, a garden of past sprints.
//
// THE RULES IT PLAYS BY (product reviews of 2026-09-16 and 2026-10-07). Everything is
// measured against the reader's own sprint and the reader's own past, and the
// page is read by nobody else. Nothing scores, ranks or compares a person; no
// XP, no points, no streak counter. Nothing shrinks or wilts: a sprint with
// nothing finished is a seed, not a dead plant, and an unearned badge says how
// to earn it rather than that it was missed. Two of My Week's own rules were
// changed on purpose for this, approved in that review: the ring is a share of the
// reader's own sprint, and finished work is shown — as leaves and badges, never
// as a list.
import { addDays, businessDate, diffDays } from "@/kernel/config/dates";
import { weekWindow, type SprintWindow } from "./sprint-cadence";
import { TASK_PRIORITIES } from "./types";
import type { MyWeekCard } from "./my-week-read";
import type { MyWeekRow } from "./my-week";

/** How the sprint stands: each card once, and where today falls in the window. */
export type SprintRing = {
  closed: number;
  doing: number;
  /** Open and not started. */
  waiting: number;
  total: number;
  /** 0 on the window's first day, 6 on its last. */
  dayIndex: number;
  days: number;
};

export type BadgeId = "first" | "five" | "ten" | "p1" | "early" | "comeback";
export type Badge = { id: BadgeId; name: string; how: string; earned: boolean };

/** One past sprint in the garden: how many cards it fed. */
export type GardenSprint = { week: string; finished: number };

export type SprintRail = {
  ring: SprintRing;
  /** The one card to pick up now, or null when everything open has started. */
  nextUp: MyWeekRow | null;
  /** What fed the plant this sprint, oldest first: titles only, for the leaves' names. */
  fed: { id: string; title: string }[];
  badges: Badge[];
  /** The sprints before this one, oldest first. */
  garden: GardenSprint[];
};

/** How many past sprints the garden shows; the read fetches this far back. */
export const GARDEN_SPRINTS = 6;

/** The plant's look by cards fed: a leaf per card up to LEAVES, then a bud, then a bloom. */
export const PLANT_LEAVES = 8;
export const PLANT_BLOOM_AT = 10;

/** The first day whose finished work the rail needs: the oldest garden sprint's. */
export function railReadSince(sprintStart: string): string {
  return addDays(sprintStart, -7 * GARDEN_SPRINTS);
}

// A badge is a milestone of this sprint's own work. Its `how` is the sentence
// a locked badge shows, so a badge not yet earned is an invitation, not a gap.
const BADGES: { id: BadgeId; name: string; how: string; test: (done: MyWeekCard[]) => boolean }[] = [
  { id: "first", name: "First ship", how: "Finish your first card this sprint.", test: (d) => d.length >= 1 },
  { id: "five", name: "High five", how: "Finish five cards this sprint.", test: (d) => d.length >= 5 },
  { id: "ten", name: "In full bloom", how: `Finish ${PLANT_BLOOM_AT} cards this sprint.`, test: (d) => d.length >= PLANT_BLOOM_AT },
  { id: "p1", name: "Big rock", how: "Finish a P1 card.", test: (d) => d.some((c) => c.priority === "p1") },
  { id: "early", name: "Ahead of time", how: "Finish a card before its due day.", test: (d) => d.some((c) => finishedOn(c) !== null && c.due_date !== null && finishedOn(c)! < c.due_date) },
  { id: "comeback", name: "Back on track", how: "Finish a card that was running late.", test: (d) => d.some((c) => finishedOn(c) !== null && c.due_date !== null && finishedOn(c)! > c.due_date) },
];

function finishedOn(card: MyWeekCard): string | null {
  return card.completed_at ? businessDate(card.completed_at) : null;
}

// Most late first, then the higher priority, then the sooner due date: the
// order a person would pick in themselves, written down once.
function byPickOrder(a: MyWeekRow, b: MyWeekRow): number {
  if (a.lateDays !== b.lateDays) return b.lateDays - a.lateDays;
  const p = TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority);
  if (p !== 0) return p;
  const d = (a.due ?? "9999").localeCompare(b.due ?? "9999");
  return d !== 0 ? d : a.title.localeCompare(b.title);
}

/**
 * The rail, from what myWeek already sorted. `open` is every open card this
 * sprint holds for the reader; `done` what they finished inside the window;
 * `pastDone` what they finished before it, on the same boards.
 */
export function sprintRail({
  open,
  done,
  pastDone,
  span,
  today,
  weekOf,
}: {
  open: MyWeekRow[];
  done: MyWeekCard[];
  pastDone: MyWeekCard[];
  span: SprintWindow;
  today: string;
  /** The sprint week a date belongs to (sprintWeekOf), passed in so this file does not import its caller. */
  weekOf: (date: string) => string;
}): SprintRail {
  const doing = open.filter((r) => r.doing).length;
  const days = diffDays(span.startsOn, span.endsOn) + 1;
  const ring: SprintRing = {
    closed: done.length,
    doing,
    waiting: open.length - doing,
    total: done.length + open.length,
    dayIndex: Math.min(Math.max(diffDays(span.startsOn, today), 0), days - 1),
    days,
  };

  const fedInOrder = [...done].sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));

  const garden: GardenSprint[] = [];
  for (let i = GARDEN_SPRINTS; i >= 1; i -= 1) {
    const week = weekOf(addDays(span.startsOn, -7 * i));
    const w = weekWindow(week);
    if (!w) continue;
    const finished = pastDone.filter((c) => {
      const on = finishedOn(c);
      return on !== null && on >= w.startsOn && on <= w.endsOn;
    }).length;
    garden.push({ week: week.slice(week.indexOf("W")), finished });
  }

  return {
    ring,
    nextUp: open.filter((r) => !r.doing).sort(byPickOrder)[0] ?? null,
    fed: fedInOrder.map((c) => ({ id: c.id, title: c.title })),
    badges: BADGES.map(({ id, name, how, test }) => ({ id, name, how, earned: test(done) })),
    garden,
  };
}
