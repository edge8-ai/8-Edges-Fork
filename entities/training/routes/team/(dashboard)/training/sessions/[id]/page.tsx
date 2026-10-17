// /team/training/sessions/[id] (English Program PR 3): the organiser's working
// page for one session. The plan on the left: blocks drafted by Claude the
// morning before, edited here, marked checked. Materials for the learners.
// The homework and who handed it in, and attendance with its source and the
// organiser's correction (PR 4). The transcript, by pickup or by hand, with
// attendance read from it (PR 6). The recap to approve and publish (PR 7).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readSessionPlan } from "@/entities/training/lib/session-plan";
import { homeworkStanding } from "@/entities/training/lib/homework-standing";
import { whenLabel } from "@/entities/training/lib/training-format";
import { BlocksEditor } from "@/entities/training/ui/BlocksEditor";
import { HomeworkPanel } from "@/entities/training/ui/HomeworkPanel";
import { AttendancePanel } from "@/entities/training/ui/AttendancePanel";
import { sessionHomework } from "@/entities/training/lib/assignments";
import { businessDate } from "@/kernel/config/dates";
import { TranscriptPanel } from "@/entities/training/ui/TranscriptPanel";
import { RecapPanel } from "@/entities/training/ui/RecapPanel";
import { readSessionTranscript } from "./transcript-in";
import { addToNoteAction, markCheckedAction, openSubmissionAction, publishRecapAction, redraftAction, saveBlocksAction, saveMaterialsAction, saveRecapAction, saveTranscriptAction, setAssignmentAction, setAttendanceAction, withdrawAssignmentAction } from "./actions";

export const metadata = { title: "Session", description: "One session's plan, materials and people." };

export default async function SessionPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const { id } = await props.params;
  const now = new Date();
  const session = await readSessionPlan(actor.personId, id, now);
  if (!session) notFound();
  const [homework, set, transcript] = await Promise.all([session.planId ? homeworkStanding(session.planId, session.id, session.startsAt) : Promise.resolve([]), sessionHomework(session.id), readSessionTranscript(session.id)]);
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
      </div>
    </>
  );
}
