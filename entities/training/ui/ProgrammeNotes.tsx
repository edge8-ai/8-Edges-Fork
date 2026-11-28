"use client";

// The notes of one shown slice of the programme read (TR.7), in a drawer:
// each note's words, and a name only beside a note its writer signed while
// still on the team. The notes come in the order of their words, never by
// date, so a nameless one cannot be matched to a training (programme-read-rules).
import { useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { ShownNote } from "../lib/programme-read";

export function ProgrammeNotes({ slice, notes, className = "admin-btn admin-btn--sm" }: { slice: string; notes: ShownNote[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Read {notes.length === 1 ? "the note" : `${notes.length} notes`}
      </button>
      <DetailDrawer open={open} onClose={() => setOpen(false)} eyebrow="Notes from the reviews" title={slice}>
        <ul className="tr-pr-notes">
          {notes.map((n, i) => (
            <li key={i} className="tr-pr-note">
              <p className="tr-pr-note-text">{n.text}</p>
              <p className="tr-hint">{n.by ?? "Nameless"}</p>
            </li>
          ))}
        </ul>
      </DetailDrawer>
    </>
  );
}
