import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { publish } from "@/kernel/events";
import { recordAudit } from "@/kernel/audit/audit";
import { draftAndSaveRecap } from "@/entities/training/lib/session-recap";
import { evaluateLesson } from "@/entities/training/lib/english-evaluation";
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
  description: "Hourly. Drafts the recap for one plan session that has a transcript and no recap yet, oldest first within 14 days: what the class covered, a line addressed to each learner who attended, a homework suggestion. Waits on the session as drafted until the organiser publishes it; the organiser is told in the Inbox. Then evaluates the English of each learner who spoke, from the same transcript, for the teacher and admins only.",
  content: ["Session transcripts", "Session plans", "Programme philosophy", "Session registers"],
  apps: ["Supabase", "Claude"],
};

// Vercel cron: hourly at :20. One training per run, deliberately: the recap
// is a deep-tier call over a long transcript, and two in one invocation could
// run past the route's ceiling. A session whose transcript has not landed is
// skipped, not failed; it is tried again next hour.
const ROUTINE_ID = "/api/cron/training-session-recap/";

type Row = { id: string; title: string; starts_at: string; organiser_id: string };

/** The lesson's English evaluation after its recap; how many learners it evaluated, 0 on a failure, which never throws. */
async function evaluateAfterRecap(s: Row, transcript: string, now: Date): Promise<number> {
  let error: string;
  try {
    const res = await evaluateLesson(s.organiser_id, s.id, transcript, now);
    if (res.ok) return res.evaluated;
    error = res.error;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  console.error(`[training] English evaluation failed for session ${s.id}: ${error}`);
  await recordAudit({ table: "training_learner_feedback", recordId: null, operation: "update", actor: "routine:training-session-recap", context: { action: "evaluate-english-failed", trainingId: s.id, error } });
  return 0;
}

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
    // Then each learner's English, from the same transcript (ADR 0016, amended
    // 2026-10-26). The recap has landed by now, so a failure here is logged
    // and audited and never fails it; the organiser can press Evaluate English.
    const evaluated = await evaluateAfterRecap(s, t.transcript, now);
    return routineResult({ status: "ok", drafted: 1, evaluated, pendingAfter: rows.length - 1 });
  }
  return routineResult({ status: "ok", drafted: 0, pendingAfter: 0 });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
