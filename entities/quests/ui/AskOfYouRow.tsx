"use client";

// One ask made of the reader (AK.2; the approved prototype's Waiting on you and
// Open to anyone rows). Answer opens a text box, and a link fits in it. Answer
// is the only move: an ask on Waiting on you is required, and a required ask is
// a task that cannot be declined (Khoa, 17 November 2026; standing.ts has no
// decline move since AK.12),
// while leaving an ask open to anyone unanswered is no mark at all. A required
// ask that closed before the reader answered it keeps Answer late, and the
// answer shows as late (AK.8, AK.9). Once an answer lands the row says so in
// place, and AsksView keeps the row on its list after the refresh that takes it
// off, so the person sees where their answer went.
import { useId, useState } from "react";
import { Avatar } from "@/kernel/ui/Avatar";
import { Icon } from "@/kernel/ui/Icon";
import type { AskOfYou } from "../lib/asks-read";
import { answersSoFar, closedLabel, dueLabel, landedLine, STILL_YOU_CAN, type AskMoves } from "./asks-model";
import { portraitTone } from "./quests-model";
import { useAskMove } from "./use-ask-move";

export type Landed = "answered" | "answered_late";

export function AskOfYouRow({
  ask,
  list,
  closedAt = null,
  now,
  moves,
  landed,
  onLanded,
}: {
  ask: AskOfYou;
  /** Waiting on you: someone expects an answer. Open to anyone: nobody does. Closed: it closed before the reader answered. */
  list: "waiting" | "open" | "closed";
  /** When a closed ask closed, ISO: its pill names the day. */
  closedAt?: string | null;
  now: string;
  moves: AskMoves;
  /** What the reader just did here, kept by the page across its refresh. */
  landed: Landed | null;
  onLanded: (outcome: Landed) => void;
}) {
  const ids = useId();
  const [answering, setAnswering] = useState(false);
  const [text, setText] = useState("");
  const { busy, error, run } = useAskMove();
  const due = dueLabel(ask.dueAt, now);
  const pill = closedAt ? { text: closedLabel(closedAt), soon: false } : due;
  const cancel = () => {
    setAnswering(false);
    setText("");
  };
  const send = (outcome: Landed) =>
    void run(
      () => moves.answer(ask, text),
      () => {
        cancel();
        onLanded(outcome);
      },
    );
  const answerButton = (
    <button type="button" className={list === "waiting" ? "admin-btn admin-btn--primary" : "admin-btn"} onClick={() => setAnswering(true)}>
      Answer
    </button>
  );

  return (
    <article className="ak-row">
      <Avatar className={`ak-av ak-tone-${portraitTone(ask.asker.personId)}`} name={ask.asker.name} initials={ask.asker.initials} decorative />
      <div className="ak-body">
        <p className="ak-meta">
          <span>
            <strong>{ask.asker.name}</strong> {list === "open" ? "asked anyone" : "asked you"}
          </span>
          <span className={pill.soon ? "ak-due ak-due--soon" : "ak-due"}>{pill.text}</span>
        </p>
        <p className="ak-ask">{ask.ask}</p>
        {ask.title && <p className="ak-quiet">{ask.title}</p>}
        {ask.note && <p className="ak-note">{ask.note}</p>}
        {list === "open" && !landed && <p className="ak-quiet">{answersSoFar(ask.answered)}</p>}
        {list === "closed" && !landed && <p className="ak-still">{STILL_YOU_CAN}</p>}

        {landed ? (
          <p className="ak-landed" role="status">
            <Icon name="check" />
            {landedLine(landed, ask.asker.name)}
          </p>
        ) : !answering ? (
          list === "waiting" ? (
            <div className="ak-acts">{answerButton}</div>
          ) : (
            list === "closed" && (
              <div className="ak-acts">
                <button type="button" className="admin-btn" onClick={() => setAnswering(true)}>
                  Answer late
                </button>
              </div>
            )
          )
        ) : (
          <form
            className="ak-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send(list === "closed" ? "answered_late" : "answered");
            }}
          >
            <label className="admin-label" htmlFor={`${ids}-field`}>
              Your answer
            </label>
            <textarea
              id={`${ids}-field`}
              className="admin-textarea"
              rows={3}
              maxLength={8000}
              placeholder="Write it here. Add a link if the ask wants one."
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="ak-error" role="alert">
                {error}
              </p>
            )}
            <div className="ak-acts">
              <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !text.trim()}>
                {busy ? "Sending…" : "Send answer"}
              </button>
              <button type="button" className="admin-btn admin-btn--ghost" onClick={cancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      {list === "open" && !answering && !landed && <div className="ak-side">{answerButton}</div>}
    </article>
  );
}
