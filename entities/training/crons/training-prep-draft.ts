import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { publish } from "@/kernel/events";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { sessionsOnDay } from "@/entities/training/lib/session-day";
import { draftAndSave } from "@/entities/training/lib/prep-draft";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 2 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training prep draft",
  description: "Daily at 09:00 Vietnam time. For every plan session starting tomorrow that has no session plan yet, drafts the blocks with Claude from the programme philosophy, the last plans, the last recap, the teacher's learner notes and the exercise library, and tells the organiser in the Inbox to check it. At most ten sessions a run.",
  content: ["Training plans", "Session plans", "Exercise library", "Learner notes"],
  apps: ["Supabase", "Claude"],
};

// Vercel cron: daily at 02:00 UTC, 09:00 in Vietnam, the morning before. One
// Claude call per session, bounded to ten a run so a long backlog can never
// run past the route's ceiling; what is left is picked up tomorrow, when it is
// no longer tomorrow's session and the organiser drafts it by hand. A session
// already drafted or checked is left alone, so running twice drafts nothing twice.
const ROUTINE_ID = "/api/cron/training-prep-draft/";
const MAX_PER_RUN = 10;

async function handler(): Promise<Response> {
  const now = new Date();
  const tomorrow = addDays(saigonToday(), 1);
  const sessions = (await sessionsOnDay(tomorrow)).filter((s) => s.planState === "none").slice(0, MAX_PER_RUN);
  const failures: { subject: string; step: string; error: string }[] = [];
  let drafted = 0;
  for (const s of sessions) {
    const res = await draftAndSave(s.organiserId, s.id, now);
    if (!res.ok) {
      failures.push({ subject: `session ${s.id}`, step: "draft", error: res.error });
      continue;
    }
    drafted += 1;
    await publish("training.prep.drafted", { trainingId: s.id, organiserId: s.organiserId, title: s.title, startsAt: s.startsAt });
  }
  return routineResult({ status: "ok", candidates: sessions.length, drafted, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
