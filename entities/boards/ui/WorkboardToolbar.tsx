"use client";

import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { readCardTemplates, type CardTemplate } from "@/entities/boards/lib/card-templates";
import { NewCardButton } from "./NewCardButton";
import { BoardSearch } from "./WorkboardSearch";
import { WorkboardFilterControls } from "./WorkboardFilterControls";
import { WorkboardFilterPanel } from "./WorkboardFilterPanel";
import { WorkboardSettingsMenu } from "./WorkboardSettingsMenu";
import { WorkboardViewMenu } from "./WorkboardViewMenu";
import { Icon, type IconName } from "@/kernel/ui/Icon";
import type { BoardSelection } from "./useBoardSelection";
import type { FilterControlDef } from "./workboard-filter-controls";
import type { GroupingId, SortId, ViewId } from "./workboard-filter-params";

const VIEW_LABEL: Record<ViewId, string> = { board: "Board", list: "List", calendar: "Calendar" };
// Each view's shape beside its name (W.174): the label still says it, the
// shape is what an eye scanning the bar for "the other view" finds first.
const VIEW_ICON: Record<ViewId, IconName> = { board: "columns", list: "rows", calendar: "calendar" };

// The one toolbar (WB-01). It used to be up to eighteen controls in one
// wrapping flex row: the filters, the board chips, the view toggle, the aging
// clock and four board-management buttons, all fighting for the same line and
// pushing the board itself below the fold. W.26 emptied the row by moving the
// filters into a fixed rail down the left of /admin and /team — which spent
// about a third of the viewport on options nobody reads until they narrow
// something, and shoved the board sideways to do it.
//
// W.89 brought them back here as compact pickers and deleted the rail, so the
// board has its full width on every surface. The row reads left to right as
// one sentence: what to find (search), what to keep (the filters), how to look
// at it (the view switcher), and the one thing you can add.
//
// ONE ROW (W.103.5, revised by W.103.13). It was two — 103px, where ClickUp's
// equivalent is about 40 — and four rows on a phone, which is half a viewport
// before the first card. Grouping, sort and selection moved into the view menu
// (WorkboardViewMenu) and have stayed there; that is what freed the line.
//
// The FILTERS came back. W.103.5 folded them into one button at every width,
// and Khoa used it and disagreed: a button's count says what you have narrowed
// by, and says nothing about which questions this board can answer, so a filter
// you have never opened is one you do not know exists. They are named pickers
// on the line again above 1400px and the button below it (WorkboardFilterPanel).
// Sprints, Epics, Archived and Board settings stay in the settings menu where
// W.26 put them.
export function WorkboardToolbar({
  data,
  f,
  defs,
  groupings,
  views,
  canAdd,
  extras,
  canManage,
  boardBase,
  selection,
  onNewCard,
  onOpen,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  /** Every filter this surface offers, as data (workboard-filter-controls.ts). */
  defs: FilterControlDef[];
  groupings: GroupingId[];
  views: ViewId[];
  canAdd: boolean;
  extras: boolean;
  canManage: boolean;
  boardBase: string;
  /**
   * The board's selection (W.70), or null where ticking is not offered. The
   * toolbar holds the one way in that does not depend on a pointer (W.93):
   * a touch screen has no hover, so without Select a phone would never see a
   * tick box at all.
   */
  selection: BoardSelection | null;
  onNewCard: (template?: CardTemplate) => void;
  onOpen: (drawer: "sprints" | "archived" | "settings") => void;
}) {
  const { single } = f;
  const activeEpics = data.epics.filter((e) => e.status === "active");
  return (
    <div className="admin-toolbar wb-toolbar u-mb-3">
      {/* Two groups that wrap apart, never into each other (W.166). As one
          flex row, the line broke wherever the filters happened to end: a
          picker gaining a count badge pushed the view switcher to a second
          row on its own, and without one it split the switcher from New card
          instead, so turning a filter on rearranged the whole bar. The
          filters wrap among themselves; the view, its options and New stay
          together at the top right (WB-01). */}
      <div className="wb-toolbar-start">
      <BoardSearch value={f.search} onChange={f.setSearch} />
      {/* The pickers on a wide viewport, and the one button they fold into on a
          narrow one. Both are always in the markup; CSS shows exactly one. */}
      <span className="admin-boardfilters">
        <WorkboardFilterControls defs={defs} />
      </span>
      <WorkboardFilterPanel defs={defs} onClear={f.clearFilters} filtersActive={f.filtersActive} />
      {single && extras && f.sprintFilter !== "all" && f.sprintFilter !== "backlog" && (
        <Link className="admin-btn admin-btn--sm" href={`${boardBase}/sprints/${f.sprintFilter}`}>
          View sprint
        </Link>
      )}
      {/* Cards parked until a date (W.54). Not a filter and not a column: a
          count that expands, so "nothing can start on this yet" costs one line
          of chrome instead of a lane of cards nobody can act on. */}
      {f.snoozedCount > 0 && (
        <button
          type="button"
          className={`admin-btn admin-btn--sm${f.snoozedShown ? " is-active" : ""}`}
          aria-pressed={f.snoozedShown}
          onClick={() => f.setSnoozedShown(!f.snoozedShown)}
          title="Cards snoozed until a date. They wake by themselves."
        >
          <Icon name="moon" /> {f.snoozedCount} snoozed
        </button>
      )}
      {single?.program_name && <Badge tone="info">{single.program_name}</Badge>}
      </div>
      <div className="wb-toolbar-end">
      {/* ONE segmented control for the three views (W.97.4). It is the admin
          system's `.admin-viewtoggle`, the same segmented control the rest of
          /admin uses, and the active view is marked twice over: the filled
          segment for a reader looking at it, and `aria-pressed` for one who
          is not. There is no second place to change the view — the sidebar's
          rows navigate, this flicks. */}
      <div className="admin-viewtoggle" role="group" aria-label="Workboard view">
        {views.map((v) => (
          // The name is its own span so a narrow toolbar can hide it from
          // sight and keep it for a screen reader; the title shows it on hover
          // (W.176).
          <button key={v} type="button" className={f.view === v ? "is-active" : ""} aria-pressed={f.view === v} title={VIEW_LABEL[v]} onClick={() => f.setView(v)}>
            <Icon name={VIEW_ICON[v]} />
            <span className="wb-view-name">{VIEW_LABEL[v]}</span>
          </button>
        ))}
      </div>
      {/* Grouping, sort and selection, behind one button (W.103.5). Three
          controls that each answer "how am I looking at this" were taking
          permanent width from a row whose job is to get you to a card, and
          none of them is read at a glance. WorkboardViewMenu says why they are
          a labelled group rather than a role="menu", and why the density pair
          that used to sit with them is gone.
          The aging legend went with them, and not into the menu: every clock
          on a card now carries its own title saying how many days (W.103.1),
          so a separate line of chrome explaining the icon says it twice. */}
      <WorkboardViewMenu
        showGrouping={f.view === "board"}
        groupings={groupings}
        group={f.group}
        onGroup={(g) => f.setGroup(g)}
        showSort={f.view === "board" || f.view === "list"}
        sort={f.sort}
        onSort={(s) => f.setSort(s)}
        selection={f.view === "board" ? selection : null}
      />
      {single && extras && (
        <WorkboardSettingsMenu
          boardBase={boardBase}
          epicCount={activeEpics.length}
          sprintCount={data.sprints.length}
          archivedCount={data.archivedCards.length}
          canManage={canManage}
          onOpen={onOpen}
        />
      )}
      {/* New is always top right (WB-01). On a single board with templates
          it becomes a split button (W.58); everywhere else it is the button
          it has always been. Templates belong to a board, so a many-board
          scope offers none — there is no one board to take them from. */}
      {canAdd && <NewCardButton templates={single ? readCardTemplates(single.metadata) : []} onNew={onNewCard} />}
      </div>
    </div>
  );
}
