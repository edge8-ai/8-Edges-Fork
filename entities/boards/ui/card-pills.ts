// The three pills under the card drawer's header: epic, sprint and pull request
// (docs/plans/2026-09-29-card-planning-pills.md).
//
// They are the three planning fields most cards hold (93%, 66% and 49% of the
// 764 people-made cards in the 60 days to 2026-09-24), so they are always on
// screen instead of waiting behind "+ Add field" — and always optional: an
// empty pill is an invitation, never an error.
//
// Pure, so the rules read and test without a DOM.

import { formatDate } from "@/kernel/ui/format";
import type { Result } from "@/kernel/data/result";
import type { PlanningField } from "./card-field-visibility";

export type PillField = Extract<PlanningField, "epic" | "sprint" | "pr">;

/** The header's fields, in the order the row draws them. */
export const PILL_FIELDS: readonly PillField[] = ["epic", "sprint", "pr"];

/**
 * Which core fields a card draws. Every card a person can edit draws all three,
 * empty or not, on every board (W.152): a field that disappears where no epic
 * or sprint is running is one nobody learns exists. A read-only surface draws
 * only what holds a value, because an empty field there is an invitation
 * nobody can take up — and a client reading the portal has no use for "None".
 */
export function pillsToDraw(held: { epicId: string; sprintId: string; prUrl: string }, readOnly: boolean): PillField[] {
  const holds: Record<PillField, boolean> = { epic: !!held.epicId, sprint: !!held.sprintId, pr: !!held.prUrl.trim() };
  return PILL_FIELDS.filter((f) => !readOnly || holds[f]);
}

/** What an empty core field reads: a value that is not there, never an action label. */
export const EMPTY_FIELD = { epic: "None", sprint: "None", pr: "None · paste a PR link" } as const satisfies Record<PillField, string>;

/**
 * "PR #1732" for a GitHub pull request URL, and plain "PR" for anything else:
 * the number is what people say out loud, and a link we cannot read a number
 * from still deserves a label rather than a raw URL squeezed into a pill.
 */
export function prPillLabel(url: string): string {
  const m = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url.trim());
  return m ? `PR #${m[1]}` : "PR";
}

/**
 * The sprint pill's words: its name, then when it starts, or that it closed.
 * A card carried out of a closed sprint still names it (W.142), so the pill
 * never reads as empty while the card is in one.
 */
export function sprintPillLabel(sprint: { name: string; starts_on: string | null } | undefined, closed: boolean): string {
  if (!sprint) return closed ? "Its sprint · closed" : "Sprint";
  if (closed) return `${sprint.name} · closed`;
  return sprint.starts_on ? `${sprint.name} · ${shortDate(sprint.starts_on)}` : sprint.name;
}

/** "Sep 29" — the year is noise on a sprint that is this week or next. */
export function shortDate(iso: string): string {
  const full = formatDate(iso);
  return full.replace(/,\s*\d{4}$/, "");
}

/**
 * The epics a search keeps. It matches the description as well as the name,
 * because the description is how people tell domains apart (W.42): "invoice"
 * finds Commerce & Billing. Order is kept as given — epics read A to Z on
 * every board (PR 1680), and a picker that reorders them is a second order to
 * learn.
 */
export function filterEpics<E extends { name: string; description: string | null }>(epics: readonly E[], query: string): E[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...epics];
  return epics.filter((e) => e.name.toLowerCase().includes(term) || (e.description ?? "").toLowerCase().includes(term));
}

/** Enough domains that scanning the list is slower than typing. */
export const EPIC_SEARCH_FROM = 7;

/**
 * Whether the epic picker offers to create what was typed (W.153): only for a
 * name the board does not have yet, compared without case or surrounding
 * spaces, so "workboard ux" never makes a second Workboard UX. A partial
 * match still offers it: "Work" may well be a new epic beside "Workboard UX".
 */
export function canCreateEpic(epics: readonly { name: string }[], query: string): boolean {
  const name = query.trim().toLowerCase();
  if (!name) return false;
  return !epics.some((e) => e.name.trim().toLowerCase() === name);
}

/** One choice in the epic picker's listbox (W.153). */
export type EpicOption = { kind: "epic"; id: string; name: string } | { kind: "create" } | { kind: "clear" };

/**
 * The epic picker's options, in order, as ONE listbox (W.153, review P1): the
 * epics the search kept, then Create when the typed name is new, then No epic
 * when the card has one to clear. The WAI-ARIA combobox pattern puts every
 * choice in the listbox the field controls, so the keyboard reaches all of
 * them the same way and a screen reader hears them as one list.
 */
export function epicComboOptions(kept: readonly { id: string; name: string }[], creatable: boolean, canClear: boolean): EpicOption[] {
  const options: EpicOption[] = kept.map((e) => ({ kind: "epic", id: e.id, name: e.name }));
  if (creatable) options.push({ kind: "create" });
  if (canClear) options.push({ kind: "clear" });
  return options;
}

/**
 * Which option is highlighted when the search changes, and so what Enter
 * takes (W.153, review P2). The first epic whose NAME holds what was typed;
 * failing that, Create; failing that, the top. The search also matches
 * descriptions, so "invoice" keeps Commerce & Billing in view, but Enter must
 * not file a card under an epic whose name the person never typed when the
 * name they did type is on offer to create.
 */
export function defaultActive(options: readonly EpicOption[], query: string): number {
  const term = query.trim().toLowerCase();
  if (!term) return 0;
  const named = options.findIndex((o) => o.kind === "epic" && o.name.toLowerCase().includes(term));
  if (named !== -1) return named;
  const create = options.findIndex((o) => o.kind === "create");
  return create !== -1 ? create : 0;
}

/**
 * Creates the epic and, on a card that exists, files the card in it straight
 * away (W.153, review P7): the person pressed Enter on "Create epic", and an
 * epic left behind with no card in it because they closed without saving is
 * not what they asked for. A new card has nothing to write to yet; its Create
 * button files it. When filing fails the epic stays on the form (`saved:
 * false`), so Save tries again. A create that threw — a dropped connection, an
 * expired session — becomes a message, never a picker stuck on "Creating…"
 * (seen in a browser on 2026-10-05).
 */
export async function createEpicForCard(args: {
  name: string;
  cardId: string | null;
  create: (name: string) => Promise<Result & { id?: string }>;
  setEpic: (cardId: string, epicId: string) => Promise<Result>;
}): Promise<{ ok: true; epicId: string; saved: boolean } | { ok: false; error: string }> {
  let created: Result & { id?: string };
  try {
    created = await args.create(args.name);
  } catch {
    return { ok: false, error: "The epic could not be created. Try again." };
  }
  if (!created.ok) return created;
  if (!created.id) return { ok: false, error: "The epic could not be created. Try again." };
  if (!args.cardId) return { ok: true, epicId: created.id, saved: false };
  let filed: Result;
  try {
    filed = await args.setEpic(args.cardId, created.id);
  } catch {
    filed = { ok: false, error: "" };
  }
  return { ok: true, epicId: created.id, saved: filed.ok };
}
