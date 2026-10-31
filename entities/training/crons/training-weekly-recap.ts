import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { publish } from "@/kernel/events";
import { notify } from "@/kernel/messaging/router";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { saigonToday } from "@/kernel/config/dates";
import { openRecaps, openWeek, tick } from "@/entities/training/lib/weekly-recap";
import { weekLabel, weekStartOf } from "@/entities/training/lib/weekly-recap-rules";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/10 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training weekly recap",
  description: "Every 10 minutes. On Fridays from 16:00 Vietnam time, opens one weekly recap per live plan that has recipients; every tick advances each open recap by one step: Claude drafts it from the programme philosophy, the week's published session recaps, attendance and homework (one model call per tick at most), it waits for the organiser to add, edit, send or hold it, and it goes by email to the plan's recipients on their send or at the Monday 08:00 deadline, logged to interactions. A failed send is retried; after three, the organiser is told.",
  content: ["Training plans", "Session recaps", "Attendance", "Homework submissions"],
  apps: ["Supabase", "Claude", "Resend", "Lark"],
};

// Vercel cron: every ten minutes, the tick driver for the weekly recap
// (ADR 0015): the step lives on the row, each tick does one step per row and
// at most one model call in all, so a tick can never run past the route's
// ceiling. Most ticks find nothing to do.
const ROUTINE_ID = "/api/cron/training-weekly-recap/";

async function organiserOf(planId: string): Promise<{ id: string; email: string | null; title: string; recipientIds: string[] } | null> {
  const rows = mustRows(await companyOs.from("training_plans").select("title, recipients, organiser:people!training_plans_organiser_id_fkey(id, email)").eq("id", planId).limit(1), "[training] plan organiser") as unknown as { title: string; recipients: unknown; organiser: { id: string; email: string | null } | null }[];
  const r = rows[0];
  const recipientIds = Array.isArray(r?.recipients) ? (r!.recipients as { person_id?: unknown }[]).flatMap((x) => (typeof x?.person_id === "string" ? [x.person_id] : [])) : [];
  return r?.organiser ? { id: r.organiser.id, email: r.organiser.email, title: r.title, recipientIds } : null;
}

async function handler(): Promise<Response> {
  const now = new Date();
  const today = saigonToday();
  // Friday from 16:00 Vietnam time (09:00 UTC): the week's rows exist from then on, created once.
  const friday = new Date(`${today}T00:00:00+07:00`).getUTCDay() === 5 && now.getUTCHours() >= 9;
  const opened = friday ? await openWeek(weekStartOf(today)) : { created: 0 };

  const rows = await openRecaps();
  let modelCalls = 0;
  const outcomes = [];
  const failures: { subject: string; step: string; error: string }[] = [];
  for (const row of rows) {
    if (row.step === "drafting" && modelCalls >= 1) continue;
    const out = await tick(row, now);
    if (out.modelCall) modelCalls += 1;
    outcomes.push(out);
    if (out.error && out.to !== "failed") failures.push({ subject: `recap ${row.planId} ${row.weekStart}`, step: row.step, error: out.error });
    if (out.to === "waiting") {
      const org = await organiserOf(row.planId);
      if (org) {
        await publish("training.weekly_recap.waiting", { planId: row.planId, planTitle: org.title, weekStart: row.weekStart, organiserId: org.id });
        if (org.email) {
          const origin = await getSiteOrigin();
          await notify({
            kind: "training.weekly-recap",
            to: { person: org.email },
            message: `The weekly recap of ${org.title} (${weekLabel(row.weekStart)}) is drafted. Add or edit by Monday 08:00, or send it now: ${origin}/team/training/plans/${row.planId}/weekly/${row.weekStart}`,
            dedupeKey: `training:weekly-recap:${row.id}`,
            category: "people_ops",
          });
        }
      }
    }
    if (out.to === "failed" && row.attempts + 1 >= 3) {
      const org = await organiserOf(row.planId);
      if (org) await publish("training.weekly_recap.held", { planId: row.planId, planTitle: org.title, weekStart: row.weekStart, organiserId: org.id, reason: `The email failed three times: ${out.error ?? "unknown error"}`, recipientPersonIds: org.recipientIds });
    }
  }
  return routineResult({ status: "ok", opened: opened.created, ticked: outcomes.length, modelCalls, outcomes, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
