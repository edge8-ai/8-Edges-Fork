import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { publish } from "@/kernel/events";
import { saigonToday } from "@/kernel/config/dates";
import { sessionsOnDay } from "@/entities/training/lib/session-day";
import { homeworkStanding } from "@/entities/training/lib/homework-standing";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 1 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training session reminder",
  description: "Daily at 08:00 Vietnam time. For every plan session today, tells the organiser in the Inbox with each learner's homework standing: submitted or not. The draft was yesterday; this is the nudge.",
  content: ["Training plans", "Homework submissions"],
  apps: ["Supabase"],
};

// Vercel cron: daily at 01:00 UTC, 08:00 in Vietnam. No model call; one inbox
// line per session, keyed on the session so a second run says nothing twice.
const ROUTINE_ID = "/api/cron/training-session-reminder/";

async function handler(): Promise<Response> {
  const sessions = await sessionsOnDay(saigonToday());
  for (const s of sessions) {
    const homework = await homeworkStanding(s.planId, s.id, s.startsAt);
    await publish("training.session.today", { trainingId: s.id, organiserId: s.organiserId, title: s.title, startsAt: s.startsAt, homework });
  }
  return routineResult({ status: "ok", sessions: sessions.length });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
