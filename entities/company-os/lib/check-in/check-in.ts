import type { WorkboardCard, WorkboardLane } from "@/entities/boards";
// The browser-safe door, because the rule is pure and the composer stays
// testable without loading the boards server barrel.
import { personBoardState } from "@/entities/boards/client";
import { EVERY_ROSTER_EMAILS } from "./every-roster";

// The Daily Check-in Agent's composer (docs: /workflows/daily-check-in-agent/).
// Pure: it turns one roster's people plus the day's Workboard into the text
// that goes to that roster's Lark chat. The cron does the reading and sending,
// so every branch here is testable without a board or a webhook.

// A roster is a set of departments, because that is the only staff grouping the
// data actually carries (company_os.team_directory.team / departments.name).
// Anyone whose department is in no roster gets no check-in rather than being
// swept into the wrong team's post.
export type RosterKey = "product" | "eo" | "ops";
export type Roster = { key: RosterKey; label: string; departments: string[] };

export const ROSTERS: Roster[] = [
  { key: "product", label: "Product Team", departments: ["Product Development"] },
  { key: "eo", label: "EO", departments: ["EO"] },
  { key: "ops", label: "Operations", departments: ["Operations"] },
];

/** Whether a person belongs in a roster's report. */
export function inRoster(roster: Roster, person: RosterPerson): boolean {
  if (person.email && EVERY_ROSTER_EMAILS.includes(person.email.toLowerCase())) return true;
  return Boolean(person.department && roster.departments.includes(person.department));
}

export type RosterPerson = {
  personId: string;
  email: string | null;
  name: string;
  department: string | null;
  /** Leave that covers the run date, when the person is off. */
  offReason: string | null;
};

/** A card as the check-in names it: its title, and a link that opens it when the app's origin is known. */
export type CheckInItem = { title: string; url: string | null; client: string | null };
/** An open blocker, named with the card it sits on. */
export type CheckInBlocker = { card: string; body: string; url: string | null; client: string | null };

export type CheckInLine = {
  name: string;
  done: CheckInItem[];
  doing: CheckInItem[];
  blockers: CheckInBlocker[];
  /**
   * Nothing happened to any of this person's cards inside the window: none
   * moved column, none was finished, none picked up a comment. Creating a card
   * is deliberately not activity — see the note in `lineFor`.
   */
  quiet: boolean;
  noCards: boolean;
  offReason: string | null;
};

export type CheckIn = { roster: Roster; date: string; lines: CheckInLine[] };

/** Where a card lives, for naming it: the link that opens it (null without an origin) and its client (null on an internal board). */
export type CardRef = { url: string | null; client: string | null };
export type CardRefs = (card: WorkboardCard) => CardRef;
const NO_REF: CardRefs = () => ({ url: null, client: null });

function within(iso: string | null | undefined, since: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

/**
 * One person's three lines. `since` is the start of the activity window
 * (24 hours before the run, 72 on Monday to span the weekend); a card counts as active when it moved or picked up
 * a comment inside it, whoever did the moving, because the workflow counts a
 * move by a colleague as activity too. Every card is named: the report used to
 * stop at three titles and say "+N more", which hid the work it exists to show.
 */
export function lineFor(
  person: RosterPerson,
  cards: WorkboardCard[],
  lanes: WorkboardLane[],
  since: number,
  refFor: CardRefs = NO_REF,
): CheckInLine {
  // Doing and Done are counted by the boards entity's one rule, which the
  // digest and the weekly summary read too (U.2), so the three reports agree.
  // "Doing" is the in-progress lane, not every open card: a person in check-in
  // reports what they are working on now, so To do and Waiting are left out
  // (Dave, 2026-09-21). Done is a card finished inside the window, whether it
  // travelled to a done lane or was completed where it sat.
  const { doing, done } = personBoardState({ cards, lanes }, person.personId, since);
  const mine = cards.filter((c) => c.assignee_id === person.personId);
  const commented = mine.filter((c) => c.comments.some((m) => within(m.createdAt, since)));
  // Quiet asks whether anything happened TO a card, and creating one is not
  // something happening to it. The old test read `last_moved_at`, which falls
  // back to `created_at` when a card has never moved (workboard.ts), so filing
  // cards and moving none counted as activity and the Pending line — the one
  // that chases people — quietly left them out.
  const stirred = mine.filter((c) => within(c.last_column_move_at, since));
  const item = (c: WorkboardCard): CheckInItem => ({ title: c.title, ...refFor(c) });
  return {
    name: person.name,
    done: done.map(item),
    doing: doing.map(item),
    blockers: mine.flatMap((c) =>
      c.blockers.filter((b) => !b.resolved).map((b) => ({ card: c.title, body: b.body, ...refFor(c) })),
    ),
    quiet: stirred.length === 0 && done.length === 0 && commented.length === 0,
    noCards: mine.length === 0,
    offReason: person.offReason,
  };
}

export function buildCheckIn(
  roster: Roster,
  people: RosterPerson[],
  cards: WorkboardCard[],
  lanes: WorkboardLane[],
  now: Date,
  refFor: CardRefs = NO_REF,
  // The activity window in hours. 24 on a normal weekday; the caller passes 72
  // on Monday so the report spans the whole weekend rather than only Sunday.
  windowHours = 24,
): CheckIn {
  const since = now.getTime() - windowHours * 60 * 60 * 1000;
  const date = now.toISOString().slice(0, 10);
  const lines = people.map((p) => lineFor(p, cards, lanes, since, refFor));
  return { roster, date, lines };
}

// Lark refuses an interactive card much past 30 KB, and one person can hold
// fifty open cards, so a long report splits across as many cards as it needs,
// each kept under this many characters of content.
const CARD_CONTENT_LIMIT = 20_000;

export type CheckInMessage = { card: Record<string, unknown> };

/** Brackets in a title would end a markdown link early. */
function linkText(title: string): string {
  return title.replace(/[[\]]/g, "").trim() || "Untitled card";
}

// Every card line reads "Client - [title](link)", so a mixed list says whose
// work each card is. A card on a board with no client reads "Internal", the
// label the Workboard itself uses for those boards.
function cardRef(title: string, url: string | null, client: string | null): string {
  const name = url ? `[${linkText(title)}](${url})` : linkText(title);
  return `${client || "Internal"} - ${name}`;
}

function bullets(items: string[], empty: string): string {
  return items.length > 0 ? items.map((i) => `• ${i}`).join("\n") : empty;
}

// Doing, then Blockers, then Done — in that order, and every finished card is
// still named (Khoa, 2026-09-22).
//
// Done used to come first, so each of the ten person blocks opened with a wall
// of completed work and what a standup is actually for sat underneath it: on
// 12 September the Product card carried 57 Done lines, about 11.6 KB, and the
// reader had to scroll past all of them to reach one line of Doing. Nothing is
// dropped, counted or folded to fix that, because the people who read this want
// the detail — the order is what was wrong, not the content. Making Done a
// count with a link (the W.102 My Week decision) was considered and set aside
// for exactly that reason; it is still the move if this is not enough.
function personBlock(l: CheckInLine): string {
  return [
    `**${l.name}**${l.quiet ? "  ·  no card updated in 24h" : ""}`,
    `**Doing**\n${bullets(l.doing.map((c) => cardRef(c.title, c.url, c.client)), "Nothing in progress")}`,
    `**Blockers**\n${bullets(l.blockers.map((b) => `${cardRef(b.card, b.url, b.client)}: ${b.body}`), "None")}`,
    `**Done**\n${bullets(l.done.map((c) => cardRef(c.title, c.url, c.client)), "Nothing closed")}`,
  ].join("\n");
}

/**
 * The Lark messages for one roster's check-in: interactive cards with a
 * header, one section per person with every card linked, and a closing line
 * for who is pending, off, or has no cards. Usually one card; more when the
 * report outgrows what Lark accepts in one.
 */
export function renderCheckIn(checkIn: CheckIn, dateLabel: string): CheckInMessage[] {
  const { roster, lines } = checkIn;
  const working = lines.filter((l) => !l.offReason && !l.noCards);
  const blocks = working.map(personBlock);

  const pending = working.filter((l) => l.quiet).map((l) => l.name);
  const off = lines.filter((l) => l.offReason).map((l) => `${l.name} (${l.offReason})`);
  const noCards = lines.filter((l) => !l.offReason && l.noCards).map((l) => l.name);
  const summary: string[] = [];
  if (pending.length) summary.push(`**Pending:** ${pending.join(", ")}`);
  if (off.length) summary.push(`**Off:** ${off.join(", ")}`);
  if (noCards.length) summary.push(`**No cards:** ${noCards.join(", ")}`);
  if (working.length === 0 && off.length === 0 && noCards.length === 0) summary.push("Nobody on this roster today.");
  if (summary.length) blocks.push(summary.join("\n"));

  const groups: string[][] = [[]];
  let size = 0;
  for (const block of blocks) {
    const current = groups[groups.length - 1];
    if (current.length > 0 && size + block.length > CARD_CONTENT_LIMIT) {
      groups.push([]);
      size = 0;
    }
    groups[groups.length - 1].push(block);
    size += block.length;
  }

  const title = `Check-in · ${roster.label} · ${dateLabel}`;
  return groups.map((group, i) => ({
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: { tag: "plain_text", content: groups.length > 1 ? `${title} (${i + 1}/${groups.length})` : title },
      },
      elements: group.flatMap((content, j) => [
        ...(j > 0 ? [{ tag: "hr" }] : []),
        { tag: "div", text: { tag: "lark_md", content } },
      ]),
    },
  }));
}
