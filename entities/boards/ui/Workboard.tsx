"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import type { MoveCard, ReportHours } from "@/entities/boards/lib/types";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { type Card } from "./board-view-types";
import { useBoardActionRunner } from "./useBoardActionRunner";
import { useWorkboardFilters } from "./useWorkboardFilters";
import { useWorkboardDrag } from "./useWorkboardDrag";
import { useWorkboardGrouping } from "./useWorkboardGrouping";
import { useWorkboardCardActions } from "./useWorkboardCardActions";
import { useWorkboardLookups } from "./useWorkboardLookups";
import { useCardDeepLink } from "./useCardDeepLink";
import { useCardForm } from "./useCardForm";
import { WorkboardStories } from "./WorkboardStories";
import { SprintsTab } from "./SprintsTab";
import { WorkboardTabs, type WorkboardTab } from "./WorkboardTabs";
import { WorkboardDrawerStack } from "./WorkboardDrawerStack";
import type { BoardDrawer } from "./BoardDrawers";
import { WorkboardNotices } from "./WorkboardNotices";
import { CardHoursDialog } from "./CardHoursDialog";
import { useBoardAttention } from "./useBoardAttention";
import { availableGroupings, groupingVocabulary } from "./workboard-grouping";
import { surfaceOf, viewsFor } from "./workboard-surface";

// The one workboard (WB-01). Every surface that shows cards renders this:
// the admin and team board pages, the hub tabs, My Work, the Company
// Dashboard and the client portal. What differs between them is the data's
// scope and the switches below, never the look. `onMove` is this entity's
// moveCardColumn, handed in by the page because this is a client component and
// the boards server door is server-only.
//
// Which view is on screen, what the columns stand for and the order inside
// them all live in the address bar since W.26/W.25/W.27, alongside the filters
// and through the same codec — so "the board grouped by epic, sorted by due
// date, filtered to Acme" is one link. They are ?view=/?group=/?sort= params
// under this page rather than routes of their own (decision card W.69): every
// route added under app/ moves the hardcoded mount totals and makes the PR
// conflict with every other route-adding PR.
export function Workboard({
  data,
  onMove, onReportHours,
  viewerPersonId = null,
  canMove = true,
  canAdd = true,
  canEdit = true,
  extras = false,
  canManage = false,
  teamOptions = [],
  clientOptions = [],
  programOptions = [], defaultToViewer = false,
}: {
  data: WorkboardData;
  onMove: MoveCard;
  onReportHours?: ReportHours;
  viewerPersonId?: string | null;
  // Drag between lanes: everything, only the viewer's own cards, or nothing.
  canMove?: boolean | "own";
  canAdd?: boolean;
  canEdit?: boolean;
  // The board page's chrome: the Sprints tab and the sprint, epic, archived
  // and settings drawers. Only meaningful with one board in scope.
  extras?: boolean;
  canManage?: boolean;
  teamOptions?: BoardPerson[];
  clientOptions?: { id: string; name: string }[];
  programOptions?: { id: string; name: string; company_id: string }[]; defaultToViewer?: boolean; // open on the viewer's cards (W.166)
}) {
  const router = useRouter();
  const pathname = usePathname();
  const surface = surfaceOf(pathname);
  // Board links stay in-section: this renders under /admin, /team and /portal.
  const section = surface === "team" ? "/team" : "/admin";
  const single = data.boards.length === 1 ? data.boards[0] : null;

  // Optimistic lane overrides layered on the server's laneId, rebuilt per
  // `data.cards` identity: once fresh cards arrive (the move action's own
  // response, W.196) with no move in flight, the server's placement shows
  // through; a failed move refreshes rather than restoring a snapshot.
  const serverPlacement = useMemo<Record<string, string>>(
    () => Object.fromEntries(data.cards.map((c) => [c.id, c.laneId])),
    [data.cards],
  );
  const [placement, setPlacement, { pending: inFlight, run: syncedRun }] = useServerSyncedState(serverPlacement);

  // What this scope and this surface can offer, decided before the filters are
  // read so the codec can refuse a ?group= or ?view= that does not apply.
  const groupVocabulary = useMemo(() => groupingVocabulary(data), [data]);
  const groupings = useMemo(() => availableGroupings(groupVocabulary, single !== null), [groupVocabulary, single]);
  const views = useMemo(() => viewsFor(surface), [surface]);
  const offers = useMemo(() => ({ views, groupings, defaultAssignee: defaultToViewer ? viewerPersonId : null }), [views, groupings, defaultToViewer, viewerPersonId]);
  const f = useWorkboardFilters(data, placement, offers);
  // The id → row maps, and the chips this scope would only repeat.
  const { boardById, sprintName, epicById, hideInternal, hideClient } = useWorkboardLookups(data, f.clientFilter);
  const [banner, setBanner] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<BoardDrawer>(null);
  const [tab, setTab] = useState<WorkboardTab>("stories");
  const { saving, startSaving, run } = useBoardActionRunner(setBanner);

  const { form, setForm, openCard, openCreate, save, archive, close, drafts } = useCardForm({ data, sprintFilter: f.sprintFilter, epicFilter: f.epicFilter, setBanner, router, startSaving, run });
  const activeCard = form?.id ? data.cards.find((c) => c.id === form.id) ?? null : null;

  // What moved since you last looked, what you have ticked, and how far back
  // Done reaches (W.63, W.70, W.94) — all three are about the reader, not the
  // cards. One board or many is what sets how far back Done reaches (W.103.7).
  const attention = useBoardAttention({ data, cards: f.cards, filtersActive: f.filtersActive, canEdit, view: f.view === "board" ? "board" : "list", singleBoard: f.single !== null });

  const { orderedCards, move, reorder, moveState, hoursPrompt } = useWorkboardDrag({
    data,
    cards: f.cards,
    boardById,
    single,
    onMove,
    placement,
    setPlacement,
    run: syncedRun,
    setBanner,
    onReportHours, viewerPersonId,
  });
  const grouped = useWorkboardGrouping({
    data,
    cards: orderedCards,
    vocabulary: groupVocabulary,
    groupings,
    grouping: f.group,
    sort: f.sort,
    boardById,
    laneMove: move,
    laneReorder: reorder,
    setBanner,
    run: syncedRun,
  });

  const { quick, quickAdd, wipLimits, selectedCardId, mayMove } = useWorkboardCardActions({
    data,
    boardById,
    cards: grouped.cards,
    grouping: grouped.grouping,
    single,
    sprintFilter: f.sprintFilter,
    epicFilter: f.epicFilter,
    canEdit,
    canAdd,
    canMove,
    viewerPersonId,
    keysEnabled: form === null && drawer === null && f.view === "board",
    saving,
    run,
    onNewCard: () => openCreate(),
    onOpenCard: openCard,
  });

  const showSprintsTab = extras && single !== null;
  const boardBase = single ? `${section}/boards/${single.slug}` : "";
  // Two-way sync with ?card= (CU-01): open what a pasted link names, and
  // mirror the open card back into the address bar.
  useCardDeepLink(data.cards, openCard, activeCard);

  return (
    <>
      {showSprintsTab && <WorkboardTabs tab={tab} sprintCount={data.sprints.length} epics={data.epics} boardBase={boardBase} onSelect={setTab} />}

      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}

      {showSprintsTab && tab === "sprints" && <SprintsTab data={data} boardBase={boardBase} onManage={() => setDrawer("sprints")} />}

      {tab === "stories" && (
        <WorkboardStories
          data={data}
          f={f}
          grouped={grouped}
          attention={attention}
          views={views}
          groupings={groupings}
          boardById={boardById}
          single={single}
          sprintName={sprintName}
          epicById={epicById}
          viewerPersonId={viewerPersonId}
          hideInternal={hideInternal}
          hideClient={hideClient}
          inFlight={inFlight}
          moveState={moveState}
          canMove={canMove}
          canAdd={canAdd} canEdit={canEdit}
          canManage={canManage}
          extras={extras}
          boardBase={boardBase}
          saving={saving}
          run={run}
          wipLimits={wipLimits}
          selectedCardId={selectedCardId}
          quick={quick}
          quickAdd={quickAdd}
          mayMove={mayMove}
          onNewCard={(template) => openCreate(undefined, template)}
          onBanner={setBanner}
          onOpenDrawer={setDrawer}
          onOpenCard={openCard}
          onMoveLane={move}
          onAddCard={(laneId, title) => openCreate(laneId, undefined, title)}
          onNewCardDue={(dueDate) => openCreate(undefined, undefined, "", { dueDate })}
        />
      )}

      {/* What the board opens over itself: the card drawer, and the board's
          own sprint, archived and settings drawers. */}
      <WorkboardDrawerStack
        form={form}
        setForm={setForm}
        data={data}
        activeCard={activeCard}
        boardById={boardById}
        single={single}
        section={section}
        placement={placement}
        viewerPersonId={viewerPersonId}
        canEdit={canEdit}
        extras={extras}
        boardBase={boardBase}
        drawer={drawer}
        setDrawer={setDrawer}
        f={f}
        saving={saving}
        run={run}
        teamOptions={teamOptions}
        clientOptions={clientOptions}
        programOptions={programOptions}
        onBanner={setBanner}
        onMoveLane={move}
        onOpenCard={openCard}
        onSave={save}
        onArchive={archive}
        onClose={close}
        error={banner}
        drafts={drafts}
      />
      {hoursPrompt && <CardHoursDialog title={hoursPrompt.title} onSubmit={hoursPrompt.submit} onClose={hoursPrompt.cancel} />}
    </>
  );
}
