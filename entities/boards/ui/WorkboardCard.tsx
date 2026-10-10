"use client";

import type { ReactNode } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { saigonToday } from "@/kernel/config/dates";
import { NEW_ASSIGNMENT_DAYS, PRIORITY_LABEL, assignedAt, epicColorIndex } from "@/entities/boards/lib/types";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { cardFacts } from "@/entities/boards/lib/card-facts";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import type { CardQuickActions } from "./useWorkboardCardActions";
import { WorkboardQuickAssignee } from "./WorkboardQuickAssignee";
import { WorkboardQuickDue } from "./WorkboardQuickDue";
import { FaceAvatar } from "./FaceAvatar";
import { faceDate, isClosedCard } from "./card-face";
import { WorkboardCardChips, cardChips } from "./WorkboardCardChips";
import { CardEdge } from "./WorkboardCardEdge";

// The one card design every workboard surface renders (WB-01). Where a chip
// does not apply it is simply absent; no surface gets a different layout.
//
// Colour follows the hierarchy in docs/engineering/admin-consistency-playbook.md
// (W.48): the lane accent belongs to the column, the card's left edge carries
// the one categorical axis that means something in this scope, priority is
// weight and position rather than hue, everything else is text, and
// --admin-err / --admin-warn are reserved, ON A CARD, for overdue, blocked
// and aging. The reservation stops at the card's edge: a column accent may
// be amber (the Waiting lane is), because a header labels a place while a
// chip judges an item — playbook, "Rule 5's scope".
export function isNewForViewer(c: Card, viewerPersonId: string | null | undefined): boolean {
  if (!viewerPersonId || c.assignee_id !== viewerPersonId || c.status !== "open") return false;
  return Date.now() - new Date(assignedAt(c)).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
}

export function WorkboardCard({
  card: c,
  board,
  showBoard,
  viewerPersonId,
  sprintFilter,
  sprintName,
  epicById,
  hideInternal = false,
  hideClient = false,
  hideSprint = false,
  subtaskControl,
  quick,
}: {
  card: Card;
  board: WorkboardBoard | undefined;
  // Many boards in scope: the card says which board and client it is on.
  showBoard: boolean;
  viewerPersonId: string | null | undefined;
  sprintFilter: string;
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  // Every card in scope is internal, so the chip says nothing (playbook,
  // colour hierarchy, last consequence). The board computes it once.
  hideInternal?: boolean;
  // One client is in view, so naming it on every card says nothing either.
  hideClient?: boolean;
  // The surface names the card's sprint in its own words — sprint planning
  // says "Carried from Sprint 11", the same fact with the reason attached — so
  // the chip would say it twice.
  hideSprint?: boolean;
  /**
   * The surface's own subtask control, drawn in the count's place in the facts
   * row: the Workboard's kanban passes a chevron that expands the subtasks
   * under the card (W.92.7, W.114). Every other surface keeps the plain count,
   * because none of them has anywhere to expand into.
   */
  subtaskControl?: ReactNode;
  /**
   * The card's two in-place edits (W.30): assignee and due date. Absent on
   * every surface that does not pass it — sprint planning, My Week, the
   * portal — and those render exactly the read-only row they always did.
   */
  quick?: CardQuickActions;
}) {
  // The card's facts come from one module (A.29.1), so the board, the list,
  // the calendar, My Week and the drawer cannot disagree about them.
  const facts = cardFacts(c, { today: saigonToday(), viewerPersonId, board });
  const { overdue, openBlockers } = facts;
  const { days, aging } = facts.aging;
  const epic = c.epic_id ? epicById.get(c.epic_id) : undefined;
  const boardHasEpics = !epic && [...epicById.values()].some((e) => e.board_id === c.board_id);
  // Done and Not Doing are both history (bug hunt F14): a card set aside used
  // to keep its priority, its size and the date edit, as if it were still owed.
  const closed = isClosedCard(c);
  const date = faceDate(c, overdue);
  // Across boards the card names its client ONCE, as a quiet pill at the end
  // of the meta line (W.107). The board name is in the drawer.
  const showsClient = showBoard && !hideClient;
  return (
    <>
      <CardEdge epic={epic} board={board} showBoard={showBoard} />
      {/* The epic, as the approved canvas draws it (W.160): its colour square
          and its name over the title. The square repeats the edge's colour on
          a single board, and that is the point — the edge is a stripe nobody
          can name, the square sits beside the word that names it. A board
          with no epics at all draws no line, because "No epic" on every card
          would distinguish none of them (W.142). The card's OWN board decides:
          on an all-boards view the map holds every board's epics, and asking
          only whether it was empty labelled every Revenue card (bug hunt U2). */}
      {(epic || boardHasEpics) && (
        <div className="wb-face-epic" title={epic ? `Epic: ${epic.name}` : undefined}>
          {epic ? (
            <span className="wb-face-epic-mark" data-epic-color={epicColorIndex(epic.color)} aria-hidden />
          ) : (
            <span className="wb-face-epic-mark is-none" aria-hidden />
          )}
          <span className="wb-face-epic-name">{epic?.name ?? "No epic"}</span>
        </div>
      )}
      {/* A closed card's title steps back to the muted ink: it is history. */}
      <div className={`admin-kanban-card-title admin-kanban-card-title--clamp wb-face-title${closed ? " is-done" : ""}`}>{c.title}</div>
      {/* The states, capped at two plus a "+N" (W.92.3); blocked and aging
          never fold (WorkboardCardChips). A card with none has no row. */}
      <WorkboardCardChips
        {...cardChips(c, {
          board,
          showBoard,
          isNew: isNewForViewer(c, viewerPersonId),
          openBlockers,
          agingDays: aging ? days : null,
          sprintFilter,
          sprintName,
          hideInternal,
          hideClient,
          hideSprint,
        })}
      />
      {/* ONE meta line, which never wraps (W.160, the canvas): the date, the
          priority, the Human Tokens, the subtasks, then the client and the
          avatar at the far end. Comments, the cards waiting on this one and
          the build summary left the face (Khoa, 2026-10-05): each is in the
          drawer, and the face is for scanning a lane. A closed card keeps
          what happened to it and its people; priority and size are past. The
          same facts on every surface (WB-01): one that can edit the date and
          the assignee gets controls in the place the text was. */}
      <div className="wb-face-meta">
        {quick && !closed ? (
          <span className="wb-face-quick" onClick={(e) => e.stopPropagation()}>
            <WorkboardQuickDue
              dueDate={c.due_date}
              overdue={overdue}
              saving={quick.saving}
              onDueDate={(d) => quick.onDueDate(c.id, d)}
              label={date?.text ?? null}
            />
          </span>
        ) : (
          date && <span className={`wb-face-date is-${date.kind}`}>{date.text}</span>
        )}
        {!closed && (
          <span className={`wb-face-pri${facts.highPriority ? " is-high" : ""}`}>{PRIORITY_LABEL[c.priority]}</span>
        )}
        {/* On the 0.05 grid 1.25 HT is a real estimate, so the figure keeps
            its decimals rather than reporting a different piece of work. */}
        {!closed && c.human_tokens != null && <span className="wb-face-fact">{formatTokens(c.human_tokens)} HT</span>}
        {subtaskControl ??
          (facts.subtasks.total > 0 && (
            <span className="wb-face-fact" title="Subtasks done">
              <Icon name="checklist" /> {facts.subtasks.done}/{facts.subtasks.total}
            </span>
          ))}
        {/* What the work produced (W.158): team surfaces only, and only when
            there is something, as the canvas draws it. */}
        {(c.deliverable_count ?? 0) > 0 && (
          <span className="wb-face-fact" title={`${c.deliverable_count} deliverable${c.deliverable_count === 1 ? "" : "s"}`}>
            <Icon name="paperclip" /> {c.deliverable_count}
          </span>
        )}
        {/* A conversation on the card (W.180, from Derek's spark): without it a
            card with comments looked exactly like one with none. */}
        {c.comments.length > 0 && (
          <span className="wb-face-fact" title={`${c.comments.length} comment${c.comments.length === 1 ? "" : "s"}`}>
            <Icon name="comment" /> {c.comments.length}
          </span>
        )}
        <span className="wb-face-end">
          {showsClient && <span className="wb-facts-client" title={`Client: ${facts.clientLabel}`}>{facts.clientLabel}</span>}
          {quick ? (
            <span className="wb-face-quick" onClick={(e) => e.stopPropagation()}>
              <WorkboardQuickAssignee
                assigneeId={c.assignee_id}
                assigneeName={c.assignee_name}
                people={quick.people}
                saving={quick.saving}
                onAssignee={(personId) => quick.onAssignee(c.id, personId)}
                avatarOnly
              />
            </span>
          ) : (
            <span className="wb-face-assignee" title={c.assignee_name ?? "Unassigned"}>
              <FaceAvatar name={c.assignee_name} />
              <span className="u-sr-only">{c.assignee_name ? `Assigned to ${c.assignee_name}` : "Unassigned"}</span>
            </span>
          )}
        </span>
      </div>
    </>
  );
}
