// How the My Clients page reads a ClientDigest: which status a client falls
// under for the strip at the top, the sentence the page opens with, how long
// ago we last met, and the client's colour. Pure functions, so the page and
// its tests agree on every rule.

import { diffDays } from "@/kernel/config/dates";
import type { ClientDigest } from "@/entities/team/lib/client-digest";

// The strip's statuses, in the order the strip shows them. Each is a ?show=
// value; no value means every client.
export const SHOW_FILTERS = ["waiting", "now", "shipped", "quiet"] as const;
export type ShowFilter = (typeof SHOW_FILTERS)[number];

// A value the page does not know shows every client, so a stale link still
// opens the page rather than an empty one.
export function readShow(raw: string | undefined): ShowFilter | null {
  return (SHOW_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as ShowFilter) : null;
}

type StatusFacts = Pick<ClientDigest, "waiting" | "now" | "moved" | "quiet">;

export function matchesShow(d: StatusFacts, show: ShowFilter | null): boolean {
  switch (show) {
    case null:
      return true;
    case "waiting":
      return d.waiting.total > 0;
    case "now":
      return d.now.total > 0;
    case "shipped":
      return d.moved.total > 0;
    case "quiet":
      return d.quiet;
  }
}

// The page opens on the one thing someone acts on today: the clients that
// owe us something. Past three names it counts them, so it stays one line.
export function waitingHeadline(names: string[]): string {
  if (names.length === 0) return "Nothing is waiting on a client.";
  if (names.length > 3) return `You’re waiting on ${names.length} clients.`;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `You’re waiting on ${list}.`;
}

// Weekly sprint planning is the usual rhythm with a client, so a gap past two
// weeks means two missed meetings: the line turns amber, and says nothing more.
export const MET_STALE_DAYS = 14;

export function metPhrase(date: string | null, today: string): { text: string; stale: boolean } {
  if (!date) return { text: "No meetings yet", stale: false };
  const days = diffDays(date, today);
  const text = days <= 0 ? "Met today" : days === 1 ? "Met yesterday" : `Met ${days} days ago`;
  return { text, stale: days > MET_STALE_DAYS };
}

// A client's colour from the --color-client-N palette, picked from its id so
// it stays the same on every visit. Amber (2) is left out: on this page and on
// the Workboard amber means "waiting", and a client must never read as one.
const CLIENT_TONES = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export function clientTone(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CLIENT_TONES[h % CLIENT_TONES.length];
}
