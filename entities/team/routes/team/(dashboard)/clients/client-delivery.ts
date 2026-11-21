// The delivery rules a client hub and the My Clients list both apply: which
// roadmap items are being built now, which cards wait on the client, which
// cards moved recently, and the hub page each of them lives on. They live in
// one module so the two screens cannot drift apart: before this file the list
// matched any lane named "wait" while the hub Overview took only the first, and
// a client could show different waiting cards on each.

import { effectivePriority, type BacklogItem } from "@/entities/client-programs";
import type { WorkboardData, WorkboardCard } from "@/entities/boards";
import { cardSlug } from "@/kernel/config/slug";

const DAY_MS = 86_400_000;

// "Moved this week" is a rolling seven days on both screens.
export const MOVED_WINDOW_DAYS = 7;

export function movedSinceIso(now = Date.now()): string {
  return new Date(now - MOVED_WINDOW_DAYS * DAY_MS).toISOString();
}

// A roadmap item is being built now when its effective priority (the client's,
// else Edge8's) is Now and it has not shipped.
export function isNowItem(item: Pick<BacklogItem, "status" | "edge8_priority" | "client_priority">): boolean {
  return item.status !== "shipped" && effectivePriority(item) === "now";
}

// Cards waiting on the client: open cards in any lane whose name says
// "wait". Lanes are merged by name across a client's boards, so a client with
// several boards still has one Waiting lane; matching every such lane keeps a
// renamed second one ("Waiting on client") from silently dropping out.
export function waitingCards(board: Pick<WorkboardData, "lanes" | "cards">): WorkboardCard[] {
  const lanes = new Set(board.lanes.filter((l) => l.name.toLowerCase().includes("wait")).map((l) => l.id));
  return board.cards.filter(
    (c) => !c.archived_at && c.status !== "done" && c.status !== "not_doing" && lanes.has(c.laneId),
  );
}

// Cards finished since `sinceIso`, newest first.
export function movedCards(cards: WorkboardCard[], sinceIso: string): WorkboardCard[] {
  return cards
    .filter((c) => !c.archived_at && c.status === "done" && (c.completed_at ?? "") >= sinceIso)
    .sort((a, b) => ((a.completed_at ?? "") < (b.completed_at ?? "") ? 1 : -1));
}

// Where a client's roadmap item or card is shown in the team hub. An item
// filed under an AI Program lives in that program's view; an untagged one
// lives on the hub's company-wide Roadmap or Board tab, which show untagged
// rows only once a client has programs. An item filed under an ARCHIVED
// program is shown nowhere: the program view 404s for an archived program and
// the company-wide tabs leave tagged rows out. Such an item gets no place, so
// a screen can say so instead of linking to a page that will not show it.
// `where` is the place as a phrase that follows a count: "3 more in Payroll IQ",
// "2 more company-wide".
export type HubPlace = { href: string; where: string };

export type ProgramState = { name: string; archived: boolean };

function hubBase(companyId: string): string {
  return `/team/clients/${companyId}`;
}

export function roadmapPlace(companyId: string, programId: string | null, programs: Map<string, ProgramState>): HubPlace | null {
  if (!programId) return { href: `${hubBase(companyId)}/roadmap`, where: "company-wide" };
  const program = programs.get(programId);
  if (!program || program.archived) return null;
  return { href: `${hubBase(companyId)}/programs/${programId}?tab=roadmap`, where: `in ${program.name}` };
}

export function boardPlace(companyId: string, programId: string | null, programs: Map<string, ProgramState>): HubPlace | null {
  if (!programId) return { href: `${hubBase(companyId)}/board`, where: "company-wide" };
  const program = programs.get(programId);
  if (!program || program.archived) return null;
  return { href: `${hubBase(companyId)}/programs/${programId}?tab=boards`, where: `in ${program.name}` };
}

// The roadmap tabs render each item with id="item-<id>", so the hash lands on it.
export function roadmapItemHref(place: HubPlace, itemId: string): string {
  return `${place.href}#item-${itemId}`;
}

// Every Workboard opens the card a ?card= parameter names (useCardDeepLink).
// The board under the drawer opens on the card's own sprint ("backlog" when it
// has none): a single board opens on the current sprint by default, and a
// waiting card left in an earlier sprint opened its drawer over a board of
// empty lanes (X.3). A many-board page ignores ?sprint=, so the link is safe
// on the company-wide board too.
export function cardHref(place: HubPlace, card: Pick<WorkboardCard, "id" | "title" | "sprint_id">): string {
  const join = place.href.includes("?") ? "&" : "?";
  return `${place.href}${join}sprint=${card.sprint_id ?? "backlog"}&card=${cardSlug(card.title, card.id)}`;
}
