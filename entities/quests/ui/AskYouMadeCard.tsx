"use client";

// One ask the reader made (AK.2; the approved prototype's You asked card): how
// many were asked and how many answered, the faces of those who answered, and
// the answers with a Thanks each, an answer that came after the ask closed
// tagged Late (AK.9). Nobody who has not answered appears here, by name or by
// face: the read model carries only a count of who was asked (ADR 0020, ADR 0036).
import { Avatar } from "@/kernel/ui/Avatar";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { timeAgo } from "@/kernel/ui/format";
import type { AskYouMade } from "../lib/asks-read";
import { answeredLine, askedLine, closedLabel, dueLabel, type AskMoves } from "./asks-model";
import { portraitTone } from "./quests-model";
import { useAskMove } from "./use-ask-move";

function Face({ who, className = "ak-av" }: { who: AskYouMade["answers"][number]["who"]; className?: string }) {
  return <Avatar className={`${className} ak-tone-${portraitTone(who.personId)}`} name={who.name} initials={who.initials} decorative />;
}

function ThanksButton({ ask, answer, moves }: { ask: AskYouMade; answer: AskYouMade["answers"][number]; moves: AskMoves }) {
  const { busy, error, run } = useAskMove();
  if (!answer.canThank && !answer.thanked) return null;
  return (
    <span className="ak-thanks">
      {answer.thanked ? (
        <button type="button" className="admin-btn admin-btn--primary" disabled aria-pressed="true">
          Thanked
        </button>
      ) : (
        <button type="button" className="admin-btn" disabled={busy} aria-pressed="false" onClick={() => void run(() => moves.thank(ask, answer.who.personId))}>
          Thanks
        </button>
      )}
      {error && (
        <span className="ak-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * One ask the reader made. `closedAt` marks one that has closed (AK.8): its
 * pill names the day, and Close now and Withdraw go, because neither has
 * anything left to do; its answers and Thanks stay.
 */
export function AskYouMadeCard({ ask, now, moves, closedAt = null }: { ask: AskYouMade; now: string; moves: AskMoves; closedAt?: string | null }) {
  const { refresh } = useAskMove();
  const pill = closedAt ? { text: closedLabel(closedAt), soon: false } : dueLabel(ask.dueAt, now);
  const nowMs = Date.parse(now);
  const faces = ask.answers.slice(0, 8);
  const stands = answeredLine(ask);

  return (
    <article className="ak-mine">
      <div className="ak-mine-head">
        <div className="ak-body">
          <p className="ak-meta">
            <span>{askedLine(ask.asked)}</span>
            <span className={pill.soon ? "ak-due ak-due--soon" : "ak-due"}>{pill.text}</span>
          </p>
          <p className="ak-ask">{ask.ask}</p>
          {ask.title && <p className="ak-quiet">{ask.title}</p>}
        </div>
        {!closedAt && (
          <div className="ak-acts">
            <ConfirmButton
              label="Close now"
              className="admin-btn admin-btn--ghost"
              title="Close this ask now?"
              body="Nobody can answer it after this. The answers so far stay with you."
              confirmLabel="Close now"
              onConfirm={() => moves.closeNow(ask)}
              onDone={refresh}
            />
            {ask.canWithdraw && (
              <ConfirmButton
                label="Withdraw"
                className="admin-btn admin-btn--ghost"
                title="Withdraw this ask?"
                body="It goes away for everyone you asked, and nobody can answer it."
                confirmLabel="Withdraw"
                onConfirm={() => moves.withdraw(ask)}
                onDone={refresh}
              />
            )}
          </div>
        )}
      </div>

      <div className="ak-progress">
        {faces.length > 0 && (
          <span className="ak-faces" aria-hidden>
            {faces.map((a) => (
              <Face key={a.who.personId} who={a.who} className="ak-av ak-av--stack" />
            ))}
          </span>
        )}
        <div className="ak-progress-text">
          <span className="ak-strong">{stands}</span>
          <progress className="ak-bar" value={ask.answered} max={Math.max(ask.asked, 1)} aria-label={stands} />
        </div>
      </div>

      {ask.answers.map((a) => (
        <div className="ak-answer" key={a.who.personId}>
          <Face who={a.who} />
          <div className="ak-body">
            <p className="ak-meta">
              <span>
                <strong>{a.who.name}</strong> · {timeAgo(a.at, nowMs)}
              </span>
              {a.late && <span className="ak-late">Late</span>}
            </p>
            {a.text && <p className="ak-answer-text">{a.text}</p>}
            {a.url && (
              <a className="ak-link" href={a.url} target="_blank" rel="noreferrer">
                {a.url}
              </a>
            )}
          </div>
          <ThanksButton ask={ask} answer={a} moves={moves} />
        </div>
      ))}
    </article>
  );
}
