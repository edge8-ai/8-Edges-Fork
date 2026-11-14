"use client";

// The training log on My Training (TR.2, TR.3): the trainings the member has
// answered, or whose window closed unanswered, newest first. Each row says what
// they answered and, while its seven days are open, lets them change it. Each
// row is a TrainingWord.
import type { WordView } from "../lib/training-format";
import { TrainingWord, type WordActions } from "./TrainingWord";

export function TrainingLog({ rows, actions }: { rows: WordView[]; actions: WordActions }) {
  return (
    <section className="admin-card admin-section-card tr-card" aria-labelledby="tr-log-h">
      <h2 className="tr-card-title" id="tr-log-h">
        Training log
      </h2>
      {rows.length === 0 ? (
        <p className="tr-hint">Trainings you went to or skipped will be listed here.</p>
      ) : (
        <ul className="tr-log">
          {rows.map((r) => (
            <TrainingWord key={r.attendanceId} row={r} place="log" actions={actions} />
          ))}
        </ul>
      )}
    </section>
  );
}
