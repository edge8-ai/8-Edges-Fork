// /admin/talent/training/classes/[id]: one class in the Admin view (Dave,
// 2026-10-26), read-only. The course and when; the link to watch the video;
// the attendees, attended or absent and who said so; the lesson plan, or a
// plain "No plan yet" (the instructor writes it, and may add one after the
// fact); the recap, drafted or published, with its summary, its homework
// suggestion and its line to each learner; and for each learner Claude's
// evaluation of their English and the instructor's feedback, which the learner
// does not see (ADR 0016, amended 2026-10-26). Never here: a review, a skip
// reason, a submission, or the course's teacher's note on a learner.
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { isUuid } from "@/kernel/config/slug";
import { LESSON_PLAN_LABEL, classRead, type ClassAttendee } from "@/entities/training/lib/class-read";
import { whenLabel } from "@/entities/training/lib/training-format";
import { LessonSummary } from "@/entities/training/ui/LessonSummary";
import { EnglishEvaluation } from "@/entities/training/ui/EnglishEvaluation";
import { readSessionTranscript } from "@/entities/training/routes/team/(dashboard)/training/sessions/[id]/transcript-in";

export const metadata = { title: "Class", description: "One class: its video, attendees, lesson plan, recap and each learner's feedback." };

const BASE = "/admin/talent/training";

const STATUS: Record<ClassAttendee["status"], string> = { pending: "No word yet", attended: "Attended", absent: "Absent", skipped: "Did not come" };
const SOURCE: Record<ClassAttendee["source"], string> = { member: "their own word", transcript: "from the transcript", organiser: "set by the instructor" };

export default async function ClassPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013), as the class list's.
  await requirePermission("training.organise");
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const now = new Date();
  const cls = await classRead(id, now);
  if (!cls) notFound();
  const links = cls.held ? await readSessionTranscript(cls.id) : null;
  const nameOf = new Map(cls.attendees.map((a) => [a.personId, a.name]));
  const status = cls.cancelled ? "Cancelled" : cls.held ? "Held" : "Scheduled";

  return (
    <>
      <PageHead
        eyebrow={<Link href={`${BASE}?course=${cls.courseId}`}>Talent · People · Training · {cls.courseTitle}</Link>}
        title={whenLabel(cls.startsAt, cls.endsAt)}
        sub={`${cls.courseTitle} · ${cls.organiserName} · ${status}${cls.courseOpen ? "" : " · course closed to learners"}`}
      />
      <LessonSummary recordingUrl={links?.recordingUrl ?? null} minutesUrl={links?.minutesUrl ?? null} summary={cls.recap?.covered ?? null} recapState={cls.recapState} held={cls.held} />

      <section className="admin-card admin-section-card" aria-label="Attendees">
        <h2 className="admin-card-title">Attendees</h2>
        {cls.attendees.length === 0 ? (
          <div className="admin-empty">Nobody is on this class&apos;s list.</div>
        ) : (
          <div className="admin-list">
            {cls.attendees.map((a) => (
              <div key={a.personId} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{a.name}</div>
                </div>
                <div className="admin-list-aside">
                  {a.status === "attended" ? <Badge tone="ok">{STATUS.attended}</Badge> : <Badge tone={a.status === "pending" ? "neutral" : "warn"}>{STATUS[a.status]}</Badge>}
                  {a.status !== "pending" && <span className="admin-list-sub">{SOURCE[a.source]}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card" aria-label="Lesson plan">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Lesson plan</h2>
          {cls.lessonPlan === "none" ? <Badge tone="warn">{LESSON_PLAN_LABEL.none}</Badge> : <Badge tone={cls.lessonPlan === "checked" ? "ok" : "info"}>{LESSON_PLAN_LABEL[cls.lessonPlan]}</Badge>}
        </div>
        {cls.blocks.length === 0 ? (
          <p className="admin-hint">No plan yet. The instructor writes each class&apos;s plan, ahead of it or after the fact.</p>
        ) : (
          <ol>
            {cls.blocks.map((b, i) => (
              <li key={i}>
                {b.text} <span className="admin-cell-muted">· {b.side} · {b.minutes} min</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="admin-card admin-section-card" aria-label="Recap">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Recap</h2>
          {cls.recapState === "published" ? <Badge tone="ok">Published</Badge> : cls.recapState === "drafted" ? <Badge tone="warn">Draft, not yet published</Badge> : null}
        </div>
        {!cls.recap ? (
          <p className="admin-hint">{cls.held ? "Claude drafts the recap from the transcript once there is one." : "Written after the class, from its transcript."}</p>
        ) : (
          <dl className="admin-kv">
            <dt>Homework suggestion</dt>
            <dd>{cls.recap.homework_suggestion || <span className="admin-cell-muted">None</span>}</dd>
            {cls.recap.learners.map((l) => (
              <Fragment key={l.person_id}>
                <dt>{nameOf.get(l.person_id) ?? "A learner"}</dt>
                <dd>{l.md}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </section>

      <section className="admin-card admin-section-card" aria-label="Feedback">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Feedback</h2>
          <Badge tone="neutral">Instructor and admins only</Badge>
        </div>
        <p className="admin-hint">Claude&apos;s evaluation of each learner&apos;s English from the transcript, and the instructor&apos;s feedback. The learner sees neither.</p>
        {cls.feedback.length === 0 ? (
          <div className="admin-empty">No evaluation or instructor feedback on this class yet.</div>
        ) : (
          <div className="admin-list">
            {cls.feedback.map((f) => (
              <div key={f.personId} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{f.name}</div>
                  <span className="admin-label u-mt-2">AI feedback</span>
                  {f.evaluation ? <EnglishEvaluation evaluation={f.evaluation} evaluatedAt={f.evaluatedAt} /> : <p className="admin-list-sub">Not evaluated.</p>}
                  <span className="admin-label u-mt-3">Instructor feedback</span>
                  {f.feedback ? (
                    <p>
                      {f.feedback}
                      <span className="admin-list-sub">{` · ${f.feedbackByName ?? "The instructor"}${f.feedbackAt ? `, ${formatDate(f.feedbackAt)}` : ""}`}</span>
                    </p>
                  ) : (
                    <p className="admin-list-sub">None written.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
