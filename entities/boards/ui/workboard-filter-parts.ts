import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { weekShort } from "@/entities/boards/lib/sprint-cadence";
import { epicFilterNames } from "./epic-filter";
import { ATTENTION_LABEL, type AttentionId } from "@/entities/boards/lib/card-attention";

// The sentence a narrowed board says about itself (W.46), as data. "12 of 371
// cards" and one clear-everything button told you THAT the board was narrowed;
// the only way to learn WHY was to read back across up to seven pickers. This
// turns the same state into words — one part per thing that is filtering, each
// carrying the undo for itself.
//
// It is a pure function over the hook's own filtersActive/clearFilters seam, so
// what the sentence says and what a dismiss does are one decision, testable
// without a browser.

export type FilterPart = { key: string; label: string; remove: () => void };

// The filter state and its setters: WorkboardFilters satisfies this.
export type FilterControls = {
  clientFilter: string[];
  setClientFilter: (next: string[]) => void;
  boardFilter: string[];
  setBoardFilter: (next: string[]) => void;
  assigneeFilter: string[];
  setAssigneeFilter: (next: string[]) => void;
  laneFilter: string[];
  setLaneFilter: (next: string[]) => void;
  epicFilter: string[];
  setEpicFilter: (next: string[]) => void;
  sprintFilter: string;
  setSprintFilter: (next: string) => void;
  weekFilter: string;
  setWeekFilter: (next: string) => void;
  undatedFilter: boolean;
  setUndatedFilter: (next: boolean) => void;
  attentionFilter: AttentionId[];
  setAttentionFilter: (next: AttentionId[]) => void;
  search: string;
  setSearch: (next: string) => void;
};

// What each id is called on screen, and the sprint this board opens on — the
// one value dismissing the sprint part returns to, because a board's own
// active sprint is how it comes, not a filter anyone chose.
export type FilterNames = {
  clients: { id: string; name: string }[];
  boards: { id: string; name: string }[];
  people: { id: string; name: string }[];
  lanes: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
  epics: { id: string; name: string }[];
  defaultSprint: string;
};

// The one place the board's own rows become the names above. Both readers of
// the sentence — the filter row under the toolbar and the filtered-to-nothing
// line in the middle of the board — build it from here, so they can never
// disagree about what a filter is called.
export function filterNames(data: WorkboardData, f: { single: { id: string } | null; activeSprints: { id: string }[] }): FilterNames {
  return {
    clients: data.clients,
    boards: data.boards.map((b) => ({ id: b.id, name: b.client_name ? `${b.client_name} · ${b.name}` : b.name })),
    people: data.people.map((p) => ({ id: p.id, name: p.name })),
    lanes: data.lanes.map((l) => ({ id: l.id, name: l.name })),
    sprints: data.sprints.map((s) => ({ id: s.id, name: s.name })),
    // Board-qualified across boards, exactly as the picker offered them (W.37).
    epics: epicFilterNames(data.epics, data.boards, f.single !== null),
    // The board's own opening sprint, which the hook treats as "no filter".
    defaultSprint: f.single ? f.activeSprints[0]?.id ?? "all" : "all",
  };
}

const nameOf = (rows: { id: string; name: string }[], id: string, fallback: string) =>
  rows.find((r) => r.id === id)?.name ?? fallback;

export function filterParts(f: FilterControls, names: FilterNames): FilterPart[] {
  const parts: FilterPart[] = [];
  // A chosen value drops itself out of its own list, so dismissing one client
  // leaves the others filtering.
  const drop = (values: string[], value: string) => values.filter((v) => v !== value);

  for (const id of f.clientFilter) {
    parts.push({
      key: `client:${id}`,
      label: id === "internal" ? "Internal" : nameOf(names.clients, id, "Unknown client"),
      remove: () => f.setClientFilter(drop(f.clientFilter, id)),
    });
  }
  for (const id of f.boardFilter) {
    parts.push({ key: `board:${id}`, label: nameOf(names.boards, id, "Unknown board"), remove: () => f.setBoardFilter(drop(f.boardFilter, id)) });
  }
  for (const id of f.assigneeFilter) {
    parts.push({
      key: `assignee:${id}`,
      label: id === "unassigned" ? "Unassigned" : nameOf(names.people, id, "Unknown person"),
      remove: () => f.setAssigneeFilter(drop(f.assigneeFilter, id)),
    });
  }
  for (const id of f.laneFilter) {
    parts.push({ key: `lane:${id}`, label: nameOf(names.lanes, id, "Unknown status"), remove: () => f.setLaneFilter(drop(f.laneFilter, id)) });
  }
  // Epics take several values like the four above them (W.37); across boards
  // their names arrive board-qualified, because two boards may each have an
  // epic of the same name and they are different epics.
  for (const id of f.epicFilter) {
    parts.push({
      key: `epic:${id}`,
      label: id === "none" ? "No epic" : nameOf(names.epics, id, "Unknown epic"),
      remove: () => f.setEpicFilter(drop(f.epicFilter, id)),
    });
  }
  if (f.sprintFilter !== names.defaultSprint) {
    const label = f.sprintFilter === "all" ? "All sprints" : f.sprintFilter === "backlog" ? "Backlog" : nameOf(names.sprints, f.sprintFilter, "Unknown sprint");
    parts.push({ key: "sprint", label, remove: () => f.setSprintFilter(names.defaultSprint) });
  }
  if (f.weekFilter !== "all") {
    parts.push({ key: "week", label: weekShort(f.weekFilter), remove: () => f.setWeekFilter("all") });
  }
  // Named before the search, in the same order the keys sit in
  // FILTER_PARAM_KEYS, so the sentence reads the same way every time.
  if (f.undatedFilter) {
    parts.push({ key: "undated", label: "No due date", remove: () => f.setUndatedFilter(false) });
  }
  for (const id of f.attentionFilter) {
    parts.push({ key: `attention:${id}`, label: ATTENTION_LABEL[id], remove: () => f.setAttentionFilter(f.attentionFilter.filter((a) => a !== id)) });
  }
  if (f.search.trim() !== "") {
    parts.push({ key: "q", label: `“${f.search.trim()}”`, remove: () => f.setSearch("") });
  }
  return parts;
}
