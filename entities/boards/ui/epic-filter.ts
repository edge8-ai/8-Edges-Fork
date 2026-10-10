import type { MultiSelectOption } from "@/kernel/ui/MultiSelect";

// The epic filter's options and labels (W.37). Epics used to be offered only on
// a single board, so the cross-board Workboard — the page the company opens
// daily — showed an epic chip on every card and no way to ask for one. They are
// offered everywhere now, which raises the question the single-board picker
// never had to answer: epics are BOARD-SCOPED, so two boards may each have a
// "Commerce & Billing" and they are different epics. Across boards every option
// therefore names its board, and the options are grouped board by board so the
// list reads as places rather than as an alphabet.
//
// The picker and the filter sentence take their wording from the same two
// functions here, so an option and the chip it produces cannot drift apart.

export type FilterableEpic = { id: string; board_id: string; name: string };
export type EpicFilterBoard = { id: string; name: string };

// Cards with no epic at all, spelled the same way in the URL (?epic=none) as
// the epics page has linked since PR #1433.
export const NO_EPIC = "none";

// Board first, then the epic's own order within it: the boards' order is the
// board's order in view, which is how the rest of the toolbar reads.
function groupByBoard(epics: FilterableEpic[], boards: EpicFilterBoard[]): FilterableEpic[] {
  const rank = new Map(boards.map((b, i) => [b.id, i]));
  return epics
    .map((e, i) => ({ e, board: rank.get(e.board_id) ?? boards.length, i }))
    .sort((a, b) => a.board - b.board || a.i - b.i)
    .map((x) => x.e);
}

// On a single board the board's name is on every option and says nothing. Where
// several boards are in view it is the only thing telling two same-named epics
// apart, so it leads: the board is the group, the epic is the item in it.
function labelFor(epic: FilterableEpic, boards: EpicFilterBoard[], single: boolean): string {
  if (single) return epic.name;
  const board = boards.find((b) => b.id === epic.board_id);
  return board ? `${board.name} · ${epic.name}` : epic.name;
}

export function epicFilterOptions(epics: FilterableEpic[], boards: EpicFilterBoard[], single: boolean): MultiSelectOption[] {
  if (epics.length === 0) return [];
  return [
    ...groupByBoard(epics, boards).map((e) => ({ value: e.id, label: labelFor(e, boards, single) })),
    { value: NO_EPIC, label: "No epic" },
  ];
}

// What the filter sentence calls each chosen epic — the same wording as the
// option that chose it, so dismissing "Ops · Billing" removes the thing the
// reader picked under that name.
export function epicFilterNames(epics: FilterableEpic[], boards: EpicFilterBoard[], single: boolean): { id: string; name: string }[] {
  return epics.map((e) => ({ id: e.id, name: labelFor(e, boards, single) }));
}
