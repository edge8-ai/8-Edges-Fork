"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import { MultiSelect } from "@/kernel/ui/MultiSelect";
import { formatDate } from "@/kernel/ui/format";
import { addDays } from "@/kernel/config/dates";
import { cardSlug } from "@/kernel/config/slug";
import type { WorkboardCard, WorkboardData } from "@/entities/boards/lib/workboard";
import { SPRINT_CHATS, type SprintChat } from "@/entities/boards/lib/sprint-cadence";
import { weekShort, weekWindow } from "@/entities/boards/lib/sprint-cadence";
import { doneWindow, planningBoards, planningColumn, planningWeeks, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import { moveCardColumn } from "@/entities/boards/lib/move-card";
import { SprintPlanningPanels } from "./SprintPlanningPanels";
import { CardDrawer } from "./CardDrawer";
import { useSprintPlanningAddCard } from "./useSprintPlanningAddCard";
import { clientLabel } from "@/entities/boards/lib/card-facts";

type Card = WorkboardCard & { columnId: string; pb: PlanningBoard };

// Sprint planning (SP-01): the Monday-to-Tuesday meeting. One panel per board
// (W.17), each with its own two lanes — everything not done on the left, next
// week's sprint on the right — over a strip of what finished this week (W.20),
// so the board, its sprint and its cards are one thing to look at, and a card
// can only ever be committed to its own board's sprint.
//
// The columns are lib/sprint-planning's rule; this file is the placement
// state, the writes and the filters. Rendered on /admin and /team alike.
// The week picker (SW-01) reads a past planning back: newest week first, and
// the newest is the live one.
export function SprintPlanning({
  data,
  today,
  canEdit = true,
  carriedSprints = {},
  viewerPersonId = null,
}: {
  data: WorkboardData;
  today: string;
  canEdit?: boolean;
  // Sprint-commit counts by card id (W.52), read on the server. Absent on a
  // surface that has not asked for them: then no card wears the question.
  carriedSprints?: Record<string, number>;
  // Who is planning, for the card drawer's "Needs a hand" and handover note.
  viewerPersonId?: string | null;
}) {
  const router = useRouter();
  const section = usePathname()?.startsWith("/team") ? "/team" : "/admin";
  const weeks = useMemo(() => planningWeeks(data), [data]);
  const [week, setWeek] = useState<string>(weeks[0] ?? "");
  // The live week is the newest one, planned the usual way; any other is history.
  const chosenWeek = week && week !== weeks[0] ? week : null;
  const { since, until } = doneWindow(chosenWeek, today);
  const boards = useMemo(() => planningBoards(data, chosenWeek), [data, chosenWeek]);
  const teams = SPRINT_CHATS.filter((c) => boards.some((b) => b.chat === c.key));
  const [team, setTeam] = useState<SprintChat | "">(teams[0]?.key ?? "");
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const inView = boards.filter((b) => (!team || b.chat === team) && (clientFilter.length === 0 || clientFilter.includes(b.board.client_company_id ?? "internal")));
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of boards.filter((b) => !team || b.chat === team)) seen.set(b.board.client_company_id ?? "internal", clientLabel(b.board));
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [boards, team]);
  // The assignee picker (SP-01): everyone with a card shown on a board in the
  // current team, unassigned cards grouped under one option so they can be
  // filtered to as well.
  const assignees = useMemo(() => {
    const teamBoardIds = new Set(boards.filter((b) => !team || b.chat === team).map((b) => b.board.id));
    const seen = new Map<string, string>();
    for (const c of data.cards) {
      if (!teamBoardIds.has(c.board_id ?? "")) continue;
      seen.set(c.assignee_id ?? "unassigned", c.assignee_name ?? "Unassigned");
    }
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [boards, team, data.cards]);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name])), [data.sprints]);
  const epicById = useMemo(() => new Map(data.epics.map((e) => [e.id, e])), [data.epics]);

  // Adding a card, like every other board (W.92.8): a foot at the bottom of a
  // panel's Not done or Next sprint column, and the same drawer ("shelf")
  // behind Shift+Enter for the card that needs an owner and a date. The same
  // drawer opens a card on a click and the card's menu archives it (W.115).
  const { form, setForm, save, archive, close, drafts, saving, run, quickAdd, openDrawer, moveLaneFromDrawer, openPlanningCard, archiveFromMenu } =
    useSprintPlanningAddCard({ data, setBanner, router });
  const activeCard = form?.id ? data.cards.find((c) => c.id === form.id) ?? null : null;
  const activeBoard = activeCard ? data.boards.find((b) => b.id === activeCard.board_id) : undefined;

  const serverPlacement = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const pb of boards) {
      for (const c of data.cards) {
        if (c.board_id !== pb.board.id) continue;
        const col = planningColumn(c, pb, since, until);
        if (col) out[c.id] = col;
      }
    }
    return out;
  }, [boards, data.cards, since, until]);
  const [placement, setPlacement, { pending, run: syncedRun }] = useServerSyncedState(serverPlacement);

  const cards: Card[] = useMemo(() => {
    const pbById = new Map(inView.map((pb) => [pb.board.id, pb]));
    return data.cards
      .filter((c) => placement[c.id] && pbById.has(c.board_id ?? "") && (assigneeFilter.length === 0 || assigneeFilter.includes(c.assignee_id ?? "unassigned")))
      .map((c) => ({ ...c, columnId: placement[c.id], pb: pbById.get(c.board_id ?? "")! }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [data.cards, inView, placement, assigneeFilter]);

  // `onLanded` runs only once the write has held: a refused or failed move
  // never calls it (W.133), which is what the late-date offer waits for.
  function move(cardId: string, to: string, onLanded?: () => void) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const { board, next } = card.pb;
    // A locked sprint's commitments change only after an explicit Unlock
    // (SW-01). Since W.19 the panel refuses the gesture instead of letting it
    // land and then springing the card back: the arrows and checkboxes are not
    // offered, and neither lane accepts a drop, so nothing reaches this line.
    // It stays as a backstop, because a silent no-op here would be worse than
    // a sentence that says where Unlock is.
    if (next?.locked_at && (to === "next" || card.columnId === "next")) {
      return setBanner(`${next.name} is locked. Unlock it above to change what is committed.`);
    }
    // Reopening a card is a decision, not a leftward drag (W.20): the Done
    // strip's cards are not draggable, so this is the same kind of backstop.
    if (card.columnId === "done" && to !== "done") {
      return setBanner("Reopen this card from its drawer: click the card.");
    }
    // A thunk, not a started promise: `syncedRun` marks the write in flight before
    // it runs, and a promise created here would already be racing.
    let write: () => Promise<{ ok: true } | { ok: false; error: string }>;
    if (to === "next") {
      if (!next) return setBanner(`${board.name} has no next sprint yet; the Monday routine opens one.`);
      write = () => setCardSprint(cardId, next.id, board.slug);
    } else if (to === "done") {
      const col = board.columns.find((c) => c.is_done);
      if (!col) return setBanner(`${board.name} has no done column.`);
      write = () => moveCardColumn(cardId, col.id, board.slug);
    } else {
      write = () => setCardSprint(cardId, null, board.slug);
    }
    setPlacement((p) => ({ ...p, [cardId]: to }));
    setBanner(null);
    void syncedRun(write, {
      onError: (message) => setBanner(`Couldn't move card: ${message}`),
      onOk: onLanded,
    });
  }

  return (
    <>
      <div className="admin-toolbar u-mb-3">
        {teams.length > 1 && (
          <select className="admin-select admin-input--w-sm" value={team} onChange={(e) => { setTeam(e.target.value as SprintChat); setClientFilter([]); setAssigneeFilter([]); }} aria-label="Team">
            {teams.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        )}
        {clients.length > 1 && <MultiSelect label="Filter by client" noun="clients" options={clients} value={clientFilter} onChange={setClientFilter} />}
        {assignees.length > 1 && <MultiSelect label="Filter by assignee" noun="assignees" options={assignees} value={assigneeFilter} onChange={setAssigneeFilter} />}
        {weeks.length > 0 && (
          <select className="admin-select admin-input--w-sm" value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Sprint week">
            {weeks.map((w, i) => {
              const win = weekWindow(w);
              return (
                <option key={w} value={w}>
                  {weekShort(w)}
                  {win ? ` · ${formatDate(win.startsOn)} to ${formatDate(win.endsOn)}` : ""}
                  {i === 0 ? " (this week)" : ""}
                </option>
              );
            })}
          </select>
        )}
        <span className="admin-cell-muted u-sm u-ml-auto">{until ? `Done ${formatDate(since)} to ${formatDate(addDays(until, -1))}` : `Done since ${formatDate(since)}`}</span>
      </div>
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      <SprintPlanningPanels
        boards={inView}
        cards={cards}
        sprintName={sprintName}
        epicById={epicById}
        carriedSprints={carriedSprints}
        section={section}
        canEdit={canEdit}
        pending={pending > 0 || saving}
        move={move}
        saving={saving}
        quickAdd={quickAdd}
        openDrawer={openDrawer}
        // A past week is read back, not planned (SW-01): its sprint may be
        // closed, and a card filed into it would show nowhere.
        canAdd={!chosenWeek}
        onOpenCard={openPlanningCard}
        onArchiveCard={archiveFromMenu}
      />
      <CardDrawer
        form={form}
        setForm={setForm}
        data={data}
        activeCard={activeCard}
        lanes={data.lanes}
        // The card's own lane, not its planning column (W.115).
        currentLaneId={activeCard?.laneId}
        viewerPersonId={viewerPersonId}
        readOnly={!canEdit}
        shareUrl={activeCard && activeBoard ? `${section}/boards/${activeBoard.slug}?card=${cardSlug(activeCard.title, activeCard.id)}` : null}
        boardHref={activeBoard && canEdit ? `${section}/boards/${activeBoard.slug}` : null}
        saving={saving}
        run={run}
        onMoveLane={moveLaneFromDrawer}
        onOpenCard={(taskId) => {
          const target = data.cards.find((c) => c.id === taskId);
          if (target) openPlanningCard(target);
        }}
        onSave={save}
        onArchive={archive}
        onClose={close}
        error={banner}
        drafts={drafts}
      />
    </>
  );
}
