"use client";

// The ten-second review's fields (TR.3, the Training Block canvas approved
// 2026-10-11): how useful, in stars; the load felt; how it felt; a note for
// whoever runs it, and signing it; then the footer. It only draws: TrainingWord
// holds the draft and decides when a change saves.
import type { RefObject } from "react";
import { FEELINGS, FEELING_LABEL, LOADS, LOAD_LABEL, type MyReview } from "../lib/training-rules";

/** A review being written: a saved review's shape, with the note as typed (empty, not null). */
export type Draft = Omit<MyReview, "note"> & { note: string };

const STAR = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z";

/** What the form asks of its owner: a tap that saves at once (stars, load, tags), a keystroke that waits for Done (note, sign), and the footer's three. */
export type ReviewHandlers = { save: (next: Draft) => void; edit: (next: Draft) => void; done: () => void; remove: () => void; skip: () => void };

type Props = {
  id: string;
  draft: Draft;
  saved: string;
  finalOn: string;
  // While anything is saving, removing or answering, nothing new can be tapped.
  pending: boolean;
  hasReview: boolean;
  firstStar: RefObject<HTMLButtonElement | null>;
  on: ReviewHandlers;
};

export function ReviewFields({ id, draft, saved, finalOn, pending, hasReview, firstStar, on }: Props) {
  const hint = draft.stars === 0 && (draft.load || draft.tags.length > 0) ? "Pick the stars to save." : "";
  return (
    <div className="tr-review">
      <div>
        <div className="tr-label">How useful</div>
        <div className="tr-stars" role="group" aria-label="Stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              ref={n === 1 ? firstStar : undefined}
              type="button"
              className={`tr-star${n <= draft.stars ? " is-on" : ""}`}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              aria-pressed={n === draft.stars}
              disabled={pending}
              onClick={() => on.save({ ...draft, stars: n })}
            >
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path d={STAR} />
              </svg>
            </button>
          ))}
        </div>
        <div className="tr-saved" role="status">
          {saved || hint}
        </div>
      </div>
      <div>
        <div className="tr-label">The load you felt</div>
        <div className="tr-band" role="group" aria-label="Load">
          {LOADS.map((l) => (
            <button key={l} type="button" className={`tr-band-seg is-${l}${draft.load === l ? " is-on" : ""}`} aria-pressed={draft.load === l} disabled={pending} onClick={() => on.save({ ...draft, load: draft.load === l ? null : l })}>
              {LOAD_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <div className="tr-review-wide">
        <div className="tr-label">
          How it felt <span className="tr-label-aside">· optional</span>
        </div>
        <div className="tr-chips" role="group" aria-label="How it felt">
          {FEELINGS.map((t) => {
            const picked = draft.tags.includes(t);
            return (
              <button key={t} type="button" className={`tr-chip${picked ? " is-on" : ""}`} aria-pressed={picked} disabled={pending} onClick={() => on.save({ ...draft, tags: picked ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}>
                {FEELING_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tr-review-wide">
        <label className="tr-label" htmlFor={`tr-note-${id}`}>
          A note for whoever runs it <span className="tr-label-aside">· optional, nameless unless you sign it</span>
        </label>
        <textarea
          id={`tr-note-${id}`}
          className="tr-textarea"
          rows={2}
          maxLength={2000}
          placeholder="What would make the next one better?"
          value={draft.note}
          onChange={(e) => on.edit({ ...draft, note: e.target.value })}
        />
        <div className="tr-review-foot">
          <label className="tr-sign">
            <input type="checkbox" checked={draft.signed} onChange={(e) => on.edit({ ...draft, signed: e.target.checked })} /> Sign it with my name
          </label>
          <div className="tr-cool-actions">
            <span className="tr-closes">Editable until {finalOn}</span>
            {hasReview && (
              <button type="button" className="admin-btn tr-btn-quiet" disabled={pending} onClick={on.remove}>
                Remove my review
              </button>
            )}
            <button type="button" className="admin-btn tr-btn-quiet" disabled={pending} onClick={on.skip}>
              I skipped it
            </button>
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={on.done}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
