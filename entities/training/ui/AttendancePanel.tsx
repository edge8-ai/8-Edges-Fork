"use client";

// Who was in the session, for the organiser (English Program PR 4, ADR 0016
// amended for taught sessions): each learner's row with its source, and a
// correction the organiser may make once the session has started. A corrected
// row says so and the next transcript leaves it alone. Skip reasons, stars and
// reviews are never shown here.
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { AttendanceSource, AttendanceStatus } from "@/entities/training/lib/training-rules";
import { ActionNote } from "./ActionNote";

const SOURCE_LABEL: Record<AttendanceSource, string> = { member: "their word", transcript: "from the transcript", organiser: "set by you" };
const STATUS_LABEL: Record<AttendanceStatus, string> = { pending: "no word yet", attended: "attended", skipped: "skipped", absent: "absent" };

export function AttendancePanel({
  sessionId,
  people,
  started,
  set,
}: {
  sessionId: string;
  people: { id: string; name: string; status: AttendanceStatus; source: AttendanceSource }[];
  started: boolean;
  set: (trainingId: string, personId: string, status: "attended" | "absent") => Promise<Result>;
}) {
  const { note, pending, run } = useActionRunner();
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Attendance">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">Attendance</h2>
          <p className="tr-hint">{started ? "From the transcript once there is one; your correction wins and stays." : "Set once the session has started."}</p>
        </div>
      </div>
      <ActionNote note={note} />
      <ul className="tr-log">
        {people.map((p) => (
          <li key={p.id} className="tr-log-row tr-type-1">
            <div>
              <div className="tr-row-title">{p.name}</div>
              <div className="tr-row-meta">
                {STATUS_LABEL[p.status]}
                {p.status !== "pending" ? ` · ${SOURCE_LABEL[p.source]}` : ""}
              </div>
            </div>
            {started && (
              <div className="tr-row-actions">
                {p.status !== "attended" && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => run(() => set(sessionId, p.id, "attended"), `${p.name}: attended.`)} disabled={pending}>
                    Attended
                  </button>
                )}
                {p.status !== "absent" && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => run(() => set(sessionId, p.id, "absent"), `${p.name}: absent.`)} disabled={pending}>
                    Absent
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
