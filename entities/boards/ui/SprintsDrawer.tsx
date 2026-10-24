"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { closeSprint, createSprint } from "@/entities/boards/lib/sprint-actions";
import { deleteSprint } from "@/entities/boards/lib/sprint-settings";
import { weekShort } from "@/entities/boards/lib/sprint-cadence";
import type { RunAction } from "./board-view-types";

// The board's sprint list: create one, close one (rolling its open cards into
// a target sprint), delete one that holds no cards (SW-01), and link into each
// sprint's page. Split out of BoardView (Q3); it owns the create form and the
// roll-over targets.
export function SprintsDrawer({
  open,
  onClose,
  boardId,
  slug,
  boardBase,
  sprints,
  activeSprints,
  cardCounts,
  saving,
  run,
  onError,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  slug: string;
  boardBase: string;
  sprints: BoardDetail["sprints"];
  activeSprints: BoardDetail["sprints"];
  // Cards per sprint id, any status: a sprint with cards cannot be deleted.
  cardCounts: Map<string, number>;
  saving: boolean;
  run: RunAction;
  onError: (message: string) => void;
  /** The board drops a sprint filter that pointed at the sprint just closed. */
  onClosed: (sprintId: string) => void;
}) {
  const [sprintForm, setSprintForm] = useState({ name: "", startsOn: "", endsOn: "", goal: "" });
  const [rollTarget, setRollTarget] = useState<Record<string, string>>({});

  function addSprint() {
    if (!sprintForm.name.trim()) return onError("Name the sprint.");
    run(
      () =>
        createSprint(
          boardId,
          {
            name: sprintForm.name,
            startsOn: sprintForm.startsOn || undefined,
            endsOn: sprintForm.endsOn || undefined,
            goal: sprintForm.goal || undefined,
          },
          slug,
        ),
      () => setSprintForm({ name: "", startsOn: "", endsOn: "", goal: "" }),
    );
  }

  function closeOne(sprintId: string) {
    run(() => closeSprint(sprintId, rollTarget[sprintId] || null, slug), () => onClosed(sprintId));
  }

  return (
    <DetailDrawer open={open} onClose={onClose} eyebrow="Board" title="Sprints">
      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label">New sprint</label>
          <input
            className="admin-input"
            placeholder="Name (e.g. Aug 18-29)"
            value={sprintForm.name}
            onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
          />
        </div>
        <div className="admin-field u-stack">
          <div className="u-grow">
            <label className="admin-label">Starts</label>
            <input
              className="admin-input"
              type="date"
              value={sprintForm.startsOn}
              onChange={(e) => setSprintForm({ ...sprintForm, startsOn: e.target.value })}
            />
          </div>
          <div className="u-grow">
            <label className="admin-label">Ends</label>
            <input
              className="admin-input"
              type="date"
              value={sprintForm.endsOn}
              onChange={(e) => setSprintForm({ ...sprintForm, endsOn: e.target.value })}
            />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Goal (optional)</label>
          <input
            className="admin-input"
            value={sprintForm.goal}
            onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })}
          />
        </div>
        <div className="admin-form-actions">
          <button className="admin-btn admin-btn--primary" onClick={addSprint} disabled={saving}>
            Add sprint
          </button>
        </div>

        {sprints.length > 0 && (
          <div className="u-mt-4">
            <label className="admin-label">Existing</label>
            {sprints.map((s) => (
              <div key={s.id} className="admin-row-divided u-wrap">
                <Link className="admin-cell-strong" href={`${boardBase}/sprints/${s.id}`}>
                  {s.name}
                </Link>
                {s.week && <Badge tone="neutral">{weekShort(s.week)}</Badge>}
                <Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</Badge>
                {(cardCounts.get(s.id) ?? 0) === 0 && (
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title="Delete this sprint?"
                    body={<>{s.name} has no cards and goes for good.</>}
                    confirmLabel="Delete sprint"
                    disabled={saving}
                    onConfirm={() => deleteSprint(s.id, slug)}
                  />
                )}
                {s.status === "active" && (
                  <div className="u-row u-ml-auto">
                    <select
                      className="admin-select admin-input--w-sm"
                      value={rollTarget[s.id] ?? ""}
                      onChange={(e) => setRollTarget({ ...rollTarget, [s.id]: e.target.value })}
                      aria-label="Roll unfinished to"
                    >
                      <option value="">Roll to backlog</option>
                      {activeSprints
                        .filter((o) => o.id !== s.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            Roll to {o.name}
                          </option>
                        ))}
                    </select>
                    <button className="admin-btn admin-btn--sm" onClick={() => closeOne(s.id)} disabled={saving}>
                      Close
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailDrawer>

  );
}
