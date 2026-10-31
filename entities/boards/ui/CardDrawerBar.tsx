"use client";

import { Icon } from "@/kernel/ui/Icon";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { PRIORITY_LABEL, TASK_PRIORITIES, initials, type TaskPriority } from "@/entities/boards/lib/types";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardLane } from "@/entities/boards/lib/workboard";
import type { Form } from "./board-view-types";
import { CardPillPicker, PillOption } from "./CardPillPicker";
import { chipDate, firstName } from "./card-chips";
import { ChipInputPanel } from "./ChipInputPanel";

/**
 * The drawer's pinned line (W.92.6), drawn as the approved canvas draws it
 * (W.159): five unlabelled chips — status, assignee, due date, priority, Human
 * Tokens — each opening a small picker, with an accessible name that says what
 * it is and what pressing it does. They are the facts somebody changes without
 * reading the card, pinned whatever the body is scrolled to. Choosing changes
 * the form; Save writes it (Khoa, 2026-10-05). Read-only draws them as text.
 * Priority and Human Tokens are a pair, one cell of the phone's 2×2 grid.
 */
export function CardDrawerBar({
  form,
  setForm,
  lanes,
  currentLaneId,
  people,
  currentAssigneeName,
  derivedTokens,
  readOnly,
  onMoveLane,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  lanes: WorkboardLane[];
  /** The optimistic lane of the open card, when a move is in flight. */
  currentLaneId?: string;
  people: BoardPerson[];
  /** The card's current assignee, so an off-list person keeps a label. */
  currentAssigneeName: string | null;
  /** A card with sized subtasks is worth their sum; the chip shows it and refuses typing. */
  derivedTokens: number | null;
  readOnly: boolean;
  onMoveLane: (cardId: string, laneId: string) => void;
}) {
  const laneId = currentLaneId ?? form.laneId;
  const laneName = lanes.find((l) => l.id === laneId)?.name ?? "To do";
  const assigneeName = form.assigneeId
    ? people.find((p) => p.id === form.assigneeId)?.name ?? currentAssigneeName ?? "Assignee"
    : null;
  const isDerived = derivedTokens !== null;
  const tokens = isDerived ? formatTokens(derivedTokens) : form.humanTokens.trim();

  const status = <span className="wb-pill-text">{laneName}</span>;
  const caretMark = (
    <span className="wb-pill-caret" aria-hidden>
      <Icon name="caret" />
    </span>
  );
  const assignee = assigneeName ? (
    <>
      <span className="wb-chip-avatar" aria-hidden>{initials(assigneeName)}</span>
      <span className="wb-pill-text">{firstName(assigneeName)}</span>
    </>
  ) : (
    <>
      <span className="wb-chip-avatar is-empty" aria-hidden />
      Assignee
    </>
  );
  const due = (
    <>
      <Icon name="calendar" />
      {form.dueDate ? chipDate(form.dueDate) : "Due date"}
    </>
  );
  const priority = (
    <>
      <span className="wb-chip-priority" data-priority={form.priority} aria-hidden />
      {PRIORITY_LABEL[form.priority]}
    </>
  );
  const ht = tokens ? (
    <>
      {tokens} HT{isDerived && <span className="wb-chip-muted"> · sum</span>}
    </>
  ) : (
    "HT"
  );

  if (readOnly) {
    return (
      <div className="wb-drawer-bar" role="group" aria-label="Status, assignee, due date, priority and Human Tokens">
        <span className="wb-pill is-static wb-chip-status">{status}</span>
        <span className={`wb-pill is-static${assigneeName ? "" : " is-empty"}`}>{assignee}</span>
        <span className={`wb-pill is-static${form.dueDate ? "" : " is-empty"}`}>{due}</span>
        <span className="wb-chip-pair">
          <span className="wb-pill is-static">{priority}</span>
          <span className={`wb-pill is-static${tokens ? "" : " is-empty"}`}>{ht}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="wb-drawer-bar" role="group" aria-label="Status, assignee, due date, priority and Human Tokens">
      {/* A new card has no column to move between: it is filed into the lane
          the drawer was opened from, and a picker here would promise a move
          that createCard does not make. It still says where it will land. */}
      {form.id ? (
        <CardPillPicker label={status} empty={false} caret className="wb-chip-status" ariaLabel={`Status: ${laneName}. Move it`} panelLabel="Move the card">
          {(close) => (
            <div className="wb-pill-options">
              {lanes.map((l) => (
                <PillOption
                  key={l.id}
                  current={l.id === laneId}
                  onChoose={() => {
                    if (l.id !== laneId) onMoveLane(form.id!, l.id);
                    close();
                  }}
                >
                  <span className="wb-pill-option-name">{l.name}</span>
                </PillOption>
              ))}
            </div>
          )}
        </CardPillPicker>
      ) : (
        <span className="wb-pill is-static wb-chip-status">
          {status}
          {caretMark}
        </span>
      )}

      <CardPillPicker
        label={assignee}
        empty={!assigneeName}
        caret={false}
        ariaLabel={assigneeName ? `Assignee: ${assigneeName}. Change it` : "Assignee: nobody. Choose someone"}
        panelLabel="Choose who has the card"
      >
        {(close) => (
          <div className="wb-pill-options">
            {/* The Team list is staff only, so an assignee from outside it
                would otherwise vanish from the list and read as nobody. */}
            {form.assigneeId && !people.some((p) => p.id === form.assigneeId) && (
              <PillOption current onChoose={close}>
                <span className="wb-pill-option-name">{currentAssigneeName ?? "Current assignee"}</span>
              </PillOption>
            )}
            {people.map((p) => (
              <PillOption
                key={p.id}
                current={p.id === form.assigneeId}
                onChoose={() => {
                  setForm({ ...form, assigneeId: p.id });
                  close();
                }}
              >
                <span className="wb-chip-avatar" aria-hidden>{initials(p.name)}</span>
                <span className="wb-pill-option-name">{p.name}</span>
              </PillOption>
            ))}
            <div className="wb-pill-foot">
              <PillOption
                current={!form.assigneeId}
                onChoose={() => {
                  setForm({ ...form, assigneeId: "" });
                  close();
                }}
              >
                <span className="wb-pill-option-name">Unassigned</span>
              </PillOption>
            </div>
          </div>
        )}
      </CardPillPicker>

      <CardPillPicker
        label={due}
        empty={!form.dueDate}
        caret={false}
        ariaLabel={form.dueDate ? `Due ${chipDate(form.dueDate)}. Change it` : "Due date: none. Set one"}
        panelLabel="Due date"
      >
        {(close) => (
          <ChipInputPanel
            type="date"
            label="Due date"
            value={form.dueDate}
            onChange={(dueDate) => setForm({ ...form, dueDate })}
            close={close}
            clearLabel="No due date"
            onClear={() => setForm({ ...form, dueDate: "" })}
          />
        )}
      </CardPillPicker>

      <span className="wb-chip-pair">
        <CardPillPicker label={priority} empty={false} caret={false} ariaLabel={`Priority ${PRIORITY_LABEL[form.priority]}. Change it`} panelLabel="Priority">
          {(close) => (
            <div className="wb-pill-options">
              {TASK_PRIORITIES.map((p: TaskPriority) => (
                <PillOption
                  key={p}
                  current={p === form.priority}
                  onChoose={() => {
                    setForm({ ...form, priority: p });
                    close();
                  }}
                >
                  <span className="wb-chip-priority" data-priority={p} aria-hidden />
                  <span className="wb-pill-option-name">{PRIORITY_LABEL[p]}</span>
                </PillOption>
              ))}
            </div>
          )}
        </CardPillPicker>

        {/* A card with sized subtasks is their sum: the chip says so and opens
            nothing, because the figure is derived, never typed. */}
        {isDerived ? (
          <span className="wb-pill is-static" title="Size the subtasks; the card is their sum.">
            {ht}
          </span>
        ) : (
          <CardPillPicker
            label={ht}
            empty={!tokens}
            caret={false}
            ariaLabel={tokens ? `Human Tokens: ${tokens}. Change it` : "Human Tokens: none. Size the card"}
            panelLabel="Human Tokens"
          >
            {(close) => (
              <ChipInputPanel
                type="number"
                label="Human Tokens"
                value={form.humanTokens}
                onChange={(humanTokens) => setForm({ ...form, humanTokens })}
                close={close}
              />
            )}
          </CardPillPicker>
        )}
      </span>
    </div>
  );
}
