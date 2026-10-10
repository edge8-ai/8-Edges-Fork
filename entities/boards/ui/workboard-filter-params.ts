import { firstParam, mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";
import type { AttentionId } from "@/entities/boards/lib/card-attention";

// The codec between the workboard's filters and the address bar (W.13). The
// filters used to be seven useState calls, so opening a card and pressing back
// reset them all and "the board, filtered to Acme, W38" could not be sent to
// anyone. They live in the query string instead, and this file is the one place
// that says how a filter is spelled there.
//
// Two rules hold it together:
//  - a filter at its default is ABSENT from the URL, so a clean board has a
//    clean link, and `mergeQuery` deletes the key rather than writing "all";
//  - a value the current board does not know (a stale link, a sprint that
//    closed, another client's board id) falls back to the default instead of
//    narrowing the board to nothing with no way to see why.

// How the board is DRAWN, as opposed to which cards survive: which renderer
// (W.26), what the columns stand for (W.25) and the order inside them (W.27).
// They ride in the same state and the same address bar as the filters — one
// codec, so "the calendar, grouped by client, filtered to Acme, a month on"
// is one link — but they are not filters: they never narrow the board, so they
// stay out of FILTER_PARAM_KEYS and out of the filter sentence.
//
// Three views since W.97.5, and the third one is the Calendar again since
// W.109. There were five: Calendar, Timeline and Schedule all answered "when
// is the work", none of them well, and W.97.5 kept Schedule. That one drew a
// Gantt bar from a START date the data does not have, so the CEO called it
// "bad and weird" and chose an agenda calendar in its place (W.109); the
// Schedule's code lives at commit b736475c for a future Timeline.
//
// EVERY RETIRED NAME STAYS DECODABLE — `readOne` falls back to the default for
// anything the surface does not offer, so an old ?view=schedule or
// ?view=timeline link opens the board rather than a blank page, which is the
// rule W.97.5 set and W.109 now depends on in the other direction.
export const VIEWS = ["board", "list", "calendar"] as const;
export type ViewId = (typeof VIEWS)[number];
export const GROUPINGS = ["lane", "epic", "client", "priority", "sprint", "assignee"] as const;
export type GroupingId = (typeof GROUPINGS)[number];
export const SORTS = ["manual", "due", "priority", "created"] as const;
export type SortId = (typeof SORTS)[number];

export type WorkboardFilterState = {
  client: string[];
  board: string[];
  assignee: string[];
  lane: string[];
  epic: string[];
  sprint: string;
  week: string;
  /**
   * Only the cards with no due date (W.105).
   *
   * A real filter and not a frame key: it narrows the cards, so it says itself
   * in the filter sentence and carries its own undo. It is the question the
   * Calendar raises and cannot answer on its own — that view draws a card on
   * its due day, so a card without one has no day to sit on, and all the view
   * can do is say how many there are and hand over to this filter.
   */
  undated: boolean;
  /**
   * Only the cards that need attention: blocked, overdue, or either (W.121).
   * The Flow view's Blocked and Overdue tiles link here, so the number on the
   * tile and the cards the board then shows are the same cards.
   */
  attention: AttentionId[];
  q: string;
  view: ViewId;
  group: GroupingId;
  sort: SortId;
  /**
   * The columns folded to a narrow strip (W.92.4), in the order they were
   * folded. Drawing, not filtering: a folded column keeps every card it has,
   * still reports the true count in its head and still accepts a drop, so it
   * narrows nothing and stays out of FILTER_PARAM_KEYS and the filter sentence.
   */
  collapsed: string[];
  /**
   * How many whole months the Calendar's agenda is from the one today sits in
   * (W.109), negative for the past. Drawing, not filtering: it moves the frame
   * rather than the cards, so it stays out of FILTER_PARAM_KEYS and the filter
   * sentence — but it rides in the same URL, because "the calendar for
   * November" should be a link somebody can send.
   *
   * It replaces the Schedule's whole-week `weekShift` (W.97.3) rather than
   * joining it: one date view, one frame offset, one key in the URL.
   */
  monthShift: number;
};

// What this board can legally be filtered by: the ids on offer, whether the
// scope is a single board (a sprint only means something there), and the
// sprint the board opens on when the URL is silent.
export type FilterVocabulary = {
  clients: string[];
  boards: string[];
  people: string[];
  lanes: string[];
  sprints: string[];
  weeks: string[];
  epics: string[];
  single: boolean;
  defaultSprint: string;
  // What this SURFACE offers, which is not the same on all three: the portal
  // has no calendar of internal due dates and the team hub has no client
  // timeline (W.28, W.29), and epic grouping needs one board in scope because
  // epics are board-scoped (W.41). A value the surface does not offer falls
  // back to the default, exactly as an unknown sprint id does.
  views: ViewId[];
  groupings: GroupingId[];
  // The attention kinds this board can answer (attentionFor): a client-safe
  // board has no blockers, so a link naming "blocked" there names nothing.
  attention: AttentionId[];
  /**
   * Whose cards the board opens on when the URL names no assignee (W.166):
   * the signed-in person on the Workboard pages, nobody elsewhere. Khoa,
   * 2026-10-05: "Filter should always default to the logged-in user". Absent
   * means no default, which is every surface that does not ask for one.
   */
  defaultAssignee?: string[];
};

// What NARROWS the cards. This list drives the filter sentence, which is why
// the frame keys below are deliberately not in it.
export const FILTER_PARAM_KEYS = ["client", "board", "assignee", "lane", "epic", "sprint", "week", "undated", "attention", "q"] as const;

// What describes the FRAME rather than the cards: which view, how it is grouped
// and sorted, which columns are folded, and how far the Calendar's month has
// moved. None of them narrows anything, so none belongs in the filter sentence
// — but every one of them is part of the board a person meant to send.
export const VIEW_PARAM_KEYS = ["view", "group", "sort", "collapsed", "month"] as const;

export function defaultFilters(v: FilterVocabulary): WorkboardFilterState {
  return { client: [], board: [], assignee: v.defaultAssignee ?? [], lane: [], epic: [], sprint: v.defaultSprint, week: "all", undated: false, attention: [], q: "", view: "board", group: "lane", sort: "manual", collapsed: [], monthShift: 0 };
}

// Several values share one key, comma separated: ids are uuids or the three
// synthetic values ("internal", "unassigned", "none"), none of which contain a
// comma.
function readList(raw: string | undefined, allowed: string[]): string[] {
  if (!raw) return [];
  const known = new Set(allowed);
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => known.has(s)))];
}

// The one list with a default that is not "nothing" (W.166). A URL silent on
// it means the default; "all" is how a person who cleared it says so, since
// clearing must survive a reload and an empty value is the same as a silent one.
const EVERYONE = "all";
function readAssignee(raw: string | undefined, v: FilterVocabulary, fallback: string[]): string[] {
  if (raw === EVERYONE) return [];
  if (!raw) return fallback;
  return readList(raw, [...v.people, "unassigned"]);
}
function writeAssignee(xs: string[], fallback: string[]): string | null {
  if (xs.join(",") === fallback.join(",")) return null;
  return xs.length > 0 ? xs.join(",") : EVERYONE;
}

function readOne(raw: string | undefined, allowed: string[], fallback: string): string {
  return raw && allowed.includes(raw) ? raw : fallback;
}

// How many columns one link may fold. A board has a handful; a URL naming
// hundreds is a mangled link or somebody poking, and neither should cost the
// board a walk down a long list on every render.
const MAX_COLLAPSED = 24;

// How far the Calendar's month may be pushed by a link. Half a year each way
// is more than anybody plans over and keeps a mangled `?month=1e9` from asking
// the date helpers for a year nobody has.
const MAX_MONTH_SHIFT = 6;

/** The month offset, read as a whole number inside the range a person could reach by clicking. */
function readMonthShift(raw: string | undefined): number {
  const n = Number(raw);
  if (raw === undefined || !Number.isFinite(n)) return 0;
  return Math.max(-MAX_MONTH_SHIFT, Math.min(MAX_MONTH_SHIFT, Math.trunc(n)));
}

/**
 * The folded columns (W.92.4) — the one value here read WITHOUT a vocabulary,
 * deliberately, and the one departure from the second rule at the top of this
 * file.
 *
 * Every other value has a fixed set to check against. A column id has none:
 * what the columns ARE is the grouping's answer (workboard-grouping.ts), so
 * under `?group=client` they are client ids and under the lanes lane ids — and
 * the grouping is itself decoded from this same URL. Giving the codec a column
 * list would make it depend on a value it is in the middle of decoding.
 *
 * So the SHAPE is checked here and the MEANING where it is known: the board
 * folds only the ids that match a column it is drawing, and an id matching
 * none is inert. That is the same outcome the fallback rule wants — a stale
 * link shows the board rather than a broken one — reached one layer later.
 */
function readColumnIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^[\w:-]{1,64}$/.test(s));
  return [...new Set(ids)].slice(0, MAX_COLLAPSED);
}

export function readFilters(params: SearchParamsObj, v: FilterVocabulary): WorkboardFilterState {
  const get = (k: string) => firstParam(params[k]);
  const d = defaultFilters(v);
  return {
    client: readList(get("client"), [...v.clients, "internal"]),
    board: readList(get("board"), v.boards),
    assignee: readAssignee(get("assignee"), v, d.assignee),
    lane: readList(get("lane"), v.lanes),
    // Epics are offered on every scope since W.37, so ?epic= is read on every
    // scope too — one id, several, or "none" for the cards that have no epic.
    epic: readList(get("epic"), [...v.epics, "none"]),
    // A sprint named on a many-board scope has no picker to unset it, so it is
    // ignored there rather than filtering invisibly; the sprint week takes its
    // place across boards.
    sprint: v.single ? readOne(get("sprint"), ["all", "backlog", ...v.sprints], d.sprint) : "all",
    week: v.single ? "all" : readOne(get("week"), ["all", ...v.weeks], "all"),
    // Offered on every scope: "what has nobody scheduled" is the same question
    // on one board and across all of them. Only "1" turns it on, so a mangled
    // ?undated=yes falls back to the default the way every other value does.
    undated: get("undated") === "1",
    // Offered on every scope, like undated: a kind this codec does not know
    // is dropped, so a stale link shows the board rather than nothing.
    attention: readList(get("attention"), v.attention) as AttentionId[],
    q: get("q")?.trim() ?? "",
    view: readOne(get("view"), v.views, d.view) as ViewId,
    group: readOne(get("group"), v.groupings, d.group) as GroupingId,
    sort: readOne(get("sort"), [...SORTS], d.sort) as SortId,
    collapsed: readColumnIds(get("collapsed")),
    monthShift: readMonthShift(get("month")),
  };
}

// The overrides handed to mergeQuery: a value to write, or null to drop the
// key. Unrelated params (?card=, a sort) survive because mergeQuery keeps them.
export function filterOverrides(s: WorkboardFilterState, v: FilterVocabulary): Record<string, string | null> {
  const d = defaultFilters(v);
  const list = (xs: string[]) => (xs.length > 0 ? xs.join(",") : null);
  return {
    client: list(s.client),
    board: list(s.board),
    assignee: writeAssignee(s.assignee, d.assignee),
    lane: list(s.lane),
    epic: list(s.epic),
    sprint: s.sprint === d.sprint ? null : s.sprint,
    week: s.week === "all" ? null : s.week,
    undated: s.undated ? "1" : null,
    attention: list(s.attention),
    q: s.q.trim() === "" ? null : s.q.trim(),
    view: s.view === d.view ? null : s.view,
    group: s.group === d.group ? null : s.group,
    sort: s.sort === d.sort ? null : s.sort,
    collapsed: list(s.collapsed),
    month: s.monthShift === 0 ? null : String(s.monthShift),
  };
}

export function filtersQuery(current: SearchParamsObj, s: WorkboardFilterState, v: FilterVocabulary): string {
  return mergeQuery(current, filterOverrides(s, v));
}

/**
 * Whether the URL says anything about this board at all — filters OR frame. It
 * decides whether the remembered set applies: a link someone sent is their
 * board, and must not be overwritten by what this browser last looked at.
 *
 * It asks about both lists on purpose. Until W.99 it asked only about
 * FILTER_PARAM_KEYS, because that constant was written when filters were the
 * only thing in the URL; the view, grouping, sort, folded columns and week
 * shift arrived later and stayed out of it so they would stay out of the
 * filter sentence. One list was then answering two questions, and the one it
 * answered wrongly was this one: `?view=list` names no FILTER key, so a sent
 * link opened on whatever view and filters this browser had last — on
 * production, a link to the list opened the Calendar under someone else's
 * assignee filter. Two lists, two questions.
 */
export function hasBoardParams(params: SearchParamsObj): boolean {
  return [...FILTER_PARAM_KEYS, ...VIEW_PARAM_KEYS].some((k) => {
    const value = firstParam(params[k]);
    return value !== undefined && value !== "";
  });
}

/**
 * The remembered set, as a bare board link brings it back (W.119).
 *
 * Everything but the VIEW, and the calendar's month that belongs to it. The
 * sidebar has a row per view — Board, List, Calendar — so the row somebody
 * clicked is the view they asked for, and the remembered `view=list` was
 * making the Board row open the List. Filters, grouping, sort and folded
 * columns are how this reader likes the board; which view to draw is what the
 * link says, and a bare link says "the board".
 */
export function restoredFilters(stored: string, v: FilterVocabulary): WorkboardFilterState {
  const d = defaultFilters(v);
  const read = readFilters(searchParamsObj(stored), v);
  // A surface that opens on the signed-in person's cards opens on them every
  // time (W.166): what this browser last looked at may restore the rest of
  // the board, but not whose cards it was showing.
  const assignee = v.defaultAssignee && v.defaultAssignee.length > 0 ? d.assignee : read.assignee;
  return { ...read, assignee, view: d.view, monthShift: d.monthShift };
}

export function searchParamsObj(search: string): SearchParamsObj {
  return Object.fromEntries(new URLSearchParams(search).entries());
}
