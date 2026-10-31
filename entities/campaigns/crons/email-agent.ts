import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { listAgents } from "@/entities/campaigns/lib/personal/data";
import { runAgent, type RunSummary } from "@/entities/campaigns/lib/personal/run";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Personal email agent",
  description: "Hourly at half past. Runs every active personal email agent: the people due this tick get a message drafted from their facts and the agent's skill, held or drafted by its review mode, or skipped with the reason. Sending is the send cron's job.",
  content: ["Email agents", "People", "Personal messages"],
  apps: ["Supabase", "Anthropic"],
};

// Vercel cron (see vercel.json): hourly at half past. Runs every active
// personal email agent: the people due this tick get a message drafted from
// their facts and the agent's skill, held or drafted by the review mode, or
// skipped with the reason. A tick writes at most a handful per agent and
// stops well inside the function's time, so a large audience is worked
// through over several hours; a person is due once per cadence, so nothing is
// lost by waiting. Sending is the send cron's job (email-campaign-send).

const ROUTINE_ID = "/api/cron/email-agent/";
const PER_AGENT = 8;
const BUDGET_MS = 240_000;

async function handler(): Promise<Response> {
  const { rows, error } = await listAgents();
  if (error) return NextResponse.json({ error }, { status: 500 });
  const started = Date.now();
  const runs: RunSummary[] = [];
  for (const agent of rows.filter((a) => a.active)) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 30_000) break;
    runs.push(await runAgent(agent, { limit: PER_AGENT, budgetMs: left }));
  }
  const drafted = runs.reduce((n, r) => n + r.drafted.length, 0);
  const held = runs.reduce((n, r) => n + r.held.length, 0);
  const skipped = runs.reduce((n, r) => n + r.skipped.length, 0);
  const remaining = runs.reduce((n, r) => n + r.remaining, 0);
  const failed = runs.filter((r) => r.error);
  return NextResponse.json({
    agents: runs.length,
    drafted,
    held,
    skipped,
    remaining,
    runs,
    message: `${runs.length} agent${runs.length === 1 ? "" : "s"}: ${drafted} drafted, ${held} held, ${skipped} skipped, ${remaining} left for the next tick${failed.length ? `, ${failed.length} failed` : ""}.`,
    ...(failed.length ? { error: failed.map((r) => `${r.agentId}: ${r.error}`).join("; ") } : {}),
  });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
