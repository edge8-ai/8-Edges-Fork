// /team/my-training (TR.1, TR.2, TR.3): everything the reader does to get better
// at their work. The Cool-down tray asks for their word on trainings that have
// started, whether they went and how it landed; the certification tracks
// follow; then what is coming up and the log, where an answer can change for
// seven days, and the outcomes the reader records under it (TR.6). The training block (TR.12) opens the page: the last eight weeks against the reader's own usual week, the goal they set, and their shelf. A programme the reader is on (TR.5) shows its brief read-only, how it is landing (TR.7), and what its organiser changed because of the reviews (TR.8).
// Under the block sits the personal read (TR.10), written when the reader opens it.
// The page is the reader's own and nobody else's (ADR 0016).
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import type { BadgeDropsSlot } from "@/entities/ladders";
import { myCertificationRead } from "@/entities/training/lib/my-training-read";
import { shelf, trainingBlock } from "@/entities/training/lib/training-block";
import { myWeeklyGoal } from "@/entities/training/lib/weekly-goal";
import { myPlans } from "@/entities/training/lib/plan-read";
import { myPlanReads } from "@/entities/training/lib/programme-read";
import { notesForPlans } from "@/entities/training/lib/change-notes";
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
import { TrainingBlock } from "@/entities/training/ui/TrainingBlock";
import { ProgrammeBlock } from "@/entities/training/ui/ProgrammeBlock";
import { NeedsYou, type AttendanceToConfirm } from "@/entities/training/ui/NeedsYou";
import { MyNotes } from "@/entities/training/ui/MyNotes";
import { NextSessions, PastSessions } from "@/entities/training/ui/ProgrammeSessions";
import { myProgramme } from "@/entities/training/lib/my-session";
import { myHomework } from "@/entities/training/lib/assignments";
import { myNotes } from "@/entities/training/lib/learner-notes";
import { myOutcomes } from "@/entities/training/lib/outcomes";
import { creditOptions } from "@/entities/training/lib/outcome-options";
import { Outcomes } from "@/entities/training/ui/Outcomes";
import { PersonalRead } from "@/entities/training/ui/PersonalRead";
import { writeMyRead } from "@/entities/training/lib/personal-read";
import { readSince, reviewsSoFar } from "@/entities/training/lib/personal-read-rules";
import type { WorkDatesSlot } from "@/kernel/shell/work-signals";
import { acceptMySuggestion, answerMyTraining, confirmAttendance, dismissMySuggestion, editMyOutcome, logMyTraining, openMySubmission, recordMyOutcome, removeMyOutcome, removeMyReview, reviewMyTraining, setMyWeeklyGoal, startHomeworkUpload, submitHomework } from "./actions";

export const metadata = { title: "My Training", description: "Everything you do to get better at your work." };

export default async function MyTrainingPage(props: { badgeDrops: BadgeDropsSlot; finishedCardDates: WorkDatesSlot; mergedPullRequestDates: WorkDatesSlot; searchParams: Promise<{ read?: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const now = new Date();
  // The personal read (TR.10) is written only when the address asks for it, so
  // opening is the one thing that spends a model call.
  const readAsked = (await props.searchParams).read === "open";
  // The last read is the reader's own badge drop (LD.7b): a badge a session
  // hosted or a review written just found is one quiet line above the page,
  // from ladders through the page slot; nothing when ladders is not installed.
  const [{ tracks, awards }, rows, types, plans, homework, notes, programme, outcomes, goal, drop] = await Promise.all([myCertificationRead(actor.personId), myTrainingRows(actor.personId), listTypes(), myPlans(actor.personId), myHomework(actor.personId), myNotes(actor.personId), myProgramme(actor.personId, now), myOutcomes(actor.personId), myWeeklyGoal(actor.personId), props.badgeDrops ? props.badgeDrops({ personId: actor.personId }, "training") : null]);
  // How each plan the reader is on is landing (TR.7): the plan's own slice, under the three-reviewer rule.
  const planReads = Object.fromEntries(await myPlanReads({ personId: actor.personId, may: (permission, target) => access.may(permission, target) }, plans.map((p) => p.id), now));
  // What each plan's organiser changed because of the reviews (TR.8): myPlans
  // found only plans open to the reader, so only their notes are read.
  const planChanges = Object.fromEntries(await notesForPlans(plans.map((p) => p.id)));
  const { waiting, comingUp, log } = coolDown(rows, now);
  // A row the transcript set waits for the reader's confirmation (PR 4); the rest of the tray stays as it was.
  const toConfirm: AttendanceToConfirm[] = waiting.filter((r) => r.source === "transcript" && (r.status === "attended" || r.status === "absent")).map((r) => ({ trainingId: r.trainingId, title: r.title, startsAt: r.startsAt, endsAt: r.endsAt, status: r.status as "attended" | "absent" }));
  const tray = waiting.filter((r) => r.source !== "transcript");
  const dueHomework = homework.filter((h) => !h.submission || new Date(h.assignment.dueAt).getTime() > now.getTime());
  const actions = { answer: answerMyTraining, review: reviewMyTraining, remove: removeMyReview };
  const outcomeActions = { record: recordMyOutcome, edit: editMyOutcome, remove: removeMyOutcome, accept: acceptMySuggestion, dismiss: dismissMySuggestion };
  // A member with only outcomes (a certificate offered, nothing else yet) still gets the page, not the empty state.
  const nothing = !PROGRAMME && rows.length === 0 && plans.length === 0 && homework.length === 0 && outcomes.accepted.length === 0 && outcomes.waiting.length === 0;
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
            {/* The training block (TR.12): eight weeks, the goal, the shelf. */}
            <TrainingBlock view={trainingBlock(rows, goal, now)} shelf={shelf(rows, types, awards)} goal={goal} setGoal={setMyWeeklyGoal} />
            {/* The personal read (TR.10): the reader's alone, written when they open it and never stored. */}
            <PersonalRead
              reviews={reviewsSoFar(rows, now)}
              asked={readAsked}
              hasWork={props.finishedCardDates !== null || props.mergedPullRequestDates !== null}
              write={() =>
                writeMyRead(async () => {
                  const since = readSince(now);
                  const [finishedCards, mergedPullRequests] = await Promise.all([props.finishedCardDates?.(actor.personId, since) ?? null, props.mergedPullRequestDates?.(actor.personId, since) ?? null]);
                  return { rows, outcomes: outcomes.accepted, plans, finishedCards, mergedPullRequests, now };
                })
              }
            />
            <NeedsYou homework={dueHomework} attendance={toConfirm} actions={{ startUpload: startHomeworkUpload, submit: submitHomework, confirm: confirmAttendance, open: openMySubmission }} />
            <CoolDown rows={tray.map((r) => wordView(r, now))} actions={actions} />
            <NextSessions sessions={programme.next} />
            <MyNotes notes={notes} />
            <ProgrammeBlock plans={plans} reads={planReads} changes={planChanges} now={now} />
            {PROGRAMME && <CertificationTracks tracks={tracks} />}
            <ComingUp rows={comingUp.filter((r) => !programme.next.some((n) => n.id === r.trainingId))} />
            <PastSessions sessions={programme.past} />
            <TrainingLog rows={log.map((r) => wordView(r, now))} actions={actions} />
            <Outcomes accepted={outcomes.accepted} waiting={outcomes.waiting} options={creditOptions(rows, plans, now)} today={saigonToday()} actions={outcomeActions} />
          </WordFocusProvider>
        )}
      </div>
    </>
  );
}
