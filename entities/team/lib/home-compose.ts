// The team Home's small decisions (TH.1), kept pure so each is tested rather
// than buried in the page: the order the story plays in, who the strip deals,
// and what "Coming up" lists. The page reads; these decide.
import { isNewFace, type HomePerson } from "./home-people";

/** A shuffle that takes its random source, so a test can pin it. */
export function shuffle<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** How many photos the story plays. */
export const STORY_LENGTH = 9;
/** The newest photos always open the story, in order (Khoa, 2026-10-09). */
const STORY_PINNED = 2;

/**
 * The story's order: `newestFirst` is the gallery newest first. The two newest
 * open it, then a random draw of the rest, different on every visit.
 */
export function storyOrder<T>(newestFirst: readonly T[], random: () => number = Math.random): T[] {
  const pinned = newestFirst.slice(0, STORY_PINNED);
  return [...pinned, ...shuffle(newestFirst.slice(STORY_PINNED), random)].slice(0, STORY_LENGTH);
}

function month(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** The spotlight's one line: role and team, and how long they have been here. */
export function meetLine(p: Pick<HomePerson, "role" | "team" | "startDate">, today: string): string {
  const parts = [p.role, p.team ? `${p.team} team` : null].filter(Boolean);
  if (p.startDate && p.startDate <= today) parts.push(`since ${month(p.startDate)}`);
  return parts.join(" · ") || "At Edge8";
}

/** Recent joiners, newest first. */
export function newFaces(people: readonly HomePerson[], today: string, limit = 3): HomePerson[] {
  return people
    .filter((p) => isNewFace(p.startDate, today))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
    .slice(0, limit);
}

export type ComingSource = {
  surveys: { id: string; surveyName: string; href: string; dueOn: string | null }[];
  events: { id: string; title: string; type: string; startsAt: string; location: string | null }[] | null;
  holidays: { date: string; name: string; closed: boolean }[] | null;
};

export type Coming = { key: string; title: string; detail: string; on: string | null; href: string | null; survey?: boolean };

/** The calendar day an instant falls on in Saigon, where the company runs (en-CA prints yyyy-mm-dd). */
export function saigonDay(instant: string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

const TYPE_WORD: Record<string, string> = { keynote: "Keynote", retreat: "Retreat", workshop: "Workshop", company_event: "Company event" };

/**
 * What is coming up: a survey waiting on the person first (it is something to
 * do, not a date), then events and holidays by date. Capped so the card stays a
 * glance; a source that failed to read (null) is left out rather than guessed.
 */
export function comingUp(src: ComingSource, limit = 4): Coming[] {
  const surveys: Coming[] = src.surveys.map((s) => ({
    key: `survey-${s.id}`,
    title: s.surveyName,
    detail: s.dueOn ? `Survey · due ${new Date(`${s.dueOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "Survey · waiting for you",
    on: null,
    href: s.href,
    survey: true,
  }));
  const dated: Coming[] = [
    ...(src.events ?? []).map((e) => ({
      key: `event-${e.id}`,
      title: e.title,
      detail: [TYPE_WORD[e.type] ?? "Event", e.location].filter(Boolean).join(" · "),
      on: saigonDay(e.startsAt),
      href: null,
    })),
    ...(src.holidays ?? []).map((h) => ({
      key: `holiday-${h.date}`,
      title: h.name,
      detail: h.closed ? "Office closed" : "Public holiday",
      on: h.date,
      href: null,
    })),
  ].sort((a, b) => (a.on ?? "").localeCompare(b.on ?? ""));
  return [...surveys, ...dated].slice(0, limit);
}
