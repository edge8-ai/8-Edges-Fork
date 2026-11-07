// What is coming up on My Training (TR.2): the member's trainings that have not
// started, soonest first, each wearing its type's colour on its edge (the
// Training Block canvas). Read-only, so it renders on the server; the log, which
// the member can change, is ./TrainingLog. Nothing here is anyone else's.
import type { MyTrainingRow } from "../lib/training-rules";
import { trainingMeta, typeTone, whenLabel } from "../lib/training-format";

export function ComingUp({ rows }: { rows: MyTrainingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="admin-card admin-section-card tr-card" aria-labelledby="tr-next-h">
      <h2 className="tr-card-title" id="tr-next-h">
        Coming up
      </h2>
      <ul className="tr-log">
        {rows.map((r) => (
          <li key={r.attendanceId} className={`tr-log-row ${typeTone(r.typeRank)}`}>
            <div>
              <div className="tr-row-title">{r.title}</div>
              <div className="tr-row-meta">
                {whenLabel(r.startsAt, r.endsAt)} · {trainingMeta(r)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
