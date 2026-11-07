"use client";

// "+ Log a training" (TR.2): a member records a training they took on their own,
// an online course sitting or a conference day. It goes straight into their log
// as one they went to; the review arrives with TR.3.
import { useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { TrainingFields, draftInput, type TrainingDraft } from "./TrainingFields";
import { DrawerFooter } from "./ActionNote";

export function LogTraining({ types, today, log }: { types: { id: string; name: string }[]; today: string; log: (input: unknown) => Promise<Result> }) {
  const blank: TrainingDraft = { typeId: "", title: "", date: today, start: "09:00", minutes: 60, notes: "" };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TrainingDraft>(blank);
  const { note, setNote, pending, run } = useActionRunner();
  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        onClick={() => {
          setDraft(blank);
          setNote(null);
          setOpen(true);
        }}
      >
        + Log a training
      </button>
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Log a training"
        footer={<DrawerFooter note={note} pending={pending} onCancel={() => setOpen(false)} onSubmit={() => run(() => log(draftInput(draft)), "Logged.", () => setOpen(false))} submitLabel="Log it" />}
      >
        <p className="tr-hint tr-drawer-lede">Something you took on your own: a course sitting, a conference day, a workshop.</p>
        <TrainingFields draft={draft} onChange={setDraft} types={types} />
      </DetailDrawer>
    </>
  );
}
