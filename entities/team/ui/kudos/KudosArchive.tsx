"use client";

import Link from "next/link";
import { useState } from "react";
import { HomeFace, toneFor } from "@/entities/team/ui/home/HomeFace";
import type { KudosNote } from "@/entities/team/lib/kudos";
import { kudosDay, monthName, monthOf, noteTone } from "@/entities/team/lib/kudos-rules";

// From the archive (TH.21): one note from an earlier month, under this month's
// wall, kept as it was given, with a way to that month. "Another one" steps
// through the few the page picked at random. It is a keepsake, not a ranking:
// the page picks without regard to who gave or got a note.

export function KudosArchive({ notes, viewerPersonId, currentMonth }: { notes: KudosNote[]; viewerPersonId: string; currentMonth: string }) {
  const [at, setAt] = useState(0);
  if (notes.length === 0) return null;
  const i = at % notes.length;
  const n = notes[i];
  const month = monthOf(n.givenOn);
  const name = monthName(month, currentMonth);
  const mine = n.from.personId === viewerPersonId;
  const forMe = n.to.personId === viewerPersonId;
  return (
    <section className="kd-arch" aria-labelledby="kd-arch-h">
      <span className="kd-tape" aria-hidden="true" />
      <div className="kd-arch-top">
        <h2 className="kd-arch-k" id="kd-arch-h">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>From the archive · {name}</span>
        </h2>
        {notes.length > 1 && (
          <button type="button" className="kd-arch-more" onClick={() => setAt(i + 1)}>
            Another one
          </button>
        )}
      </div>
      <div className="kd-arch-grid">
        <div className={`kd-note tone-${noteTone(i)}`} aria-live="polite">
          <p className="kd-body">{n.body}</p>
          <div className="kd-who">
            <span className="kd-pair" aria-hidden="true">
              <HomeFace name={n.from.name} avatarUrl={n.from.avatarUrl} tone={toneFor(n.from.personId)} />
              <HomeFace name={n.to.name} avatarUrl={n.to.avatarUrl} tone={toneFor(n.to.personId)} />
            </span>
            <p className="kd-meta">
              <b>{mine ? "You" : n.from.name}</b> to <b>{forMe ? "you" : n.to.name}</b> · {kudosDay(n.givenOn, currentMonth)}
            </p>
          </div>
        </div>
        <div className="kd-arch-side">
          <p className="kd-arch-h">Remember this one?</p>
          <p className="kd-hint">A thank-you from {name}, kept as it was given.</p>
          <Link className="kd-month" href={`/team/kudos?month=${month}`}>
            <span>Read {name}&rsquo;s thanks</span> →
          </Link>
        </div>
      </div>
    </section>
  );
}
