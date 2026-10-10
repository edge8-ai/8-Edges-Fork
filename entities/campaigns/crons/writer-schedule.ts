import { NextResponse } from "next/server";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { notifyMarketing } from "@/kernel/messaging/lark";
import { startWriterRun } from "@/entities/campaigns/lib/writer/advance";
import { runWriterStepNow } from "@/entities/campaigns/lib/writer/run-step";
import { startsWithinWindow } from "@/entities/campaigns/lib/writer/schedule";
import { saigonToday } from "@/kernel/config/dates";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Writer schedule",
  description: "Hourly. Starts the writer on a campaign the day before its date, and re-arms a run that lost its hand-off between steps. Quiet unless it did something.",
  content: ["Marketing campaigns", "Blog assets"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron: daily at 00:00 UTC (07:00 Asia/Ho_Chi_Minh), before blog-publish.
// It starts writer runs so a campaign can go from idea to live post with
// nobody pressing a button after the idea is written: a campaign whose start
// date is tomorrow (or today, if yesterday was missed) and that has a brand, a
// written idea and no run yet gets its writer started here, the first step run
// in this request and the rest carried by the agent driver, one step per tick
// (Y.12). The post lands scheduled for its date, and the daily publish routine
// puts it live (see step-publish). A campaign whose blog is already scheduled
// or published is left alone: someone ran it. It used to re-arm runs whose
// HTTP hand-off had dropped; the driver has no hand-off to drop.
//
// Quiet when nothing is due; one ops message when it started anything, naming
// the campaigns.

const ROUTINE_ID = "/api/cron/writer-schedule/";

type CampaignRow = {
  id: string;
  name: string;
  brand_id: string | null;
  idea: string | null;
  starts_on: string | null;
  writer_step: string | null;
  writer_error: string | null;
  writer_started_at: string | null;
};

async function handler(): Promise<Response> {
  const { data, error } = await companyOs
    .from("marketing_campaigns")
    .select("id, name, brand_id, idea, starts_on, writer_step, writer_error, writer_started_at")
    .eq("status", "active");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const campaigns = (data ?? []) as CampaignRow[];

  const today = saigonToday();
  const started: string[] = [];
  const failed: string[] = [];
  const noticeFailures: { subject: string; step: string; error: string }[] = [];

  // Start runs for campaigns whose date has come round.
  const due = campaigns.filter(
    (c) => c.writer_step === null && c.writer_error === null && c.brand_id && c.idea?.trim() && startsWithinWindow(c.starts_on, today),
  );
  for (const c of due) {
    const { data: blog, error: blogError } = await companyOs
      .from("marketing_content")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("channel", "blog")
      .in("status", ["scheduled", "published"])
      .limit(1);
    if (blogError) {
      failed.push(`${c.name}: ${blogError.message}`);
      continue;
    }
    if (blog && blog.length > 0) continue;
    const begun = await startWriterRun(c.id);
    if (!begun.ok) {
      failed.push(`${c.name}: ${begun.error}`);
      continue;
    }
    const first = await runWriterStepNow(c.id);
    if ("skipped" in first) failed.push(`${c.name}: ${first.skipped}`);
    else if (!first.ok) failed.push(`${c.name}: ${first.error}`);
    else started.push(c.name);
  }

  if (started.length || failed.length) {
    const lines: string[] = [];
    if (started.length) lines.push(`Writer started on schedule: ${started.join(", ")}.`);
    if (failed.length) lines.push(`Writer could not start: ${failed.join("; ")}.`);
    // The chat post is best-effort — the publishing already happened and must
    // not be reported as failed — but a swallowed rejection is how a silent
    // webhook goes unnoticed for weeks, so it is named in the run log.
    const told = await notifyMarketing(lines.join("\n")).catch((err: unknown) => {
      console.error("[writer-schedule] marketing notification failed:", err instanceof Error ? err.message : String(err));
      return false;
    });
    if (!told) noticeFailures.push({ subject: "Marketing chat", step: "notify", error: "Lark did not accept the notice (LARK_MARKETING_WEBHOOK_URL)" });
  }

  // A campaign whose writer could not start names itself, as does a notice
  // Lark did not take; the kernel makes the run an error (Y.20).
  return routineResult({
    status: "ok",
    ok: true,
    checked: campaigns.length,
    started,
    failed,
    failures: [...failuresFrom(failed, "start writer", "writer schedule"), ...noticeFailures],
  });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
