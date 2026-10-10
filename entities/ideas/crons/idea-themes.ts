import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { generateIdeaTrends } from "@/entities/ideas/lib/ai/idea-trends";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator, so nothing
 * imports it.
 * @generator
 */
export const schedule = "0 23 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Idea themes",
  description: "Each morning. Claude groups the team's sparks into themes (We should build, We should learn) for /team/ideas and the Innovation cockpit; a theme needs sparks from two people.",
  content: ["Ideas and learnings"],
  apps: ["Supabase", "Claude"],
};

// Each morning, 06:00 Asia/Ho_Chi_Minh (W.189): Claude groups the team's sparks
// into themes and the routine stores one row in idea_trend_reports, which the
// themes on /team/ideas and the Innovation cockpit's "Trends across ideas" card
// both read. A morning with too few sparks, no key or a failed call writes
// nothing and says so: the last report stays, which is better than an empty
// section, and the run is marked skipped rather than ok.
async function handler() {
  const trends = await generateIdeaTrends();
  if (!trends) return routineResult({ status: "skipped", reason: "no themes this morning (too few sparks, no key, or the call failed)" });
  const { error } = await companyOs.from("idea_trend_reports").insert({
    themes: trends.themes,
    source_count: trends.sourceCount,
    model: trends.model,
  });
  if (error) return NextResponse.json({ error: `themes not stored: ${error.message}` }, { status: 500 });
  return routineResult({ status: "ok", themes: trends.themes.length, sparks: trends.sourceCount, model: trends.model });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/idea-themes/", req, handler, "vercel", { stepSeconds: 300 });
