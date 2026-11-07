import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { deliverOutbox } from "@/kernel/events/outbox";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs. A
 * kernel routine is in every deployment. Read as text by the generator.
 * @generator
 */
export const schedule = "*/5 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Event outbox",
  description: "Every five minutes. Announces each event a database function recorded in the outbox (a hire today) on the event bus, at least once: a claim older than five minutes is taken again, and an event that fails five times is left for a person and reported on every run.",
  content: ["Event outbox"],
  apps: ["Supabase"],
};

// Vercel cron: every five minutes. The outbox's drain (ADR 0027, A.86). An
// event whose fact a database function writes is put in company_os.event_outbox
// in the same transaction, and this publishes what is pending. It is the
// kernel's, not hiring's: until A.86 the only full sweep ran in the hiring
// driver, so a deployment without hiring drained nothing, and a second
// database function writing to the outbox would have depended on hiring being
// installed. A publisher that delivers its own row at once (the hiring chain's
// decision) still does; this is what catches the row it missed.

const ROUTINE_ID = "/api/cron/event-outbox/";

async function handler(): Promise<Response> {
  const outbox = await deliverOutbox();
  const idle = outbox.published === 0 && outbox.failed === 0 && outbox.exhausted === 0 && outbox.errors.length === 0;
  return routineResult({
    status: idle ? "skipped" : "ok",
    reason: idle ? "nothing in the outbox is pending" : undefined,
    published: outbox.published,
    failed: outbox.failed,
    exhausted: outbox.exhausted,
    failures: [
      ...outbox.errors.map((e) => ({ subject: "event_outbox", step: "deliver", error: e })),
      // A row out of attempts is never retried; it fails every run until a person looks.
      ...(outbox.exhausted > 0
        ? [{ subject: "event_outbox", step: "exhausted", error: `${outbox.exhausted} event(s) ran out of delivery attempts and are not retried; read company_os.event_outbox where published_at is null.` }]
        : []),
    ],
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
