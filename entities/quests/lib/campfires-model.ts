// Campfires as the Quests page draws them (QS.5; spec "Wanted fires: hands",
// "Burning fires and seats"; glossary: Hand, Cold fire, Burning fire, Seat).
// Pure and browser-safe, beside standing and fight: the page's client
// components take these shapes as props, and campfires-read.ts fills them on
// the server.
//
// The three-hand rule lives here once. A topic's hands are counted by distinct
// person, the topic's words are the first hand's, and matching two hands to one
// topic is the database's job (quest_hands.topic_key is generated), so nothing
// here normalises text. What leaves this module is a count and whether the
// reader's own hand is up: never who raised a hand.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { initials } from "@/kernel/ui/format";
import type { TaughtSession } from "@/entities/training";
import type { Portrait } from "./party-picker";
import type { HandRow, LitRaidRow } from "./rows";

/** Three distinct hands make a cold fire, which anyone may light. */
export const HANDS_FOR_A_FIRE = 3;

/** A fire is twenty minutes where one of us teaches the rest. */
export const FIRE_MINUTES = 20;

/** The faces drawn by a burning fire; the count says the rest. */
export const SEAT_FACES = 5;

/** One topic people want to learn: its words, how many hands, and whether one is the reader's. */
export type WantedTopic = { key: string; topic: string; hands: number; mine: boolean };

/** What every fire the section draws carries. */
type FireCard = {
  questId: string;
  title: string;
  host: Portrait;
  /** The reader hosts it: "Host you", and no seat to take. */
  youHost: boolean;
  /** The session's start, ISO; the page shows it in Saigon. */
  startsAt: string;
  /** Live seats on the register. */
  seats: number;
  /** The first five people seated, in the order they sat down. */
  faces: Portrait[];
  /** The reader has a seat. */
  seated: boolean;
  /**
   * Where the reader runs the fire's session, when Training says they are its
   * organiser (QS.5b): its organiser's page, which their implied Host role
   * opens. Null for everyone else, who take a seat instead.
   */
  sessionHref: string | null;
};

/**
 * The reader's own fire whose session is over with no mark on its register
 * yet (QS.5c): only its Host, who organises it and has someone to mark, is
 * ever shown one, with Mark who came, until the register carries a word.
 * `endedAt` is when the session ended, ISO, and the session page is always
 * theirs to open.
 */
export type EndedFire = FireCard & { endedAt: string; sessionHref: string };

/** One lit Raid whose session has not ended (`endedAt` null), or the reader's own ended one still to mark. */
export type BurningFire = (FireCard & { endedAt: null }) | EndedFire;

export type Campfires = { wanted: WantedTopic[]; burning: BurningFire[] };

/** The empty section, for a page drawn with no database. */
export const NO_CAMPFIRES: Campfires = { wanted: [], burning: [] };

/** Whether a topic with this many distinct hands is a cold fire. */
export function isColdFire(hands: number): boolean {
  return hands >= HANDS_FOR_A_FIRE;
}

/** How many more hands a wanted topic needs before it is a fire. */
export function handsToGo(hands: number): number {
  return Math.max(0, HANDS_FOR_A_FIRE - hands);
}

/**
 * The wanted topics from their hands, for one reader. Hands meet under their
 * topic key; each topic counts its distinct people, says whether the reader is
 * one of them, and shows the first hand's words, trimmed. Most hands first,
 * then the topic wanted longest.
 */
export function shapeWanted(hands: readonly HandRow[], readerId: string): WantedTopic[] {
  const byKey = new Map<string, { topic: string; first: string; people: Set<string> }>();
  for (const h of hands) {
    const t = byKey.get(h.topic_key);
    if (!t) byKey.set(h.topic_key, { topic: h.topic.trim(), first: h.created_at, people: new Set([h.person_id]) });
    else {
      t.people.add(h.person_id);
      if (h.created_at < t.first) {
        t.first = h.created_at;
        t.topic = h.topic.trim();
      }
    }
  }
  return [...byKey]
    .sort(([, a], [, b]) => b.people.size - a.people.size || a.first.localeCompare(b.first))
    .map(([key, t]) => ({ key, topic: t.topic, hands: t.people.size, mine: t.people.has(readerId) }));
}

/** Wanted topics split the way the section draws them: cold fires as cards, the rest as lines. */
export function splitWanted(topics: readonly WantedTopic[]): { cold: WantedTopic[]; lines: WantedTopic[] } {
  return { cold: topics.filter((t) => isColdFire(t.hands)), lines: topics.filter((t) => !isColdFire(t.hands)) };
}

/** A topic's hands raised or lowered by the reader, as the page shows it before the server answers. */
export function withHand(topics: readonly WantedTopic[], key: string, up: boolean): WantedTopic[] {
  return topics.map((t) => (t.key === key && t.mine !== up ? { ...t, mine: up, hands: Math.max(0, t.hands + (up ? 1 : -1)) } : t));
}

/**
 * Whether the reader may light a topic's fire, and the Raid's title when they
 * may: refused below three distinct hands, or for a time that has passed.
 * The hands are the topic's wanted ones, read just before.
 */
export function planFire(hands: readonly HandRow[], startsAt: string, now: Date): { ok: true; title: string } | { ok: false; error: string } {
  const [topic] = shapeWanted(hands, "");
  if (!topic) return { ok: false, error: "Nobody wants that topic any more." };
  if (!isColdFire(topic.hands)) return { ok: false, error: "A fire needs three hands before anyone can light it." };
  if (Date.parse(startsAt) <= now.getTime()) return { ok: false, error: "Pick a time that has not passed." };
  return { ok: true, title: topic.topic };
}

function portrait(personId: string, names: ReadonlyMap<string, string>): Portrait {
  const name = names.get(personId) ?? "Someone";
  return { personId, name, initials: initials(name) };
}

/**
 * Whether a lit Raid shows to this reader, and how. A session neither
 * cancelled nor over burns for everyone. One that is over stays, ended, for
 * its Host alone while they organise it, someone sat by it, and its register
 * has no mark (QS.5c):
 * marking who came is what lands the fire, and the session page is their only
 * way back. Nothing drops an unmarked ended fire with time; that is undecided.
 */
function showsAs(r: LitRaidRow, s: TaughtSession | undefined, readerId: string, now: Date): "burning" | "ended" | null {
  if (!s || s.cancelled) return null;
  if (Date.parse(s.endsAt) > now.getTime()) return "burning";
  return r.host_id === readerId && s.organiserId === readerId && !s.marked && s.seated.length > 0 ? "ended" : null;
}

/**
 * The burning fires: lit Raids whose session is neither cancelled nor over,
 * soonest first, and the reader's own ended fires still to mark, first of all.
 * A Raid whose session Training does not know is not drawn.
 */
export function shapeBurning(raids: readonly LitRaidRow[], sessions: ReadonlyMap<string, TaughtSession>, names: ReadonlyMap<string, string>, readerId: string, now: Date): BurningFire[] {
  const out: BurningFire[] = [];
  for (const r of raids) {
    const s = sessions.get(r.training_id);
    const shows = showsAs(r, s, readerId, now);
    if (!s || !shows) continue;
    const card = {
      questId: r.id,
      title: r.title,
      host: portrait(r.host_id, names),
      youHost: r.host_id === readerId,
      startsAt: s.startsAt,
      seats: s.seated.length,
      faces: s.seated.slice(0, SEAT_FACES).map((p) => portrait(p, names)),
      seated: s.seated.includes(readerId),
      sessionHref: s.organiserId === readerId ? s.organiserPage : null,
    };
    // An ended fire shows only to the Host who organises it, so its session page is theirs (showsAs).
    out.push(shows === "ended" ? { ...card, endedAt: s.endsAt, sessionHref: s.organiserPage } : { ...card, endedAt: null });
  }
  return out.sort((a, b) => Number(b.endedAt !== null) - Number(a.endedAt !== null) || a.startsAt.localeCompare(b.startsAt));
}

/** The people a burning fire names: its Host and the first five seated. */
export function namedByFires(raids: readonly LitRaidRow[], sessions: ReadonlyMap<string, TaughtSession>): string[] {
  return raids.flatMap((r) => [r.host_id, ...(sessions.get(r.training_id)?.seated.slice(0, SEAT_FACES) ?? [])]);
}

const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/** A fire's day and hour in Saigon, apart: "Thu 23 Oct" and "16:00 Saigon". The plain card draws the day on its calendar leaf and says the hour beside it (QS.14). */
export function fireDayAndHour(startsAt: string): { day: string; hour: string } {
  const at = new Date(startsAt);
  return { day: DAY.format(at).replace(",", ""), hour: `${TIME.format(at)} Saigon` };
}

/** A due time in Saigon as the assistant says it (QS.9): "Fri 31 Oct, 18:00 Saigon". */
export function saigonDue(at: string): string {
  const { day, hour } = fireDayAndHour(at);
  return `${day}, ${hour}`;
}

/** A fire's time in Saigon: "Thu 23 Oct · 16:00 Saigon". */
export function fireTime(startsAt: string): string {
  const { day, hour } = fireDayAndHour(startsAt);
  return `${day} · ${hour}`;
}
