// /team/my-training/sessions/[id] (English Program PR 8): one taught session
// as the reader sees it. Upcoming: what the class will do and the homework to
// bring. Past: what was covered and the reader's own recap line once the
// teacher published it, the materials, their submission, their attendance row
// with its source and the correction, and their ten-second review. A session
// the reader is not on is a 404. Nothing here is anyone else's (ADR 0016).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readMySession } from "@/entities/training/lib/my-session";
import { myTrainingRows } from "@/entities/training/lib/trainings";
import { whenLabel, wordView } from "@/entities/training/lib/training-format";
import { MySessionPage } from "@/entities/training/ui/MySessionPage";
import { answerMyTraining, confirmAttendance, openMySubmission, removeMyReview, reviewMyTraining, startHomeworkUpload, submitHomework } from "../../actions";

export const metadata = { title: "Session", description: "One session: what we did, your line, your homework." };

export default async function MySessionRoute(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const { id } = await props.params;
  const now = new Date();
  const [session, rows] = await Promise.all([readMySession(actor.personId, id), myTrainingRows(actor.personId)]);
  if (!session) notFound();
  const word = rows.find((r) => r.trainingId === id);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/team/my-training" className="tr-crumb">
            Me · My Training
          </Link>
        }
        title={whenLabel(session.startsAt, session.endsAt)}
        sub={`${session.title}${session.with.length ? ` · with ${session.with.join(", ")}` : ""} · taught by ${session.teacherName}`}
      />
      <div className="tr-page">
        <MySessionPage
          session={session}
          word={word ? wordView(word, now) : null}
          started={new Date(session.startsAt).getTime() <= now.getTime()}
          actions={{ startUpload: startHomeworkUpload, submit: submitHomework, confirm: confirmAttendance, open: openMySubmission, answer: answerMyTraining, review: reviewMyTraining, remove: removeMyReview }}
        />
      </div>
    </>
  );
}
