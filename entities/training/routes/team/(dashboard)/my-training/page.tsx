// /team/my-training (TR.1, TR.2, TR.3): everything the reader does to get better
// at their work. The Cool-down tray asks for their word on trainings that have
// started, whether they went and how it landed; the certification tracks
// follow; then what is coming up and the log, where an answer can change for
// seven days. A programme the reader is on (TR.5) shows its brief read-only.
// The page is the reader's own and nobody else's (ADR 0016).
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import type { BadgeDropsSlot } from "@/kernel/shell/page-slots";
import { myCertificationTracks } from "@/entities/training/lib/my-training-read";
import { myPlans } from "@/entities/training/lib/plan-read";
import { CERTIFICATION_PROGRAMME as PROGRAMME } from "@/entities/training/lib/certification-programme";
import { coolDown } from "@/entities/training/lib/training-rules";
import { listTypes, myTrainingRows } from "@/entities/training/lib/trainings";
import { wordView } from "@/entities/training/lib/training-format";
import { CertificationTracks } from "@/entities/training/ui/CertificationTracks";
import { CoolDown } from "@/entities/training/ui/CoolDown";
import { ComingUp } from "@/entities/training/ui/TrainingLists";
import { TrainingLog } from "@/entities/training/ui/TrainingLog";
import { WordFocusProvider } from "@/entities/training/ui/WordFocus";
import { LogTraining } from "@/entities/training/ui/LogTraining";
import { MyTrainingEmpty } from "@/entities/training/ui/MyTrainingEmpty";
import { ProgrammeBlock } from "@/entities/training/ui/ProgrammeBlock";
import { NeedsYou, type AttendanceToConfirm } from "@/entities/training/ui/NeedsYou";
import { MyNotes } from "@/entities/training/ui/MyNotes";
import { NextSessions, PastSessions } from "@/entities/training/ui/ProgrammeSessions";
import { myProgramme } from "@/entities/training/lib/my-session";
import { myHomework } from "@/entities/training/lib/assignments";
import { myNotes } from "@/entities/training/lib/learner-notes";
import { answerMyTraining, confirmAttendance, logMyTraining, openMySubmission, removeMyReview, reviewMyTraining, startHomeworkUpload, submitHomework } from "./actions";

export const metadata = { title: "My Training", description: "Everything you do to get better at your work." };

export default async function MyTrainingPage(props: { badgeDrops: BadgeDropsSlot }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const now = new Date();
  // The last read is the reader's own badge drop (LD.7b): a badge a session
  // hosted or a review written just found is one quiet line above the page,
  // from ladders through the page slot; nothing when ladders is not installed.
  const [tracks, rows, types, plans, homework, notes, programme, drop] = await Promise.all([myCertificationTracks(actor.personId), myTrainingRows(actor.personId), listTypes(), myPlans(actor.personId), myHomework(actor.personId), myNotes(actor.personId), myProgramme(actor.personId, now), props.badgeDrops ? props.badgeDrops({ personId: actor.personId }, "training") : null]);
  const { waiting, comingUp, log } = coolDown(rows, now);
  // A row the transcript set waits for the reader's confirmation (PR 4); the rest of the tray stays as it was.
  const toConfirm: AttendanceToConfirm[] = waiting.filter((r) => r.source === "transcript" && (r.status === "attended" || r.status === "absent")).map((r) => ({ trainingId: r.trainingId, title: r.title, startsAt: r.startsAt, endsAt: r.endsAt, status: r.status as "attended" | "absent" }));
  const tray = waiting.filter((r) => r.source !== "transcript");
  const dueHomework = homework.filter((h) => !h.submission || new Date(h.assignment.dueAt).getTime() > now.getTime());
  const actions = { answer: answerMyTraining, review: reviewMyTraining, remove: removeMyReview };
  const nothing = !PROGRAMME && rows.length === 0 && plans.length === 0 && homework.length === 0;
  return (
    <>
      <PageHead
        eyebrow="Me"
        title="My Training"
        sub="Certifications, courses and sessions."
        action={<LogTraining types={types.map((t) => ({ id: t.id, name: t.name }))} today={saigonToday()} log={logMyTraining} />}
      />
      <div className="tr-page">
        {drop}
        {nothing ? (
          <MyTrainingEmpty />
        ) : (
          // One provider over the tray and the log, so "I went after all" in the
          // log can open the review when the training lands in the tray.
          <WordFocusProvider>
            <NeedsYou homework={dueHomework} attendance={toConfirm} actions={{ startUpload: startHomeworkUpload, submit: submitHomework, confirm: confirmAttendance, open: openMySubmission }} />
            <CoolDown rows={tray.map((r) => wordView(r, now))} actions={actions} />
            <NextSessions sessions={programme.next} />
            <MyNotes notes={notes} />
            <ProgrammeBlock plans={plans} />
            {PROGRAMME && <CertificationTracks tracks={tracks} />}
            <ComingUp rows={comingUp.filter((r) => !programme.next.some((n) => n.id === r.trainingId))} />
            <PastSessions sessions={programme.past} />
            <TrainingLog rows={log.map((r) => wordView(r, now))} actions={actions} />
          </WordFocusProvider>
        )}
      </div>
    </>
  );
}
