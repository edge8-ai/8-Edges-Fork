"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { showToast } from "@/kernel/ui/Toast";
import { assignMarks, type ValueRow } from "@/entities/org/lib/core-values";
import { CoreValuesHero, ValueTile } from "@/entities/org/ui/company/CoreValuesBento";
import { createValue, deleteValue, reorderValues, updateValue, type ValueDraft } from "./actions";
import { ValueForm } from "./ValueForm";

// The Core Values editor is the team page itself with controls on each tile:
// a drag handle that also moves with the arrow keys (44px ↑/↓ buttons on a
// phone), Edit, which opens the form inside the tile, and Delete. The whole
// order saves at once. While one edit is open the other controls wait, so an
// unsaved edit is never silently thrown away.

type Editing = { kind: "value"; id: string } | { kind: "new" } | null;

const LOCKED = "Save or cancel the open edit first";

function Handle() {
  return (
    <svg viewBox="0 0 12 16" aria-hidden="true">
      {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="3" cy={y} r="1.6" />, <circle key={`b${y}`} cx="9" cy={y} r="1.6" />])}
    </svg>
  );
}

export function ValuesEditor({ values }: { values: ValueRow[] }) {
  const router = useRouter();
  // A saved order is shown at once and belongs to the rows it was made
  // against; once the refresh brings new rows, the server's order wins.
  const [order, setOrder] = useState<{ base: ValueRow[]; ids: string[] } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = new Map(values.map((v) => [v.id, v]));
  const ids = order && order.base === values ? order.ids : values.map((v) => v.id);
  const list = ids.map((id) => byId.get(id)).filter((v): v is ValueRow => Boolean(v));
  const marks = assignMarks(list);
  const locked = editing !== null || busy;
  // A timer rather than requestAnimationFrame: it runs after React commits the
  // re-render, and still runs in a tab that is not painting.
  const focusLater = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);

  async function saveOrder(next: string[], focusId: string) {
    setOrder({ base: values, ids: next });
    setBusy(true);
    const res = await reorderValues(next);
    setBusy(false);
    if (!res.ok) {
      setOrder(null);
      showToast({ message: res.error });
    } else {
      showToast({ message: "Order saved. The team page shows it now." });
      router.refresh();
    }
    focusLater(focusId);
  }

  function move(id: string, delta: number, focusId: string) {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (locked || i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    void saveOrder(next, focusId);
  }

  function drop(targetId: string) {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (!from || from === targetId || locked) return;
    const next = ids.filter((x) => x !== from);
    next.splice(ids.indexOf(targetId), 0, from);
    void saveOrder(next, `admin-cv-handle-${from}`);
  }

  function onHandleKey(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    move(id, delta, `admin-cv-handle-${id}`);
  }

  async function save(draft: ValueDraft) {
    const current = editing;
    const res = current?.kind === "value" ? await updateValue(current.id, draft) : await createValue(draft);
    if (!res.ok) return res;
    setEditing(null);
    showToast({ message: current?.kind === "value" ? "Saved. The team page shows it now." : "Value added. The team page shows it now." });
    router.refresh();
    focusLater(current?.kind === "value" ? `admin-cv-edit-${current.id}` : "admin-cv-add");
    return res;
  }

  function cancel() {
    const current = editing;
    setEditing(null);
    focusLater(current?.kind === "value" ? `admin-cv-edit-${current.id}` : "admin-cv-add");
  }

  return (
    <>
      <CoreValuesHero values={list} marks={marks} />
      <ol className="admin-cv-grid" aria-label="Core values, in the order the team sees them">
        {list.map((v, i) => {
          const mark = marks.get(v.id) ?? "spark";
          const isEditing = editing?.kind === "value" && editing.id === v.id;
          const cls = ["is-editable", isEditing ? "is-editing" : "", dragId === v.id ? "is-dragging" : "", overId === v.id ? "is-over" : ""].filter(Boolean).join(" ");
          return (
            <ValueTile
              key={v.id}
              value={v}
              index={i}
              count={list.length}
              mark={mark}
              className={cls}
              body={isEditing ? <ValueForm initial={{ title: v.title, description: v.description }} isNew={false} onCancel={cancel} onSave={save} /> : undefined}
              liProps={{
                onDragOver: (e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverId(v.id);
                },
                onDragLeave: () => setOverId((o) => (o === v.id ? null : o)),
                onDrop: (e) => {
                  e.preventDefault();
                  drop(v.id);
                },
              }}
            >
              {!isEditing && (
                <div className="admin-cv-toolbar">
                  <div className="admin-cv-toolbar-side">
                    <button
                      type="button"
                      id={`admin-cv-handle-${v.id}`}
                      className="admin-btn admin-btn--sm admin-cv-handle"
                      draggable={!locked}
                      disabled={locked}
                      title={editing ? LOCKED : "Drag, or use the arrow keys, to reorder"}
                      aria-label={`Reorder ${v.title}, position ${i + 1} of ${list.length}. Use the arrow keys.`}
                      onKeyDown={(e) => onHandleKey(e, v.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(v.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                    >
                      <Handle />
                    </button>
                    <button type="button" id={`admin-cv-up-${v.id}`} className="admin-btn admin-btn--sm admin-cv-move" disabled={locked || i === 0} aria-label={`Move ${v.title} earlier`} onClick={() => move(v.id, -1, `admin-cv-up-${v.id}`)}>
                      ↑
                    </button>
                    <button type="button" id={`admin-cv-down-${v.id}`} className="admin-btn admin-btn--sm admin-cv-move" disabled={locked || i === list.length - 1} aria-label={`Move ${v.title} later`} onClick={() => move(v.id, 1, `admin-cv-down-${v.id}`)}>
                      ↓
                    </button>
                  </div>
                  <div className="admin-cv-toolbar-side">
                    <button type="button" id={`admin-cv-edit-${v.id}`} className="admin-btn admin-btn--sm" disabled={locked} title={editing ? LOCKED : undefined} onClick={() => setEditing({ kind: "value", id: v.id })}>
                      Edit
                    </button>
                    <ConfirmButton
                      label="Delete"
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      disabled={locked}
                      title={`Delete “${v.title}”?`}
                      body="It leaves the team page straight away, and the AI interview panelist stops reading it. A value a coach has named in a Noticed note can't be deleted; edit its wording instead."
                      confirmLabel="Delete value"
                      onConfirm={() => deleteValue(v.id)}
                      onDone={() => {
                        showToast({ message: `“${v.title}” deleted.` });
                        router.refresh();
                      }}
                    />
                  </div>
                </div>
              )}
            </ValueTile>
          );
        })}
        {editing?.kind === "new" ? (
          <li className="admin-cv-tile admin-cv-tone-0 is-editing is-full">
            <ValueForm initial={{ title: "", description: "" }} isNew onCancel={cancel} onSave={save} />
          </li>
        ) : (
          <li className="admin-cv-add-slot">
            <button type="button" id="admin-cv-add" className="admin-cv-add" disabled={locked} title={editing ? LOCKED : undefined} onClick={() => setEditing({ kind: "new" })}>
              + Add a value
            </button>
          </li>
        )}
      </ol>
    </>
  );
}
