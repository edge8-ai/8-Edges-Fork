import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { publish } from "@/kernel/events";
import { draftAndSaveRecap } from "@/entities/training/lib/session-recap";
import { readSessionTranscript } from "@/entities/training/routes/team/(dashboard)/training/sessions/[id]/transcript-in";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "20 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training session recap",
  description: "Hourly. Drafts the recap for one plan session that has a transcript and no recap yet, oldest first within 14 days: what the class covered, a line addressed to each learner who attended, a homework suggestion. Waits on the session as drafted until the organiser publishes it; the organiser is told in the Inbox.",
  content: ["Session transcripts", "Session plans", "Programme philosophy"],
  apps: ["Supabase", "Claude"],
};

// Vercel cron: hourly at :20. One training per run, deliberately: the recap
// is a deep-tier call over a long transcript, and two in one invocation could
// run past the route's ceiling. A session whose transcript has not landed is
// skipped, not failed; it is tried again next hour.
const ROUTINE_ID = "/api/cron/training-session-recap/";

type Row = { id: string; title: string; starts_at: string; organiser_id: string };

async function handler(): Promise<Response> {
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60_000).toISOString();
  const rows = mustRows(
    await companyOs.from("trainings").select("id, title, starts_at, organiser_id").not("plan_id", "is", null).is("cancelled_at", null).eq("recap_state", "none").lte("ends_at", now.toISOString()).gte("ends_at", since).order("ends_at").limit(20),
    "[training] recap candidates",
  ) as Row[];
  for (const s of rows) {
    const t = await readSessionTranscript(s.id);
    if (!t?.transcript) continue;
    const res = await draftAndSaveRecap(s.organiser_id, s.id, t.transcript, now);
    if (!res.ok) return routineResult({ status: "ok", drafted: 0, failures: [{ subject: `session ${s.id}`, step: "recap", error: res.error }] });
    await publish("training.recap.drafted", { trainingId: s.id, organiserId: s.organiser_id, title: s.title, startsAt: s.starts_at });
    return routineResult({ status: "ok", drafted: 1, pendingAfter: rows.length - 1 });
  }
  return routineResult({ status: "ok", drafted: 0, pendingAfter: 0 });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
