"use client";

// One training's row on My Training, in the Cool-down tray or the log (TR.2,
// TR.3; the Training Block canvas approved 2026-10-11). The member says whether
// they went; if they did, the ten-second review opens below: one tap on a star
// saves it, and the load, the feeling tags, the note and signing it are
// optional. Everything stays open for seven days, then is final. On a phone the
// review is a bottom sheet over the page.
//
// Taps save as they happen, one after another, without re-rendering the page:
// a refresh would move a reviewed training out of the tray while the member is
// still on it. Done refreshes. A failed save is said on the row and does not
// stop the next one; skipping and removing wait for saves still in flight, and
// nothing saves once a removal has begun.
import { useEffect, useRef, useState } from "react";
import type { Result } from "@/kernel/data/result";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { SKIP_REASONS, SKIP_REASON_LABEL, type AnswerInputType, type MyReview, type SkipReason } from "../lib/training-rules";
import type { WordView } from "../lib/training-format";
import { ActionNote } from "./ActionNote";
import { ReviewFields, type Draft } from "./ReviewFields";
import { useWordFocus } from "./WordFocus";

export type WordActions = {
  answer: (trainingId: string, input: AnswerInputType) => Promise<Result>;
  review: (trainingId: string, input: MyReview) => Promise<Result>;
  remove: (trainingId: string) => Promise<Result>;
};

const draftOf = (r: MyReview | null): Draft => ({ stars: r?.stars ?? 0, load: r?.load ?? null, tags: r?.tags ?? [], note: r?.note ?? "", signed: r?.signed ?? false });
const asReview = (d: Draft): MyReview => ({ stars: d.stars, load: d.load, tags: d.tags, note: d.note.trim() ? d.note : null, signed: d.signed });

export function TrainingWord({ row, place, actions }: { row: WordView; place: "tray" | "log"; actions: WordActions }) {
  const { note, setNote, pending, startTransition, router } = useActionRunner();
  const focus = useWordFocus();
  const [mode, setMode] = useState<"closed" | "review" | "skip">(() => (focus.openId === row.attendanceId ? "review" : "closed"));
  const [draft, setDraft] = useState<Draft>(() => draftOf(row.review));
  const [reason, setReason] = useState<SkipReason | null>(row.skipReason);
  const [saved, setSaved] = useState("");
  // The row's data as last seen: when a refresh brings a different review or
  // reason while the row is closed, the draft follows it.
  const latest = JSON.stringify([row.review, row.skipReason]);
  const [seen, setSeen] = useState(latest);
  if (latest !== seen && mode === "closed") {
    setSeen(latest);
    setDraft(draftOf(row.review));
    setReason(row.skipReason);
  }
  // Every save waits for the one before it, so the last tap is the one kept.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const removing = useRef(false);
  const firstStar = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(mode !== "closed");
  // A review counts as there from the first star, saved or still saving, so the
  // skip warns before it removes one.
  const hasReview = row.review !== null || draft.stars > 0;

  useEffect(() => {
    if (mode === "review") firstStar.current?.focus();
    // Back to the row when its panel closes, so the keyboard is not lost.
    if (mode === "closed" && wasOpen.current) head.current?.focus();
    wasOpen.current = mode !== "closed";
  }, [mode]);

  function fail(res: Result) {
    if (!res.ok) setNote({ tone: "err", text: res.error });
  }

  function save(next: Draft) {
    if (removing.current) return;
    setDraft(next);
    setNote(null);
    if (next.stars === 0) {
      setSaved("");
      return;
    }
    const run = async () => {
      const res = await actions.review(row.trainingId, asReview(next)).catch(() => ({ ok: false as const, error: "Could not save your review. Try again." }));
      if (res.ok) setSaved("Saved. The rest is optional.");
      else fail(res);
    };
    queue.current = queue.current.then(run, run);
  }

  function close(refresh: boolean) {
    focus.setOpenId(null);
    setMode("closed");
    if (refresh) router.refresh();
  }

  function done() {
    // The note and the signature save here; the taps already have.
    startTransition(async () => {
      await queue.current;
      const res = draft.stars > 0 ? await actions.review(row.trainingId, asReview(draft)) : ({ ok: true } as const);
      if (res.ok) close(true);
      else fail(res);
    });
  }

  function answer(input: AnswerInputType, then: () => void) {
    setNote(null);
    startTransition(async () => {
      await queue.current;
      const res = await actions.answer(row.trainingId, input);
      if (res.ok) then();
      else fail(res);
    });
  }

  function remove() {
    removing.current = true;
    startTransition(async () => {
      await queue.current;
      const res = await actions.remove(row.trainingId);
      removing.current = false;
      if (!res.ok) return fail(res);
      setDraft(draftOf(null));
      setSaved("");
      close(true);
    });
  }

  const went = row.status === "attended";
  // "I went after all" moves the training into the tray; its row there opens the review.
  const wentAfterAll = () => {
    focus.setOpenId(row.attendanceId);
    answer({ answer: "attended" }, () => setMode("review"));
  };
  const summary =
    place === "log" ? (
      <>
        <span className="tr-outcome">{row.line}</span>
        {row.open && row.status !== "pending" && (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => setMode(went ? "review" : "skip")}>
            Change
          </button>
        )}
      </>
    ) : (
      <>
        <span className="tr-closes">{row.closes}</span>
        {went ? (
          <button type="button" className="admin-btn tr-btn-ink" disabled={pending} onClick={() => setMode("review")}>
            Review it
          </button>
        ) : (
          <button type="button" className="admin-btn tr-btn-ink" disabled={pending} onClick={() => answer({ answer: "attended" }, () => setMode("review"))}>
            I went
          </button>
        )}
        <button type="button" className="admin-btn" disabled={pending} onClick={() => setMode("skip")}>
          I skipped it
        </button>
      </>
    );

  return (
    <li className={`tr-word ${row.tone}${place === "log" ? " is-log" : ""}${row.status === "skipped" ? " is-skipped" : ""}`}>
      <div className="tr-word-head" ref={head} tabIndex={-1}>
        <div className="tr-cool-main">
          <div className="tr-row-title">{row.title}</div>
          <div className="tr-row-meta">
            {row.when} · {row.meta}
          </div>
        </div>
        {mode === "closed" && <div className="tr-cool-actions">{summary}</div>}
      </div>

      {mode === "review" && (
        <>
          {/* The phone sheet's backdrop; hidden on wider screens. A tap on it is Done. */}
          <button type="button" className="tr-word-scrim" aria-hidden="true" tabIndex={-1} onClick={done} />
          <div className="tr-word-panel" role="group" aria-label={`Your review of ${row.title}`} onKeyDown={(e) => e.key === "Escape" && done()}>
            <div className="tr-sheet-title">{row.title}</div>
            <ReviewFields
              id={row.attendanceId}
              draft={draft}
              saved={saved}
              finalOn={row.finalOn}
              pending={pending}
              hasReview={hasReview}
              firstStar={firstStar}
              on={{ save, edit: setDraft, done, remove, skip: () => setMode("skip") }}
            />
            <ActionNote note={note} />
          </div>
        </>
      )}

      {mode === "skip" && (
        <div className="tr-skip">
          <span className="tr-skip-ask">Want to say why? Optional, nobody will ask.</span>
          {hasReview && <span className="tr-skip-warn">Saying you skipped it removes your review.</span>}
          <div className="tr-chips" role="group" aria-label="Why you skipped">
            {SKIP_REASONS.map((k) => (
              <button key={k} type="button" className={`tr-chip${reason === k ? " is-on" : ""}`} aria-pressed={reason === k} onClick={() => setReason(reason === k ? null : k)}>
                {SKIP_REASON_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="tr-cool-actions">
            {!went && row.status === "skipped" && (
              <button type="button" className="admin-btn" disabled={pending} onClick={wentAfterAll}>
                I went after all
              </button>
            )}
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setMode("closed")}>
              Back
            </button>
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => answer({ answer: "skipped", reason }, () => close(true))}>
              Done
            </button>
          </div>
          <ActionNote note={note} />
        </div>
      )}
    </li>
  );
}
