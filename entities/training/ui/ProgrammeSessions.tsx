// The reader's programme on My Training (English Program PR 8): the next
// sessions as cards with what the class will do and the homework to bring,
// and the past sessions with where their recap stands. Each opens the session
// page. Rendered on the server; nothing here is anyone else's.
import Link from "next/link";
import type { ProgrammeSession } from "@/entities/training/lib/my-session";
import { whenLabel } from "@/entities/training/lib/training-format";

const RECAP_LABEL = { none: "", drafted: "recap coming", published: "recap" } as const;

export function NextSessions({ sessions }: { sessions: ProgrammeSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <>
      {sessions.map((s) => (
        <section key={s.id} className="admin-card admin-section-card tr-card tr-next" aria-label={`Next: ${s.title}`}>
          <div className="tr-card-head">
            <div>
              <span className="tr-label">Next: {whenLabel(s.startsAt, s.endsAt)}</span>
              <h2 className="tr-card-title">{s.title}</h2>
              <p className="tr-hint">
                with {s.teacherName}
                {s.with.length ? ` and ${s.with.join(", ")}` : ""}
              </p>
            </div>
            <Link className="admin-btn admin-btn--sm" href={`/team/my-training/sessions/${s.id}`}>
              Open session
            </Link>
          </div>
          {s.blocks.length > 0 && (
            <p className="tr-phil-text">
              <strong>What we&rsquo;ll do:</strong> {s.blocks.map((b) => b.label).join(", ")}.
            </p>
          )}
          {s.homeworkDue && (
            <p className="tr-phil-text">
              <strong>Prepare:</strong> homework due {whenLabel(s.homeworkDue, s.homeworkDue).split(" · ").slice(0, 2).join(" · ")}.
            </p>
          )}
        </section>
      ))}
    </>
  );
}

export function PastSessions({ sessions }: { sessions: ProgrammeSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Past sessions">
      <h2 className="tr-card-title">Past sessions</h2>
      <ul className="tr-log">
        {sessions.map((s) => (
          <li key={s.id} className="tr-log-row tr-type-1">
            <div>
              <div className="tr-row-title">
                <Link href={`/team/my-training/sessions/${s.id}`}>{whenLabel(s.startsAt, s.endsAt)}</Link>
              </div>
              <div className="tr-row-meta">
                {s.title}
                {RECAP_LABEL[s.recapState] ? ` · ${RECAP_LABEL[s.recapState]}` : ""}
              </div>
            </div>
            <div className="tr-row-actions">
              <Link className="admin-btn admin-btn--sm" href={`/team/my-training/sessions/${s.id}`}>
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
