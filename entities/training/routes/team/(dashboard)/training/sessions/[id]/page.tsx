// /team/training/sessions/[id] (English Program PR 3): the organiser's working
// page for one session. The plan on the left: blocks drafted by Claude the
// morning before, edited here, marked checked. Materials for the learners.
// The homework and who handed it in, and attendance with its source and the
// organiser's correction (PR 4). The transcript, by pickup or by hand, with
// attendance read from it (PR 6). The recap to approve and publish (PR 7).
// Once held, the recording link and the lesson's summary at the top, and each
// learner's English evaluation and the teacher's feedback at the foot, which
// only the teacher and admins read (ADR 0016, amended 2026-10-26).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readSessionPlan } from "@/entities/training/lib/session-plan";
import { isTaughtSession, mayRunSession } from "@/entities/training/lib/taught-sessions";
import { homeworkStanding } from "@/entities/training/lib/homework-standing";
import { formParts, whenLabel } from "@/entities/training/lib/training-format";
import { WhenPanel } from "@/entities/training/ui/WhenPanel";
import { BlocksEditor } from "@/entities/training/ui/BlocksEditor";
import { HomeworkPanel } from "@/entities/training/ui/HomeworkPanel";
import { AttendancePanel } from "@/entities/training/ui/AttendancePanel";
import { sessionHomework } from "@/entities/training/lib/assignments";
import { businessDate } from "@/kernel/config/dates";
import { TranscriptPanel } from "@/entities/training/ui/TranscriptPanel";
import { RecapPanel } from "@/entities/training/ui/RecapPanel";
import { LessonSummary } from "@/entities/training/ui/LessonSummary";
import { LessonFeedbackPanel, type FeedbackLearner } from "@/entities/training/ui/LessonFeedbackPanel";
import { lessonFeedback } from "@/entities/training/lib/lesson-feedback";
import { readSessionTranscript } from "./transcript-in";
import { cancelTrainingAction, updateTrainingAction } from "../../actions";
import { addToNoteAction, evaluateEnglishAction, markCheckedAction, openSubmissionAction, publishRecapAction, redraftAction, saveBlocksAction, saveLearnerFeedbackAction, saveMaterialsAction, saveRecapAction, saveTranscriptAction, setAssignmentAction, setAttendanceAction, withdrawAssignmentAction } from "./actions";

export const metadata = { title: "Session", description: "One session's plan, materials and people." };

export default async function SessionPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013): training.host, which every
  // organiser holds and a Raid's Host holds through the implied Host role
  // (QS.5b). The atom opens the page; which session is decided after it: a
  // Host runs only a taught session they organise (mayRunSession), and the
  // loader finds only a session the reader organises.
  const access = await requirePermission("training.host");
  const actor = await requireTeamMember();
  const { id } = await props.params;
  if (!(await mayRunSession(access, actor.personId, id))) notFound();
  const now = new Date();
  const session = await readSessionPlan(actor.personId, id, now);
  if (!session) notFound();
  const organiser = access.may("training.organise");
  // Move and Cancel, for whoever runs this session, only before it starts: the
  // one time either is allowed (QS.5c). A Host moves the time alone; an
  // organiser's move keeps the title and notes, which their update always writes.
  // A Host runs only a taught session, which mayRunSession has already said this is; an organiser's may be any kind, so it is asked.
  const taught = session.state === "upcoming" && (organiser ? await isTaughtSession(session.id) : true);
  const when =
    session.state === "upcoming" ? (
      <WhenPanel sessionId={session.id} when={whenLabel(session.startsAt, session.endsAt)} parts={formParts(session.startsAt, session.endsAt)} keep={organiser ? { title: session.title, notes: session.notes } : null} taught={taught} leaveTo={organiser ? null : "/team/my-training"} actions={{ update: updateTrainingAction, cancel: cancelTrainingAction }} />
    ) : null;
  // A Host without training.organise runs the register here and nothing else:
  // the plan, homework, transcript and recap moves would refuse them, so they
  // are not drawn (ADR 0014), and neither are Training's lists in the crumb.
  if (!organiser) {
    return (
      <>
        <PageHead eyebrow={<span className="tr-crumb">My Team · Training</span>} title={whenLabel(session.startsAt, session.endsAt)} sub={`${session.title} · ${session.people.map((p) => p.name).join(", ") || "nobody yet"}${session.state === "cancelled" ? " · cancelled" : ""}`} />
        <div className="tr-page">
          {when}
          <AttendancePanel sessionId={session.id} people={session.people} started={session.state === "started"} set={setAttendanceAction} />
        </div>
      </>
    );
  }
  const [homework, set, transcript, feedback] = await Promise.all([
    session.planId ? homeworkStanding(session.planId, session.id, session.startsAt) : Promise.resolve([]),
    sessionHomework(session.id),
    readSessionTranscript(session.id),
    // The reader organises this session (readSessionPlan found it by organiser), so they may read its feedback (ADR 0016, amended 2026-10-26).
    session.state === "started" ? lessonFeedback(session.id) : Promise.resolve([]),
  ]);
  const byPerson = new Map(feedback.map((f) => [f.personId, f]));
  const learners: FeedbackLearner[] = session.people.map((p) => {
    const f = byPerson.get(p.id);
    return { id: p.id, name: p.name, attended: p.status === "attended", evaluation: f?.evaluation ?? null, evaluatedAt: f?.evaluatedAt ?? null, feedback: f?.feedback ?? null };
  });
  // Claude's homework suggestion rides with the reasoning until it is set (PR 3).
  const suggestion = session.planReasoning?.split("\n\nHomework suggestion: ")[1] ?? null;
  return (
    <>
      <PageHead
        eyebrow={
          session.planId ? (
            <Link href={`/team/training/plans/${session.planId}`} className="tr-crumb">
              My Team · Training · {session.planTitle ?? "Plan"}
            </Link>
          ) : (
            <Link href="/team/training" className="tr-crumb">
              My Team · Training
            </Link>
          )
        }
        title={whenLabel(session.startsAt, session.endsAt)}
        sub={`${session.title} · ${session.people.map((p) => p.name).join(", ") || "nobody yet"}${session.state === "cancelled" ? " · cancelled" : ""}`}
      />
      <div className="tr-page">
        {session.state === "started" && <LessonSummary recordingUrl={transcript?.recordingUrl ?? null} minutesUrl={transcript?.minutesUrl ?? null} summary={session.recap?.covered ?? null} recapState={session.recapState} held />}
        {when}
        <BlocksEditor
          session={{ id: session.id, startsAt: session.startsAt, endsAt: session.endsAt, state: session.state, mayEdit: session.mayEdit, planState: session.planState, planReasoning: session.planReasoning, materials: session.materials }}
          blocks={session.blocks}
          library={session.library.map((e) => ({ id: e.id, title: e.title, side: e.side, minutesMin: e.minutesMin, minutesMax: e.minutesMax }))}
          homework={homework}
          actions={{ save: saveBlocksAction, check: markCheckedAction, redraft: redraftAction, materials: saveMaterialsAction }}
        />
        <HomeworkPanel
          sessionId={session.id}
          homework={set}
          people={session.people}
          defaultDate={businessDate(new Date(new Date(session.endsAt).getTime() + 4 * 24 * 60 * 60_000))}
          suggestion={suggestion}
          mayEdit={session.state !== "cancelled"}
          actions={{ set: setAssignmentAction, withdraw: withdrawAssignmentAction, open: openSubmissionAction }}
        />
        {session.state === "started" && <TranscriptPanel sessionId={session.id} transcript={transcript} save={saveTranscriptAction} />}
        <AttendancePanel sessionId={session.id} people={session.people} started={session.state === "started"} set={setAttendanceAction} />
        {session.state === "started" && <RecapPanel sessionId={session.id} planId={session.planId} recap={session.recap} state={session.recapState} people={session.people} hasTranscript={Boolean(transcript?.transcript)} actions={{ save: saveRecapAction, publish: publishRecapAction, addToNote: addToNoteAction }} />}
        {session.state === "started" && <LessonFeedbackPanel sessionId={session.id} learners={learners} hasTranscript={Boolean(transcript?.transcript)} actions={{ evaluate: evaluateEnglishAction, save: saveLearnerFeedbackAction }} />}
      </div>
    </>
  );
}
