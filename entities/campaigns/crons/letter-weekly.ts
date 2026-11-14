import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfileBySlug } from "@/entities/campaigns/lib/brand-profiles";
import { startLetterRun } from "@/entities/campaigns/lib/letter/advance";
import { runLetterStepNow } from "@/entities/campaigns/lib/letter/run-step";
import { LETTER_ACTOR } from "@/entities/campaigns/lib/letter/types";
import { SELF_BRAND_SLUG } from "@/kernel/config/brand";
import { mustRows } from "@/kernel/data/read";
import { nextLetterName } from "@/entities/campaigns/lib/broadcast-names";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 0 * * 1,4";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Letter agent: weekly",
  description: "Monday and Thursday 07:00 Ho Chi Minh City. Opens the next letter as a draft broadcast and starts the letter agent; the run builds the list, sends the approver a test and parks at ready on a send approval. Nothing sends until a person approves it; then it goes at the Tuesday or Friday 08:00 window unless cancelled first.",
  content: ["Email campaigns", "Events", "Meetings", "Journal (Notion)", "Blog assets"],
  apps: ["Supabase", "Notion", "Anthropic", "Resend", "Lark"],
};

// Vercel cron (see vercel.json): Monday and Thursday 00:00 UTC, 07:00 in Ho Chi
// Minh City. Opens the next letter as a draft broadcast for the house brand and
// starts the letter agent on it. When every check passes, the agent builds the
// list, asks for its send approval and stops at ready, and the Marketing chat
// hears where to approve it (decision Y.54). Once a person approves it on the
// broadcast page, the agent driver sends it at its window unless it is
// cancelled first (Y.17). If a letter the agent opened is still unsent, nothing
// new is opened.

const ROUTINE_ID = "/api/cron/letter-weekly/";
const BATCH_SIZE = 50;

async function handler(): Promise<Response> {
  const profile = await getBrandProfileBySlug(SELF_BRAND_SLUG);
  if (!profile) return NextResponse.json({ error: `Brand ${SELF_BRAND_SLUG} not found.` }, { status: 500 });

  const { data: waiting, error: waitingError } = await companyOs.from("email_campaigns").select("id, status")
    .in("status", ["draft", "approved", "sending"])
    .eq("created_by", LETTER_ACTOR)
    .limit(1);
  if (waitingError) return NextResponse.json({ error: waitingError.message }, { status: 500 });
  if (waiting && waiting.length > 0) return routineResult({ status: "skipped", reason: `A letter the agent opened is still ${waiting[0].status}.`, opened: false, waiting: waiting[0].id });

  // A failed read would restart the numbering at 01, so it stops the run.
  const used = mustRows(await companyOs.from("email_campaigns").select("name"), "letter-weekly email_campaigns names");
  const { data: created, error } = await companyOs.from("email_campaigns").insert({
      name: nextLetterName(used.map((r) => r.name)),
      subject: "Letter (the agent writes this)",
      body_md: "",
      status: "draft",
      brand_id: profile.brandId,
      batch_size: BATCH_SIZE,
      from_email: process.env.MARKETING_EMAIL_FROM ?? null,
      reply_to: process.env.MARKETING_REPLY_TO ?? null,
      created_by: LETTER_ACTOR,
    })
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "insert returned no row" }, { status: 500 });

  const started = await startLetterRun(created.id);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 500 });
  // The first step runs now under its own tick; the agent driver carries the rest.
  const first = await runLetterStepNow(created.id);
  // A first step that failed its checks names the letter it stopped; the step
  // also records its own run under its tick (Y.20).
  return routineResult({
    status: "ok",
    opened: true,
    campaign: created.id,
    first,
    failures: "ok" in first && !first.ok ? [{ subject: `letter ${created.id}`, step: first.step, error: first.error }] : [],
  });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
