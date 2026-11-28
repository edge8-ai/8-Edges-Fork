import { createHash } from "node:crypto";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { checkWaitingBlogs } from "@/entities/campaigns/lib/blog-live-check";
import { failureOf, notify, type NotifyResult } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
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
  name: "Blog live check",
  description: "Every 5 minutes. Asks the live URL of each published blog post that has not answered yet; marks it live once it does, and puts it back to its earlier status (a scheduled post to Approved) if it has not answered 15 minutes after publishing, telling the Revenue chat.",
  content: ["Blog assets"],
  apps: ["Supabase", "Lark"],
};

// Runs at every hour: a post nobody can read should stop counting as
// published whenever that turns out. The notice goes through the router,
// which holds it to the next working morning outside working hours.
async function handler() {
  const run = await checkWaitingBlogs();

  const failures = [...run.failures];
  if (run.putBack.length) {
    const lines = [
      `Put back ${run.putBack.length} blog post${run.putBack.length === 1 ? "" : "s"} that never went live:`,
      ...run.putBack.map((p) => `  • ${p.title} → ${p.backTo}: ${p.reason}`),
      "Publish again once the site serves it.",
    ];
    // One notice per put-back: the key names each post and the publish it
    // undid, so a retried run never repeats it and a later failed publish of
    // the same post is told again.
    const digest = createHash("sha256")
      .update(run.putBack.map((p) => `${p.id}:${p.publishedAt ?? ""}`).sort().join(","))
      .digest("hex")
      .slice(0, 16);
    const told: NotifyResult = await notify({
      kind: "revenue.blog-put-back",
      to: { chat: "revenue" },
      message: lines.join("\n"),
      dedupeKey: `campaigns:blog-live-check:${digest}`,
    }).catch((err: unknown) => ({ status: "failed" as const, error: err instanceof Error ? err.message : String(err) }));
    failures.push(...failureOf(told, "Marketing chat", "notify"));
  }

  return routineResult({
    status: "ok",
    ok: true,
    checked: run.checked,
    live: run.live.length,
    putBack: run.putBack.length,
    waiting: run.waiting,
    older: run.older,
    deferred: run.deferred,
    details: { live: run.live, putBack: run.putBack },
    failures,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/blog-live-check/", req, handler);
