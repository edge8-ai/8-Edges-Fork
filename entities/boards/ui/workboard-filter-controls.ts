import type { MultiSelectOption } from "@/kernel/ui/MultiSelect";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { weekShort, weekWindow } from "@/entities/boards/lib/sprint-cadence";
import { formatDate } from "@/kernel/ui/format";
import { ATTENTION_LABEL, attentionFor, type AttentionId } from "@/entities/boards/lib/card-attention";

// Every filter the board offers, as data, in one list.
//
// This exists because the toolbar was up to eighteen controls in one wrapping
// flex row that pushed the board below the fold. W.26 answered that by moving
// the filters into a fixed rail down the left of /admin and /team, which cost
// about a third of the viewport and pushed the board itself sideways — a worse
// trade than the one it fixed. W.89 took the rail out: the filters are one row
// of compact popover pickers on every surface, and under the tablet breakpoint
// that row folds into a single "Filters (N)" button with a slide-over.
//
// The list is still data rather than markup because the row and the slide-over
// render the SAME defs, so the two cannot drift apart (WB-01), and every
// surface asks the same question of the same list.
//
// A filter a surface cannot use is absent from this list rather than rendered
// disabled: the board across every client has no sprint, the portal's single
// board has no board picker, and an absent control is the rule the toolbar has
// always followed (hide, never rearrange).
//
// Note what is NOT here: a per-option card count. A count beside each assignee
// would be a figure the system computes about a person, which the house rule
// forbids however useful it looks; the count each control carries is the number
// of values CHOSEN in it, which describes the filter and nobody else.

export type FilterControlDef =
  | { kind: "multi"; key: string; label: string; noun: string; options: MultiSelectOption[]; value: string[]; onChange: (next: string[]) => void }
  // `defaultValue` is what this control reads as NOT filtering. It is not
  // always "all": a single board opens on its own active sprint, and that is
  // the board as it comes rather than a filter anyone chose.
  //
  // `named` draws it as the named button the multi pickers use (W.176) rather
  // than a select as wide as its value. Only where the default means "no
  // filter": a single board's sprint default IS a sprint, and a bare "Sprint"
  // button would hide which one the board is showing.
  | { kind: "one"; key: string; label: string; options: MultiSelectOption[]; value: string; defaultValue: string; named?: true; onChange: (next: string) => void };

// The filter state and pickers a control list is built from: WorkboardFilters
// satisfies this.
export type FilterControlSource = {
  single: { id: string } | null;
  activeSprints: { id: string; name: string }[];
  weeks: string[];
  clientFilter: string[];
  setClientFilter: (next: string[]) => void;
  boardOptions: MultiSelectOption[];
  boardFilter: string[];
  setBoardFilter: (next: string[]) => void;
  assigneeFilter: string[];
  setAssigneeFilter: (next: string[]) => void;
  laneFilter: string[];
  setLaneFilter: (next: string[]) => void;
  epicOptions: MultiSelectOption[];
  epicFilter: string[];
  setEpicFilter: (next: string[]) => void;
  sprintFilter: string;
  setSprintFilter: (next: string) => void;
  weekFilter: string;
  setWeekFilter: (next: string) => void;
  attentionFilter: AttentionId[];
  setAttentionFilter: (next: AttentionId[]) => void;
};

/** How many values this control is narrowing the board by; 0 = not filtering. */
function controlCount(def: FilterControlDef): number {
  return def.kind === "multi" ? def.value.length : def.value === def.defaultValue ? 0 : 1;
}

/** Everything the whole filter set is narrowing by, for the "Filters (N)" button. */
export function controlsCount(defs: FilterControlDef[]): number {
  return defs.reduce((n, def) => n + controlCount(def), 0);
}

/**
 * What to call this control on its own trigger: the label without the "Filter
 * by" prefix, capitalised. In a toolbar of pickers every trigger would
 * otherwise open with the same two words, and the aria label keeps them.
 */
export function controlName(def: FilterControlDef): string {
  const bare = def.label.replace(/^Filter by /, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

export function filterControlDefs(data: WorkboardData, f: FilterControlSource): FilterControlDef[] {
  const out: FilterControlDef[] = [];
  const hasInternal = data.boards.some((b) => b.client_company_id === null);

  if (!f.single && (data.clients.length > 1 || (data.clients.length > 0 && hasInternal))) {
    out.push({
      kind: "multi",
      key: "client",
      label: "Filter by client",
      noun: "clients",
      options: [...data.clients.map((c) => ({ value: c.id, label: c.name })), ...(hasInternal ? [{ value: "internal", label: "Internal" }] : [])],
      value: f.clientFilter,
      onChange: f.setClientFilter,
    });
  }
  if (f.boardOptions.length > 0) {
    out.push({ kind: "multi", key: "board", label: "Filter by board", noun: "boards", options: f.boardOptions, value: f.boardFilter, onChange: f.setBoardFilter });
  }
  out.push({
    kind: "multi",
    key: "assignee",
    label: "Filter by assignee",
    noun: "assignees",
    options: [...data.people.map((p) => ({ value: p.id, label: p.name })), { value: "unassigned", label: "Unassigned" }],
    value: f.assigneeFilter,
    onChange: f.setAssigneeFilter,
  });
  out.push({
    kind: "multi",
    key: "lane",
    label: "Filter by status",
    noun: "statuses",
    options: data.lanes.map((l) => ({ value: l.id, label: l.name })),
    value: f.laneFilter,
    onChange: f.setLaneFilter,
  });
  if (f.epicOptions.length > 0) {
    out.push({ kind: "multi", key: "epic", label: "Filter by epic", noun: "epics", options: f.epicOptions, value: f.epicFilter, onChange: f.setEpicFilter });
  }
  // What needs attention (W.121): blocked, overdue, or either — only the kinds
  // this board can answer, so a client-safe board offers Overdue alone.
  const offered = attentionFor(data);
  out.push({
    kind: "multi",
    key: "attention",
    label: "Filter by attention",
    noun: "kinds",
    options: offered.map((a) => ({ value: a, label: ATTENTION_LABEL[a] })),
    value: f.attentionFilter,
    onChange: (next) => f.setAttentionFilter(offered.filter((a) => next.includes(a))),
  });
  // A sprint only means something on one board; across boards the sprint WEEK
  // takes its place, because it is the one key every board shares (SW-01).
  if (f.single && data.sprints.length > 0) {
    out.push({
      kind: "one",
      key: "sprint",
      label: "Filter by sprint",
      options: [
        { value: "all", label: "All sprints" },
        { value: "backlog", label: "Backlog (no sprint)" },
        ...f.activeSprints.map((s) => ({ value: s.id, label: s.name })),
        ...data.sprints.filter((s) => s.status === "closed").map((s) => ({ value: s.id, label: `${s.name} (closed)` })),
      ],
      value: f.sprintFilter,
      defaultValue: f.activeSprints[0]?.id ?? "all",
      onChange: f.setSprintFilter,
    });
  }
  if (!f.single && f.weeks.length > 0) {
    out.push({
      kind: "one",
      key: "week",
      // "Week", not "Sprint week": the trigger's name is the label, and the
      // toolbar on a laptop has no room for a second word (W.176).
      label: "Filter by week",
      named: true,
      options: [
        { value: "all", label: "All sprint weeks" },
        ...f.weeks.map((w) => {
          const win = weekWindow(w);
          return { value: w, label: `${weekShort(w)}${win ? ` · ${formatDate(win.startsOn)} to ${formatDate(win.endsOn)}` : ""}` };
        }),
      ],
      value: f.weekFilter,
      defaultValue: "all",
      onChange: f.setWeekFilter,
    });
  }
  return out;
}
