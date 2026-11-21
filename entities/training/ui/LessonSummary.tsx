// The top of a lesson's page (ADR 0016, amended 2026-10-26): the link to
// watch the recording, and the lesson's summary, which is the recap's
// `covered`, labelled drafted or published. Everyone on the lesson reads the
// summary once the organiser publishes the recap; the teacher and admins see
// it from the draft. Drawn on the teacher's session page and the Admin view's
// lesson page, with the admin kit only, so neither needs another sheet.
import { Badge } from "@/kernel/ui/Badge";

type Props = {
  recordingUrl: string | null;
  minutesUrl: string | null;
  summary: string | null;
  recapState: "none" | "drafted" | "published";
  held: boolean;
};

export function LessonSummary({ recordingUrl, minutesUrl, summary, recapState, held }: Props) {
  return (
    <section className="admin-card admin-section-card" aria-label="Recording and summary">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Recording</h2>
        <div className="admin-head-actions">
          {recordingUrl && (
            <a className="admin-btn admin-btn--primary" href={recordingUrl} target="_blank" rel="noopener noreferrer">
              Watch the recording
            </a>
          )}
          {minutesUrl && (
            <a className={recordingUrl ? "admin-btn" : "admin-btn admin-btn--primary"} href={minutesUrl} target="_blank" rel="noopener noreferrer">
              {recordingUrl ? "Open in Lark" : "Watch in Lark"}
            </a>
          )}
        </div>
      </div>
      {!recordingUrl && !minutesUrl && <p className="admin-hint">{held ? "No recording has been filed yet." : "Not held yet: the recording follows the class."}</p>}
      <div className="admin-card-head u-mt-4">
        <h2 className="admin-card-title">Summary</h2>
        {recapState === "published" ? <Badge tone="ok">Published</Badge> : recapState === "drafted" ? <Badge tone="warn">Draft, not yet published</Badge> : null}
      </div>
      {summary ? <p>{summary}</p> : <p className="admin-hint">Written from the transcript with the recap, once there is one.</p>}
    </section>
  );
}
