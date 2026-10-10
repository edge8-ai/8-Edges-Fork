"use client";

import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { EditableText } from "@/kernel/ui/InlineEdit";
import { updateSprintBrief } from "@/entities/boards/lib/sprint-actions";
import { deleteSprint, renameSprint, unlockSprint } from "@/entities/boards/lib/sprint-settings";
import { weekShort } from "@/entities/boards/lib/sprint-cadence";
import { formatTokens } from "@/entities/boards/lib/tokens";
import type { SprintCommitment } from "@/entities/boards/lib/sprint-commitment";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { clientLabel } from "@/entities/boards/lib/card-facts";

// The heading of one board's planning panel (W.17). The sprint's name and its
// goal for the week used to be two inputs in a strip of rows above three
// shared columns, one row per board, so the thing being decided about was
// never in one place. Here they are the heading of the panel that holds the
// board's own cards, editable in place rather than as form fields, with the
// week's fit (W.21) and the lock on the same line.
//
// Finish planning locks every next sprint in view (SW-01): a locked panel
// shows the lock, its name and goal go read-only, and Unlock brings them back
// when the week has to change after all. A next sprint with nothing in it can
// be deleted from here, for the ones the routine opened by mistake.
export function SprintPlanningHeading({
  pb,
  section,
  canEdit,
  busy,
  commitment,
}: {
  pb: PlanningBoard;
  section: string;
  canEdit: boolean;
  busy: boolean;
  commitment: SprintCommitment;
}) {
  const { board, next } = pb;
  const committed = commitment.cards;
  const isLocked = !!next?.locked_at;
  const frozen = !canEdit || busy || isLocked;
  return (
    <div className="admin-sprint-panel-head">
      <div className="admin-sprint-panel-line">
        <span className="admin-cell-strong">
          {clientLabel(board)}
          <span className="admin-cell-muted"> · {board.name}</span>
        </span>
        {next ? (
          <>
            {next.week && <Badge tone="neutral">{weekShort(next.week)}</Badge>}
            {frozen ? (
              <span className="admin-sprint-panel-name">{next.name}</span>
            ) : (
              <span className="admin-sprint-panel-name">
                <EditableText value={next.name} ariaLabel="Sprint name" onSave={(v) => renameSprint(next.id, v, board.slug)} />
              </span>
            )}
            {/* What this board is committing, and the one thing the meeting
                can act on before the week starts: the committed cards nobody
                has sized. The comparison against last week's throughput was
                removed in W.98 — half the committed cards were unsized so the
                sum was wrong, and a rate is a forecast, which Human Tokens
                are not. The sum appears only when every card carries an
                estimate; the room reads it and decides, which is cooperation
                rather than enforcement. */}
            <span className="admin-cell-muted u-sm u-ml-auto">
              {committed === 0 ? (
                "Nothing committed yet"
              ) : (
                <>
                  Committing {committed} {committed === 1 ? "card" : "cards"}
                  {commitment.tokens !== null && ` · ${formatTokens(commitment.tokens)} HT`}
                  {commitment.unsized > 0 && ` · ${commitment.unsized} not sized`}
                </>
              )}
            </span>
            {isLocked && <Badge tone="ok">Locked</Badge>}
            {isLocked && canEdit && (
              <ConfirmButton
                label="Unlock"
                className="admin-btn admin-btn--sm"
                title="Unlock this sprint?"
                body={<>The name, goal and card commitments of {next.name} become editable again. Lock it by finishing planning once more.</>}
                confirmLabel="Unlock"
                disabled={busy}
                onConfirm={() => unlockSprint(next.id, board.slug)}
              />
            )}
            {!isLocked && canEdit && committed === 0 && (
              <ConfirmButton
                label="Delete"
                className="admin-btn admin-btn--sm admin-btn--danger"
                title="Delete this sprint?"
                body={<>{next.name} has no cards and goes for good. The Monday routine can open a new one.</>}
                confirmLabel="Delete sprint"
                disabled={busy}
                onConfirm={() => deleteSprint(next.id, board.slug)}
              />
            )}
            <Link className="admin-btn admin-btn--sm" href={`${section}/boards/${board.slug}/sprints/${next.id}`}>
              Open sprint
            </Link>
          </>
        ) : (
          <span className="admin-cell-muted">No sprint this week; the Monday routine opens one.</span>
        )}
      </div>
      {next &&
        (frozen ? (
          next.goal && <p className="admin-sprint-panel-goal u-m-0">{next.goal}</p>
        ) : (
          <div className="admin-sprint-panel-goal">
            <EditableText
              value={next.goal ?? ""}
              ariaLabel="Sprint goal"
              placeholder="Goal for the week"
              onSave={(v) => updateSprintBrief(next.id, { goal: v }, board.slug)}
            />
          </div>
        ))}
    </div>
  );
}
