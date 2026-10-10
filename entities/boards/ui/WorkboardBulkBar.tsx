"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { archiveCard, updateCard } from "@/entities/boards/lib/actions";
import { setCardEpic } from "@/entities/boards/lib/epic-actions";
import { snoozeCard } from "@/entities/boards/lib/snooze-actions";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { bulkMessage, runBulk, type BulkOutcome } from "./run-bulk";

// The board's action bar for a selection (W.70, decided 2026-09-21).
//
// Four verbs and no more: snooze, epic, assignee, archive. They are the four
// people do to ten cards at once on a Tuesday. Sprint assignment is
// deliberately NOT here — it is the weekly bulk operation and it belongs on
// the planning page where the week's shape is visible (Q4, 2026-09-17, which
// this does not reopen). Moving a column in bulk is not here either: a column
// move means something per card and a drag already says it one card at a time.
//
// Each verb runs the ordinary per-card action once per card (run-bulk.ts says
// why), so every card keeps its own guard and its own rules, and what could
// not be applied is said rather than swallowed.
export function WorkboardBulkBar({
  cards,
  ids,
  data,
  disabled,
  onClear,
  onBanner,
}: {
  /** The cards on screen, so a selected id can be resolved to its board slug. */
  cards: Card[];
  ids: string[];
  data: WorkboardData;
  disabled: boolean;
  onClear: () => void;
  onBanner: (message: string | null) => void;
}) {
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  // Each card that landed revalidated and came back with the board re-rendered,
  // and a refused one changed nothing, so neither needs a refresh (A.33). A
  // request that was never answered may have landed with its response lost,
  // and only then is the board asked again.
  const settle = (outcome: BulkOutcome) => {
    if (outcome.unanswered > 0) router.refresh();
  };
  const byId = new Map(cards.map((c) => [c.id, c]));
  const boardSlug = new Map(data.boards.map((b) => [b.id, b.slug]));
  const slugOf = (id: string) => boardSlug.get(byId.get(id)?.board_id ?? "") ?? "";
  // Epics are board-scoped (W.41), so offering an epic across a selection that
  // spans boards would offer a choice most of the cards must refuse. The
  // picker appears only when every selected card is on one board.
  const boardIds = [...new Set(ids.map((id) => byId.get(id)?.board_id ?? ""))];
  const oneBoard = boardIds.length === 1 ? boardIds[0] : null;
  const epics = oneBoard ? data.epics.filter((e) => e.status === "active" && e.board_id === oneBoard) : [];

  async function apply(verb: string, write: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    onBanner(null);
    const outcome = await runBulk(ids, write);
    settle(outcome);
    setBusy(false);
    onBanner(bulkMessage(outcome, verb));
    if (outcome.done > 0) onClear();
  }

  const off = disabled || busy || ids.length === 0;

  return (
    <div className="admin-board-bulk u-mb-3">
      {/* What the ticks are for, said in words. The four verbs are laid out
          as controls beside this, but a count alone ("2 selected") leaves the
          reader to infer the point of the boxes from the toolbar around
          them — which is exactly what nobody did (W.93). */}
      <span className="admin-cell-strong">{ids.length} selected</span>
      <span className="admin-cell-muted u-sm">— snooze, file under an epic, assign or archive them together</span>

      <select
        className="admin-select admin-input--w-sm"
        value=""
        disabled={off}
        aria-label="Assign selected cards"
        onChange={(e) => {
          const assigneeId = e.target.value;
          if (!assigneeId) return;
          void apply("Assigned", (id) => updateCard(id, { assigneeId: assigneeId === "unassigned" ? null : assigneeId }, slugOf(id)));
        }}
      >
        <option value="">Assign to…</option>
        <option value="unassigned">Unassigned</option>
        {data.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {epics.length > 0 && (
        <select
          className="admin-select admin-input--w-sm"
          value=""
          disabled={off}
          aria-label="Set the epic on selected cards"
          onChange={(e) => {
            const epicId = e.target.value;
            if (!epicId) return;
            void apply("Filed", (id) => setCardEpic(id, epicId === "none" ? null : epicId, slugOf(id)));
          }}
        >
          <option value="">Epic…</option>
          <option value="none">No epic</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.name}
            </option>
          ))}
        </select>
      )}

      <label className="admin-board-bulk-date">
        <span className="admin-cell-muted u-sm">Snooze until</span>
        <input className="admin-input admin-input--w-sm" type="date" value={until} disabled={off} onChange={(e) => setUntil(e.target.value)} />
      </label>
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={off || !until}
        onClick={() => void apply("Snoozed", (id) => snoozeCard(id, until, slugOf(id)))}
      >
        Snooze
      </button>

      {/* Archiving several cards at once is the one verb here that takes
          something away, so it is the one that asks first — the same
          ConfirmButton every other destructive action on these screens uses.
          The other three are all reversible in one gesture. */}
      <ConfirmButton
        label="Archive"
        className="admin-btn admin-btn--sm admin-btn--danger"
        title={`Archive ${ids.length} card${ids.length === 1 ? "" : "s"}?`}
        body={<>They leave the board and stay in Archived, where any of them can be restored.</>}
        confirmLabel="Archive"
        disabled={off}
        onConfirm={async () => {
          const outcome = await runBulk(ids, (id) => archiveCard(id, slugOf(id)));
          settle(outcome);
          const message = bulkMessage(outcome, "Archived");
          // A part-applied archive is reported through the confirm dialog's
          // own error line, so the person is told before it closes.
          if (!message) return { ok: true as const };
          // A refusal keeps the dialog open and never runs onDone, so the
          // selection of the cards that DID archive is cleared here; the
          // board itself is settled above.
          if (outcome.done > 0) onClear();
          return { ok: false as const, error: message };
        }}
        onDone={onClear}
      />

      <button type="button" className="admin-btn admin-btn--sm u-ml-auto" onClick={onClear} disabled={busy}>
        Clear
      </button>
    </div>
  );
}
