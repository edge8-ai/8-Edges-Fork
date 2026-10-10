"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { boardFilterOptions } from "./board-filter";
import { epicFilterOptions, NO_EPIC } from "./epic-filter";
import { cardMatchesSearch } from "./board-search";
import { isSnoozed } from "@/entities/boards/lib/types";
import { attentionFor, needsAttention, type AttentionId } from "@/entities/boards/lib/card-attention";
import { saigonToday } from "@/kernel/config/dates";
import {
  defaultFilters,
  filtersQuery,
  hasBoardParams,
  readFilters,
  restoredFilters,
  searchParamsObj,
  type FilterVocabulary,
  type GroupingId,
  type SortId,
  type ViewId,
  type WorkboardFilterState,
} from "./workboard-filter-params";
import { FILTERS_KEY_PREFIX, recall, remember } from "./workboard-filter-memory";

// How long a pause in typing before the term is written to the address bar.
// The board itself narrows on every keystroke — this only governs the URL, so
// that a search is shareable and survives a refresh without writing a URL
// behind every letter.
const SEARCH_URL_DEBOUNCE_MS = 300;

// The workboard's filters and the cards that survive them. Client, person
// and status (the lane) are the three every surface shows; board joins them
// where a client in view has several (board-filter.ts), and the epic joins them
// on every surface since W.37 — a person who thinks "what is open in Commerce &
// Billing" asks it from the page they are on. A sprint only means something on a
// single board, so the toolbar offers it there alone, but the state lives here
// so the card form can preset a new card to the active sprint and epic.
// Across boards the sprint week (SW-01) takes the sprint filter's place: one
// key every board shares, so "everything in W38" is one pick.
//
// Every one of them lives in the query string (W.13), so back and forward step
// through the boards you looked at, a pasted link reproduces one exactly, and a
// refresh keeps it. The URL is written with history.pushState rather than a
// router navigation: the board holds every card already and filters in the
// browser, so a navigation would refetch the whole board to arrive at the array
// it is holding. Next syncs useSearchParams with pushState, and popstate is
// read back below, so the address bar stays the single source of truth.
export function useWorkboardFilters(
  data: WorkboardData,
  placement: Record<string, string>,
  // What this surface offers (W.26, W.28, W.29). Passed in rather than decided
  // here, because which views a surface has is the surface's decision and the
  // hook never learns which page it is on.
  offers: { views: ViewId[]; groupings: GroupingId[]; defaultAssignee?: string | null },
) {
  const single = data.boards.length === 1 ? data.boards[0] : null;
  const activeSprints = useMemo(() => data.sprints.filter((s) => s.status === "active"), [data.sprints]);
  // The weeks on offer, newest first, and each sprint's week for the card test.
  const weeks = useMemo(() => [...new Set(data.sprints.map((s) => s.week).filter((w): w is string => !!w))].sort((a, b) => b.localeCompare(a)), [data.sprints]);
  const sprintWeekById = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.week])), [data.sprints]);

  const vocabulary = useMemo<FilterVocabulary>(
    () => ({
      clients: data.clients.map((c) => c.id),
      boards: data.boards.map((b) => b.id),
      people: data.people.map((p) => p.id),
      lanes: data.lanes.map((l) => l.id),
      sprints: data.sprints.map((s) => s.id),
      weeks,
      epics: data.epics.map((e) => e.id),
      single: single !== null,
      defaultSprint: single ? activeSprints[0]?.id ?? "all" : "all",
      views: offers.views,
      groupings: offers.groupings,
      attention: attentionFor({ clientSafe: data.clientSafe }),
      // Only a person the board can show cards for: a viewer who is not among
      // its people would open on an empty board with nothing to explain it.
      defaultAssignee: offers.defaultAssignee && data.people.some((p) => p.id === offers.defaultAssignee) ? [offers.defaultAssignee] : [],
    }),
    [data.clients, data.boards, data.people, data.lanes, data.sprints, data.epics, weeks, single, activeSprints, offers.views, offers.groupings, offers.defaultAssignee, data.clientSafe],
  );

  // First paint reads the URL alone, so the server's markup and the browser's
  // agree; the remembered set is applied after mount, below.
  const params = useSearchParams();
  const pathname = usePathname();
  const urlParams = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const [state, setState] = useState<WorkboardFilterState>(() => readFilters(urlParams, vocabulary));
  const stateRef = useRef(state);
  const vocabularyRef = useRef(vocabulary);
  useEffect(() => {
    vocabularyRef.current = vocabulary;
  }, [vocabulary]);
  // One key per surface, and one spelling per surface: a trailing slash is the
  // same board, not a second one to remember separately.
  const storageKey = `${FILTERS_KEY_PREFIX}${(pathname ?? "").replace(/\/+$/, "") || "/"}`;
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeUrl = useCallback((next: WorkboardFilterState, mode: "push" | "replace") => {
    const query = filtersQuery(searchParamsObj(window.location.search), next, vocabularyRef.current);
    const href = `${window.location.pathname}${query}${window.location.hash}`;
    if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }, []);

  // One way in for every filter change: the new state, the address bar and the
  // remembered set move together. A picker pushes an entry, so back undoes the
  // pick; typing replaces, debounced, so a word is one entry and not eight.
  const commit = useCallback(
    (patch: Partial<WorkboardFilterState>, opts?: { debounced?: boolean }) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      setState(next);
      if (debounce.current) clearTimeout(debounce.current);
      if (opts?.debounced) {
        debounce.current = setTimeout(() => writeUrl(next, "replace"), SEARCH_URL_DEBOUNCE_MS);
      } else {
        writeUrl(next, "push");
      }
      remember(storageKey, filtersQuery({}, next, vocabularyRef.current));
    },
    [storageKey, writeUrl],
  );
  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // THE URL IS THE STATE, wherever it came from.
  //
  // `useState` reads it once at mount, and for a long time the only other way
  // in was `popstate` — which fires for Back and Forward and for nothing else.
  // A Next <Link> to the same route with a different query does not fire it:
  // the router pushes the entry and re-renders with fresh `useSearchParams`,
  // and the component stays mounted. So the sidebar's Board / List /
  // Calendar rows — which are exactly that link (entities/boards/ui/nav.ts) — moved the
  // address bar and lit their own row while the page went on drawing whatever
  // it had (W.103.10). Three things claimed to know the view and only the two
  // that read the URL directly agreed.
  //
  // WHY IT DOES NOT FIGHT `commit`. Every commit writes the URL through
  // `writeUrl`, so the params change and this runs — reads back exactly the
  // state that was just written, finds it equal, and stops. The comparison is
  // the whole safety: this adopts the URL only when the URL says something the
  // component does not already believe, which is true of an outside navigation
  // and false of our own write.
  const adopt = useCallback((search: string) => {
    const next = readFilters(searchParamsObj(search), vocabularyRef.current);
    if (JSON.stringify(next) === JSON.stringify(stateRef.current)) return;
    stateRef.current = next;
    setState(next);
  }, []);

  // The remembered set, taken over a URL that names nothing of its own, frame
  // or filter: a link someone sent is their board, not this browser's last
  // one. Writing it back with replaceState keeps the address bar true to the
  // screen without putting an entry behind the restore. False when nothing is
  // remembered, so the caller falls back to what the URL says.
  const applyRemembered = useCallback((): boolean => {
    const stored = recall(storageKey);
    if (!stored) return false;
    const next = restoredFilters(stored, vocabularyRef.current);
    if (JSON.stringify(next) !== JSON.stringify(stateRef.current)) {
      stateRef.current = next;
      setState(next);
      writeUrl(next, "replace");
    }
    return true;
  }, [storageKey, writeUrl]);
  // Set by Back and Forward, and read by the next URL change, so a step
  // through history is never mistaken for a fresh link (below).
  const fromHistory = useRef(false);
  const restored = useRef(false);

  // Back and forward. This is also what makes a browser-restored entry show
  // the board it described.
  //
  // The flag is cleared by the reader's next click as well as by the URL
  // change that consumes it. Back to the page's first entry — a full load,
  // not one the router made — does not move Next's search params, so the
  // change that would consume the flag never comes, and the next sidebar
  // click was being taken for a step through history. Back and Forward are
  // the browser's controls, never a click in the page; a link, by mouse or
  // by Enter, always is.
  useEffect(() => {
    function onPop() {
      fromHistory.current = true;
      adopt(window.location.search);
    }
    function onClick() {
      fromHistory.current = false;
    }
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
  }, [adopt]);

  // Any other navigation to this same route: a sidebar row, a link in a card,
  // a redirect. `params` is Next's own view of the query, so this fires on the
  // render that follows the router's push and never earlier.
  //
  // A BARE link from inside the app — the sidebar's Board row clicked from the
  // List — is the same ask as a fresh load of the page, so it gets the same
  // remembered set (W.119); it used to reset every filter instead. Back and
  // Forward do not: a bare history entry is a board that had no filters, and
  // restoring over it would make Back re-apply the filter it just undid.
  useEffect(() => {
    const search = `?${params.toString()}`;
    const stepped = fromHistory.current;
    fromHistory.current = false;
    if (restored.current && !stepped && !hasBoardParams(searchParamsObj(search)) && applyRemembered()) return;
    adopt(search);
  }, [params, adopt, applyRemembered]);

  // The same, once after mount, for the page's first URL.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (hasBoardParams(searchParamsObj(window.location.search))) return;
    applyRemembered();
  }, [applyRemembered]);

  const boardOptions = useMemo(() => boardFilterOptions(data.boards, state.client), [data.boards, state.client]);
  // Only the epics still being worked are worth offering; an archived one stays
  // readable on the cards that carry it, and in a link that names it.
  const epicOptions = useMemo(
    () => epicFilterOptions(data.epics.filter((e) => e.status === "active"), data.boards, single !== null),
    [data.epics, data.boards, single],
  );
  // Choosing clients changes the boards on offer; a board chosen under a
  // client no longer in view drops with it, so nothing filters invisibly.
  const pickClients = useCallback(
    (next: string[]) => {
      const offered = new Set(boardFilterOptions(data.boards, next).map((o) => o.value));
      commit({ client: next, board: stateRef.current.board.filter((id) => offered.has(id)) });
    },
    [commit, data.boards],
  );

  const firstLane = data.lanes[0]?.id ?? "";
  const boardClient = useMemo(
    () => new Map(data.boards.map((b) => [b.id, b.client_company_id])),
    [data.boards],
  );

  const { client: clientFilter, board: boardFilter, assignee: assigneeFilter, lane: laneFilter } = state;
  const { sprint: sprintFilter, epic: epicFilter, week: weekFilter, q: search } = state;
  const { undated: undatedFilter, attention: attentionFilter } = state;
  // How the board is DRAWN. It rides in the same URL state as the filters, so
  // one link carries both, but it is not a filter: it never narrows the board,
  // so it stays out of filtersActive and out of the filter sentence.
  const { view, group, sort, collapsed, monthShift } = state;

  // Snoozed cards (W.54). A card parked until a date leaves its column so it
  // stops shouting, and becomes a count in the toolbar that expands to show
  // them. It is not filtered away in any deeper sense: the count below is the
  // true one, the cards come back the moment the count is expanded, and a
  // SEARCH always reaches them — somebody typing a card's name is looking for
  // that card and "it is asleep" is not an answer (W.12 still has to find it).
  //
  // Today is read once per render from the Saigon calendar rather than from
  // the browser's, so a person in another timezone sees the board the company
  // sees — the same clock every other date on these screens is drawn from.
  const today = saigonToday();
  const [snoozedShown, setSnoozedShown] = useState(false);
  const searching = search.trim() !== "";
  const snoozedCards = useMemo(() => data.cards.filter((c) => isSnoozed(c, today)), [data.cards, today]);
  const hideSnoozed = !snoozedShown && !searching;

  // Every filter but the two the pulse strip presses, lane and attention (W.174):
  // what its cells count, so pressing one cell never zeroes the others.
  const scopeCards: Card[] = useMemo(
    () =>
      data.cards
        .filter((c) => !hideSnoozed || !isSnoozed(c, today))
        .filter((c) => {
          if (clientFilter.length === 0) return true;
          const clientId = boardClient.get(c.board_id ?? "") ?? null;
          return clientFilter.includes(clientId ?? "internal");
        })
        .filter((c) => boardFilter.length === 0 || boardFilter.includes(c.board_id ?? ""))
        .filter((c) => assigneeFilter.length === 0 || assigneeFilter.includes(c.assignee_id ?? "unassigned"))
        .filter((c) => epicFilter.length === 0 || epicFilter.includes(c.epic_id ?? NO_EPIC))
        .filter((c) =>
          sprintFilter === "all" ? true : sprintFilter === "backlog" ? c.sprint_id == null : c.sprint_id === sprintFilter,
        )
        .filter((c) => weekFilter === "all" || (c.sprint_id != null && sprintWeekById.get(c.sprint_id) === weekFilter))
        // The cards nobody has scheduled (W.105). It asks about the card's own
        // due date and not about the sprint it sits in: a card committed to a
        // fortnight still has no day, which is exactly the gap the Calendar
        // shows and this filter exists to close.
        .filter((c) => !undatedFilter || c.due_date == null)
        // Last, so it narrows whatever the pickers left rather than fighting them.
        .filter((c) => cardMatchesSearch(c, search))
        .map((c) => ({ ...c, columnId: placement[c.id] ?? c.laneId ?? firstLane })),
    [data.cards, boardClient, clientFilter, boardFilter, assigneeFilter, sprintFilter, epicFilter, weekFilter, undatedFilter, search, sprintWeekById, placement, firstLane, hideSnoozed, today],
  );
  // The lane a card is filed in, then blocked, overdue, or either (W.121): the rule the Flow tiles count by.
  const cards = useMemo(
    () => scopeCards.filter((c) => (laneFilter.length === 0 || laneFilter.includes(c.columnId)) && needsAttention(c, attentionFilter, today)),
    [scopeCards, laneFilter, attentionFilter, today],
  );

  // "Is anything narrowing the board" is asked against the defaults, not
  // against "all": a single board opens on its active sprint, and that is the
  // board as it comes, not a filter the reader chose.
  const defaults = useMemo(() => defaultFilters(vocabulary), [vocabulary]);
  const filtersActive =
    clientFilter.length > 0 ||
    boardFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    laneFilter.length > 0 ||
    sprintFilter !== defaults.sprint ||
    epicFilter.length > 0 ||
    weekFilter !== "all" ||
    undatedFilter ||
    attentionFilter.length > 0 ||
    search.trim() !== "";
  const clearFilters = useCallback(() => {
    // Clearing the filters leaves the view, the grouping and the sort alone:
    // "show me everything" is not "and go back to the board".
    commit({ client: [], board: [], assignee: [], lane: [], epic: [], sprint: defaults.sprint, week: "all", undated: false, attention: [], q: "" });
  }, [commit, defaults.sprint]);

  return {
    single,
    activeSprints,
    cards,
    scopeCards,
    clientFilter,
    setClientFilter: pickClients,
    boardOptions,
    boardFilter,
    setBoardFilter: useCallback((next: string[]) => commit({ board: next }), [commit]),
    assigneeFilter,
    setAssigneeFilter: useCallback((next: string[]) => commit({ assignee: next }), [commit]),
    laneFilter,
    setLaneFilter: useCallback((next: string[]) => commit({ lane: next }), [commit]),
    sprintFilter,
    setSprintFilter: useCallback((next: string) => commit({ sprint: next }), [commit]),
    epicOptions,
    epicFilter,
    setEpicFilter: useCallback((next: string[]) => commit({ epic: next }), [commit]),
    weeks,
    weekFilter,
    setWeekFilter: useCallback((next: string) => commit({ week: next }), [commit]),
    undatedFilter,
    setUndatedFilter: useCallback((next: boolean) => commit({ undated: next }), [commit]),
    attentionFilter,
    setAttentionFilter: useCallback((next: AttentionId[]) => commit({ attention: next }), [commit]),
    search,
    setSearch: useCallback((next: string) => commit({ q: next }, { debounced: true }), [commit]),
    // Snoozed cards are a state of the board, not a filter of it, so they are
    // NOT in the URL codec and NOT part of `filtersActive`: expanding them is
    // "show me what is parked", which does not make the board narrowed.
    snoozedCount: snoozedCards.length,
    snoozedShown,
    setSnoozedShown,
    filtersActive,
    clearFilters,
    // Several values in ONE commit, for a control that changes more than one
    // at a time — the Done head's "All done → List" (W.94) changes the view
    // and the lane filter together. Two calls in a row would each start from
    // the state this render closed over, and the second would undo the first.
    apply: commit,
    view,
    setView: useCallback((next: ViewId) => commit({ view: next }), [commit]),
    group,
    setGroup: useCallback((next: GroupingId) => commit({ group: next }), [commit]),
    sort,
    setSort: useCallback((next: SortId) => commit({ sort: next }), [commit]),
    // Which columns are folded (W.92.4), and the one way to fold or unfold
    // one. It goes through `commit` like every other drawing choice, so a
    // folded board is a link somebody can send and back undoes the fold.
    // Which month the Calendar is showing (W.109), as a whole-month offset
    // from the month today sits in. It goes through `commit` like every other
    // drawing choice, so the month is in the link and back steps out of a
    // shift instead of leaving the page.
    monthShift,
    setMonthShift: useCallback((next: number) => commit({ monthShift: next }), [commit]),
    collapsed,
    toggleCollapsed: useCallback(
      (columnId: string) => {
        const now = stateRef.current.collapsed;
        commit({ collapsed: now.includes(columnId) ? now.filter((id) => id !== columnId) : [...now, columnId] });
      },
      [commit],
    ),
  };
}

export type WorkboardFilters = ReturnType<typeof useWorkboardFilters>;
