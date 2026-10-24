"use client";

// The organiser's side of training (TR.2): schedule a training for people, then
// change it until it starts (afterwards only its title and notes), or cancel it.
// The list shows who is on each training and never anyone's answer: attendance
// is read only inside the programme read (ADR 0016).
import { useState, type ReactNode } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { TrainingFields, draftInput, type TrainingDraft } from "./TrainingFields";
import { PeoplePicker } from "./PeoplePicker";
import { ActionNote, DrawerFooter } from "./ActionNote";
import { TrainingEmpty } from "./TrainingEmpty";

export type OrganisedItem = {
  id: string;
  title: string;
  notes: string;
  typeId: string;
  typeName: string;
  tone: string;
  when: string;
  date: string;
  start: string;
  minutes: number;
  people: { id: string; name: string }[];
  state: "upcoming" | "started" | "cancelled";
  may: { move: boolean; cancel: boolean; changeWho: boolean; editText: boolean };
};

type Actions = {
  schedule: (input: unknown) => Promise<Result>;
  update: (id: string, input: unknown) => Promise<Result>;
  cancel: (id: string) => Promise<Result>;
};

type Editing = { mode: "new" } | { mode: "edit"; item: OrganisedItem } | null;

export function OrganiseTrainings({
  items,
  types,
  people,
  today,
  actions,
}: {
  items: OrganisedItem[];
  types: { id: string; name: string }[];
  people: { id: string; name: string }[];
  today: string;
  actions: Actions;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<TrainingDraft>({ typeId: "", title: "", date: today, start: "09:00", minutes: 60, notes: "" });
  const [who, setWho] = useState<string[]>([]);
  const { note, setNote, pending, run } = useActionRunner();

  const openNew = () => {
    setDraft({ typeId: "", title: "", date: today, start: "09:00", minutes: 60, notes: "" });
    setWho([]);
    setNote(null);
    setEditing({ mode: "new" });
  };
  const openEdit = (item: OrganisedItem) => {
    setDraft({ typeId: item.typeId, title: item.title, date: item.date, start: item.start, minutes: item.minutes, notes: item.notes });
    setWho(item.people.map((p) => p.id));
    setNote(null);
    setEditing({ mode: "edit", item });
  };
  const close = () => setEditing(null);

  // People already on a training stay pickable even if the organiser could not
  // add them today, so an edit never silently drops someone.
  const options = (() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    if (editing?.mode === "edit") for (const p of editing.item.people) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const save = () => {
    if (editing?.mode === "new") return run(() => actions.schedule({ ...draftInput(draft), personIds: who }), "Scheduled.", close);
    if (editing?.mode === "edit") {
      const { item } = editing;
      const input = {
        title: draft.title,
        ...(draft.notes.trim() ? { notes: draft.notes } : {}),
        ...(item.may.move ? { date: draft.date, start: draft.start, minutes: draft.minutes } : {}),
        ...(item.may.changeWho ? { personIds: who } : {}),
      };
      return run(() => actions.update(item.id, input), "Saved.", close);
    }
  };

  const upcoming = items.filter((i) => i.state === "upcoming");
  const past = items.filter((i) => i.state !== "upcoming");
  const timeLocked = editing?.mode === "edit" && !editing.item.may.move;
  const whoLocked = editing?.mode === "edit" && !editing.item.may.changeWho;

  return (
    <>
      <ActionNote note={note} only="ok" />
      {/* The card's action sits in its own head, as New plan does in Plans (TH.17). */}
      <List
        title="Coming up"
        hint="Single trainings. Each lands on its people’s My Training and, once it starts, asks whether they went."
        action={
          <button type="button" className="admin-btn admin-btn--primary" onClick={openNew}>
            + Schedule a training
          </button>
        }
        items={upcoming}
        empty={
          <TrainingEmpty icon="calendar" title="Nothing scheduled">
            A training you schedule shows here until it starts, then moves to Earlier.
          </TrainingEmpty>
        }
        onEdit={openEdit}
        cancel={actions.cancel}
      />
      <List title="Earlier" items={past} empty={null} onEdit={openEdit} cancel={actions.cancel} />

      <DetailDrawer
        open={editing !== null}
        onClose={close}
        title={editing?.mode === "edit" ? "Change the training" : "Schedule a training"}
        footer={<DrawerFooter note={note} pending={pending} onCancel={close} onSubmit={save} submitLabel={editing?.mode === "edit" ? "Save" : "Schedule"} />}
      >
        {editing?.mode === "new" && <p className="tr-hint tr-drawer-lede">It lands on each person&rsquo;s My Training, and they say whether they went.</p>}
        <TrainingFields draft={draft} onChange={setDraft} types={types} timeLocked={timeLocked} />
        <div className="admin-field tr-who">
          {whoLocked ? (
            <>
              <span className="admin-label">Who</span>
              <p className="admin-hint">{editing?.mode === "edit" ? editing.item.people.map((p) => p.name).join(", ") : ""}</p>
            </>
          ) : (
            <PeoplePicker people={options} value={who} onChange={setWho} />
          )}
        </div>
      </DetailDrawer>
    </>
  );
}

function List({
  title,
  hint,
  action,
  items,
  empty,
  onEdit,
  cancel,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  items: OrganisedItem[];
  empty: ReactNode;
  onEdit: (item: OrganisedItem) => void;
  cancel: (id: string) => Promise<Result>;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="admin-card admin-section-card tr-card" aria-label={title}>
      {action ? (
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">{title}</h2>
            {hint && <p className="tr-hint">{hint}</p>}
          </div>
          {action}
        </div>
      ) : (
        <h2 className="tr-card-title">{title}</h2>
      )}
      {items.length === 0 ? (
        empty
      ) : (
        <ul className="tr-log">
          {items.map((i) => (
            <li key={i.id} className={`tr-log-row ${i.tone}${i.state === "cancelled" ? " is-skipped" : ""}`}>
              <div>
                <div className="tr-row-title">{i.title}</div>
                <div className="tr-row-meta">
                  {i.when} · {i.typeName} · {i.people.length === 1 ? "1 person" : `${i.people.length} people`}
                  {i.state === "cancelled" ? " · cancelled" : ""}
                </div>
              </div>
              <div className="tr-row-actions">
                {i.may.editText && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => onEdit(i)}>
                    Change
                  </button>
                )}
                {i.may.cancel && (
                  <ConfirmButton
                    className="admin-btn admin-btn--sm"
                    label="Cancel"
                    title="Cancel this training?"
                    body="It comes off everyone's My Training. This cannot be undone."
                    confirmLabel="Cancel training"
                    onConfirm={() => cancel(i.id)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
