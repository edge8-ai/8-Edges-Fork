"use client";

// The Cool-down tray (TR.2, TR.3; the Training Block canvas approved
// 2026-10-11): the started trainings that still want the member's word, either
// whether they went or, having gone, the ten-second review, while each one's
// seven days are open. "I skipped it" offers four reasons, all optional, and
// nobody asks why. Each row is a TrainingWord.
import type { WordView } from "../lib/training-format";
import { TrainingWord, type WordActions } from "./TrainingWord";

export function CoolDown({ rows, actions }: { rows: WordView[]; actions: WordActions }) {
  return (
    <section className="tr-cool" aria-labelledby="tr-cool-h">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title" id="tr-cool-h">
            Cool-down
          </h2>
          <p className="tr-hint">Did you go, and how did it land? Ten seconds each, and optional.</p>
        </div>
        {rows.length > 0 && <span className="tr-count">{rows.length} to log</span>}
      </div>
      {rows.length === 0 ? (
        <p className="tr-cool-empty">Nothing waiting. Trainings you are on show up here once they start.</p>
      ) : (
        <ul className="tr-cool-list">
          {rows.map((r) => (
            <TrainingWord key={r.attendanceId} row={r} place="tray" actions={actions} />
          ))}
        </ul>
      )}
    </section>
  );
}
