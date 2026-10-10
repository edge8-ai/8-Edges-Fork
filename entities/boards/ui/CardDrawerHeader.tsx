"use client";

import type { WorkboardData, WorkboardCard, WorkboardLane } from "@/entities/boards/lib/workboard";
import { cardPrSync, type SprintRow, type EpicRow } from "@/entities/boards/lib/types";
import { CardDrawerBar } from "./CardDrawerBar";
import { CardDueWeekendNote } from "./CardDueWeekendNote";
import { CardHandoverNote } from "./CardHandoverNote";
import { CardPills } from "./CardPills";
import { CardWhereRows } from "./CardWhereRows";
import type { Dispatch, SetStateAction } from "react";
import type { Form } from "./board-view-types";

// The drawer's pinned part under the title (W.151): the board's last refusal,
// the bar of facts somebody changes without reading anything, the planning
// fields every card shows, and the two notes that only appear when they apply.
// It moved out of CardDrawer because the drawer had reached the client
// component size cap, and this is the part the work card redesign reshapes.
export function CardDrawerHeader({
  form,
  setForm,
  data,
  activeCard,
  lanes,
  currentLaneId,
  activeSprints,
  activeEpics,
  derivedTokens,
  viewerPersonId,
  readOnly,
  saving,
  error,
  onMoveLane,
}: {
  form: Form;
  /** The drawer's state setter: the epic picker folds a created epic in with an updater (W.163 F11). */
  setForm: Dispatch<SetStateAction<Form | null>>;
  data: WorkboardData;
  activeCard: WorkboardCard | null;
  lanes: WorkboardLane[];
  currentLaneId?: string;
  activeSprints: SprintRow[];
  activeEpics: EpicRow[];
  derivedTokens: number | null;
  viewerPersonId: string | null;
  readOnly: boolean;
  saving: boolean;
  error?: string | null;
  onMoveLane: (cardId: string, laneId: string) => void;
}) {
  return (
    <div className="wb-drawer-subhead">
      {error && <div className="admin-alert admin-alert--err" role="alert">{error}</div>}
      {/* Where the card belongs comes first (W.168): the client, then its brand. */}
      <CardWhereRows form={form} setForm={setForm} data={data} readOnly={readOnly} />
      <CardDrawerBar
        form={form}
        setForm={setForm}
        lanes={lanes}
        currentLaneId={currentLaneId}
        people={data.people}
        currentAssigneeName={activeCard?.assignee_name ?? null}
        derivedTokens={derivedTokens}
        readOnly={readOnly}
        onMoveLane={onMoveLane}
      />
      <CardPills
        form={form}
        setForm={setForm}
        activeSprints={activeSprints}
        allSprints={data.sprints}
        activeEpics={activeEpics}
        allEpics={data.epics}
        boardSlug={data.boards.find((b) => b.id === form.boardId)?.slug ?? null}
        // The stamp is judged against the link in the form, so an unsaved edit
        // to another PR hides the old PR's title and state at once (W.161).
        prSynced={activeCard ? cardPrSync({ metadata: { ...activeCard.metadata, pr_url: form.prUrl } }) : null}
        readOnly={readOnly}
      />
      {!readOnly && (
        <CardDueWeekendNote
          value={form.dueDate}
          onChange={(dueDate) => setForm({ ...form, dueDate })}
          disabled={saving}
        />
      )}
      {!readOnly && (
        <CardHandoverNote form={form} setForm={setForm} people={data.people} viewerPersonId={viewerPersonId} />
      )}
    </div>
  );
}
