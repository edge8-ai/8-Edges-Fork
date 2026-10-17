import { SUBJECT_COMMITMENT, selectTasks } from "@/entities/boards";
import { selectTimeOff } from "@/entities/time-off";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { saigonToday } from "@/kernel/config/dates";
import { suggestCommitmentKept } from "@/entities/coaching/lib/board-subscriptions";
import { moveOneOnOnesOffLeave } from "@/entities/coaching/lib/leave-subscriptions";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 21 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Coaching backstops",
  description: "Nightly at 04:00 Vietnam time. Repeats what coaching does when a commitment's card is done or a holiday is approved, for any event the in-process bus did not deliver: stamps the card-done suggestion and moves 1-1s off approved leave. Both are no-ops when the event already landed.",
  content: ["Workboard cards", "Coaching commitments", "Time off", "1-1 bookings"],
  apps: ["Supabase"],
};

// Vercel cron: nightly at 21:00 UTC. The event bus is at-most-once: a handler
// that throws, or a publish from a function that died mid-request, leaves its
// effect undone, and nothing retries it (Y.47, decision Y.83). Coaching has two
// subscribers whose effect a person would miss, so this sweep repeats them
// from the facts in the tables. Both handlers are idempotent: the card stamp
// only lands on a commitment not yet stamped, kept or dropped, and the leave
// move only touches bookings still inside an approved span.

const ROUTINE_ID = "/api/cron/coaching-backstops/";

type Failure = { subject: string; step: string; error: string };

async function handler(): Promise<Response> {
  const failures: Failure[] = [];

  // 1. board.card.completed: every done card linked to a commitment.
  const { data: cards, error: cardsError } = await selectTasks("id, subject_id")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .eq("status", "done");
  if (cardsError) failures.push({ subject: "workboard cards", step: "read", error: cardsError.message });
  let cardsChecked = 0;
  for (const card of (cards ?? []) as { id: string; subject_id: string | null }[]) {
    if (!card.subject_id) continue;
    cardsChecked += 1;
    try {
      await suggestCommitmentKept({ taskId: card.id, boardSlug: "", subjectType: SUBJECT_COMMITMENT, subjectId: card.subject_id });
    } catch (err) {
      failures.push({ subject: `card ${card.id}`, step: "card-done stamp", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 2. leave.approved: every approved leave that has not ended yet.
  const { data: leaves, error: leavesError } = await selectTimeOff("id, team_member_id, start_date, end_date, leave_type")
    .eq("status", "approved")
    .gte("end_date", saigonToday());
  if (leavesError) failures.push({ subject: "time off", step: "read", error: leavesError.message });
  let leavesChecked = 0;
  for (const leave of (leaves ?? []) as { id: string; team_member_id: string | null; start_date: string; end_date: string; leave_type: string }[]) {
    if (!leave.team_member_id) continue;
    leavesChecked += 1;
    try {
      await moveOneOnOnesOffLeave({
        requestId: leave.id,
        teamMemberId: leave.team_member_id,
        startDate: leave.start_date,
        endDate: leave.end_date,
        leaveType: leave.leave_type,
      } as Parameters<typeof moveOneOnOnesOffLeave>[0]);
    } catch (err) {
      failures.push({ subject: `leave ${leave.id}`, step: "move 1-1s", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return routineResult({ status: "ok", cardsChecked, leavesChecked, failures });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
