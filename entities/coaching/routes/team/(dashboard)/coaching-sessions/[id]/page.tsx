import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getCoachingSession } from "@/entities/coaching/lib/sessions";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";

export const metadata = { title: "Coaching Session" };

function minutes(seconds: number | null): string {
  return seconds ? `${Math.round(seconds / 60)} min` : "—";
}

export default async function CoachingSessionDetailPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.sessions");
  const params = await props.params;
  await requireTeamMember();
  const session = await getCoachingSession(params.id);
  if (!session) notFound();

  const summaryHtml = session.summary ? await renderPlanMarkdown(session.summary) : null;
  const sub = session.startedAt
    ? `${formatDate(session.startedAt)} · ${minutes(session.durationSeconds)}`
    : minutes(session.durationSeconds);

  return (
    <div>
      <PageHead
        eyebrow="Coaching · Session"
        title={session.title || "Coaching session"}
        sub={sub}
        action={
          <Link className="admin-btn" href="/team/coaching-sessions">
            ← All sessions
          </Link>
        }
      />

      <section className="admin-card admin-section-card u-mb-4">
        <div className="admin-cell-muted">
          <strong>Participants:</strong> {session.speakers.length > 0 ? session.speakers.join(", ") : "—"}
        </div>
        {session.recordingUrl && (
          <div className="admin-cell-muted u-mt-2">
            <a href={session.recordingUrl} target="_blank" rel="noreferrer">
              Zoom recording
            </a>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title">Summary</h2>
        {summaryHtml ? (
          <div className="admin-idea-plan u-mt-3" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        ) : (
          <div className="admin-empty">Summary pending. It generates from the transcript.</div>
        )}
      </section>

      {session.actionItems.length > 0 && (
        <section className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title">Action items</h2>
          <ul className="u-mt-3">
            {session.actionItems.map((a, i) => (
              <li key={i} className="u-mb-2">
                <strong>{a.title}</strong>
                {a.detail ? `: ${a.detail}` : ""}
                {a.dueDate ? ` (due ${a.dueDate})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {session.transcript && (
        <section className="admin-card admin-section-card">
          <details>
            <summary className="admin-card-title u-pointer">
              Full transcript
            </summary>
            <pre className="u-mt-3 u-prewrap">{session.transcript}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
