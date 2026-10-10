// Team Coaching Cycle AI generators (docs/plans/2026-07-25-team-coaching-cycle.md).
// Four generators for the biweekly loop: prep before the meeting, the two-tier
// summary + commitment extraction after it, the mid-cycle check-in nudge, and
// the monthly trend report. Same shape as lib/ai/idea-plan.ts: fail-soft
// (ai_error on the row, never throws to the caller), structured output where
// the result is written to more than one field.
//
// AUTHORIZATION IS THE CALLER'S JOB. Callers are coach-gated server actions
// (which asserted profile/meeting ownership via lib/coaching/data.ts) and the
// bearer-authed cron. Everything here runs on the service-role client.
//
// The coach's voice comes from coaching_context: the foundation documents
// (leadership brand, coaching profile, EQ guide, communication style),
// company context, and company goals, loaded per coach (coach_id = the
// profile's coach, plus company-wide rows where coach_id is null).

import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt, type Prompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { readStructuredOutput, readTextOutput } from "@/kernel/ai/response";
import { one } from "@/kernel/config/embedded";
import { SUMMARY_SCHEMA, coachingSummaryOutput } from "./prompts";
import { COACHING_PREP_PROMPT, COACHING_SUMMARY_PROMPT, COACHING_TREND_PROMPT } from "./ai.prompt";
import { MAX_PREP_BULLETS, shapePrep } from "./prep";
import {
  MAX_DOC_CHARS,
  clip,
  loadProfileContext,
  prepContext,
  recapContext,
  trendContext,
  howIWorkBlock,
  personBlock,
  recapLanguageLine, transcriptHash, transcriptOf, type TranscriptCarrier,
} from "./ai-context";

// One usage site name per call, so the cost line names the call that made it:
// `modelFor` keys the model and the env override off the name the usage line is
// logged under (K.12). The prep summarises what it is handed in full, so it runs
// standard (K.4); the recap keeps deep. All three read one person's 1-1s and
// goals, so all three are class S: the official Anthropic API only.
export const COACHING_PREP_CLASS: AiDataClass = "S";
export const COACHING_TEXT_CLASS: AiDataClass = "S";
export const COACHING_SUMMARY_CLASS: AiDataClass = "S";
const SITES = {
  "coaching-prep": aiSite({ site: "coaching-prep", dataClass: COACHING_PREP_CLASS, tier: "standard" }),
  "coaching-text": aiSite({ site: "coaching-text", dataClass: COACHING_TEXT_CLASS, tier: "deep" }),
  "coaching-summary": aiSite({ site: "coaching-summary", dataClass: COACHING_SUMMARY_CLASS, tier: "deep" }),
} as const;
const SITE_MODELS = {
  "coaching-prep": SITES["coaching-prep"].model,
  "coaching-text": SITES["coaching-text"].model,
  "coaching-summary": SITES["coaching-summary"].model,
} as const;

const MAX_TRANSCRIPT_CHARS = 150_000; // clamp: one transcript must not flood the window.
// Ten bullets of one or two sentences each; the cap is what keeps a prep short
// when the prompt alone does not.
const MAX_PREP_TOKENS = 800;

type Ok = { ok: true };
type Err = { ok: false; error: string };

// Every generator records its failure on the meeting row before returning, so the
// screen can show why the last run failed. The update's own error cannot reach
// the caller (the generator's error is the one that matters), so it is logged.
async function failMeeting(meetingId: string, error: string): Promise<Err> {
  const { error: updateError } = await companyOs
    .from("coaching_one_on_ones")
    .update({ ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (updateError) {
    console.error("[coaching] failed to record ai_error", meetingId, updateError.message);
  }
  return { ok: false, error };
}

// `system` is the prompt's system text as rendered; the prompt itself goes with
// the request so the call is recorded under its version.
async function textCompletion(site: keyof typeof SITES, prompt: Prompt, system: string, user: string, maxTokens: number): Promise<string> {
  const anthropic = SITES[site].clientIfConfigured();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = SITE_MODELS[site];
  const response = await anthropic.messages.create({
    prompt,
    model,
    max_tokens: maxTokens,
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const out = readTextOutput(site, model, response);
  if (!out.ok) throw new Error(out.error);
  return out.text.trim();
}

// ---- 1) prep (Friday before the meeting) ------------------------------------

export type PrepResult = { ok: true; markdown: string; sharedMarkdown: string } | Err;

export async function generatePrep(meetingId: string): Promise<PrepResult> {
  try {
    const { data: meeting, error: prepMeetingError } = await companyOs
      .from("coaching_one_on_ones")
      .select("id, coaching_profile_id, held_on")
      .eq("id", meetingId)
      .is("archived_at", null)
      .maybeSingle();
    if (prepMeetingError) console.error("[coaching-ai] coaching_one_on_ones", prepMeetingError);
    if (!meeting) return { ok: false, error: "Meeting not found." };
    const m = meeting as { coaching_profile_id: string; held_on: string };

    const profile = await loadProfileContext(m.coaching_profile_id);
    if (!profile) return { ok: false, error: "Profile not found." };
    const { lastRecap, commitments, talkingPoints, goals, priorities, preMeeting } =
      await prepContext(profile);

    const raw = await textCompletion(
      "coaching-prep",
      COACHING_PREP_PROMPT,
      fillPrompt(COACHING_PREP_PROMPT.system, { maxBullets: MAX_PREP_BULLETS }),
      fillPrompt(COACHING_PREP_PROMPT.user, {
        preMeeting,
        person: `${profile.memberName}${profile.positionTitle ? `, ${profile.positionTitle}` : ""}`,
        howIWork: howIWorkBlock(profile.howIWork),
        goals,
        priorities,
        lastRecap,
        commitments,
        talkingPoints,
        heldOn: m.held_on,
        today: saigonToday(),
      }),
      MAX_PREP_TOKENS,
    );
    const shaped = shapePrep(raw);
    if (!shaped.coach) return failMeeting(meetingId, "The model returned no bullets.");

    const { error } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        prep_markdown: shaped.coach,
        prep_shared_markdown: shaped.member,
        prep_generated_at: new Date().toISOString(),
        ai_model: SITE_MODELS["coaching-prep"],
        ai_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetingId);
    if (error) return failMeeting(meetingId, error.message);
    return { ok: true, markdown: shaped.coach, sharedMarkdown: shaped.member };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] prep ${meetingId} failed:`, msg);
    return failMeeting(meetingId, msg);
  }
}

// ---- 2) summary + commitments (right after the meeting) ---------------------

export async function summarizeMeeting(meetingId: string): Promise<Ok | Err> {
  try {
    const anthropic = SITES["coaching-summary"].clientIfConfigured();
    if (!anthropic) return failMeeting(meetingId, "ANTHROPIC_API_KEY is not configured.");

    const { data: meeting, error: meetingError } = await companyOs
      .from("coaching_one_on_ones")
      .select(
        "id, coaching_profile_id, held_on, transcript_sha256, summary_markdown, prep_markdown, " +
          "linked_meeting:meetings!meeting_id(call_transcripts(transcript))",
      )
      .eq("id", meetingId)
      .is("archived_at", null)
      .maybeSingle();
    if (meetingError) console.error("[coaching-ai] coaching_one_on_ones", meetingError);
    if (!meeting) return { ok: false, error: "Meeting not found." };
    const m = meeting as unknown as TranscriptCarrier & {
      coaching_profile_id: string;
      held_on: string;
      transcript_sha256: string | null;
      summary_markdown: string | null;
      prep_markdown: string | null;
    };
    const transcript = transcriptOf(m);
    if (!transcript?.trim()) return { ok: false, error: "No transcript on this meeting yet." };

    // A re-run on an unchanged transcript is free: the stored hash is what the
    // summary already on the row was written from. Only a row that HAS a
    // summary short-circuits, or a failed run never gets its second chance.
    const hash = transcriptHash(transcript);
    if (m.transcript_sha256 === hash && m.summary_markdown?.trim()) {
      console.log(`[coaching-ai] summary ${meetingId} skipped: transcript unchanged.`);
      return { ok: true };
    }

    const profile = await loadProfileContext(m.coaching_profile_id);
    if (!profile) return { ok: false, error: "Profile not found." };
    const { docs, commitments, goals } = await recapContext(profile);

    const response = await anthropic.messages.create({
      prompt: COACHING_SUMMARY_PROMPT,
      model: SITE_MODELS["coaching-summary"],
      max_tokens: 8000,
      system: COACHING_SUMMARY_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      messages: [
        {
          role: "user",
          content: fillPrompt(COACHING_SUMMARY_PROMPT.user, {
            docs,
            person: personBlock(profile),
            recapLanguage: recapLanguageLine(profile),
            goals,
            commitments,
            prep: m.prep_markdown ? clip(m.prep_markdown, MAX_DOC_CHARS) : "(none)",
            heldOn: m.held_on,
            transcript: clip(transcript, MAX_TRANSCRIPT_CHARS),
          }),
        },
      ],
    });
    const out = readStructuredOutput("coaching-summary", SITE_MODELS["coaching-summary"], response, coachingSummaryOutput, "The model declined this transcript.");
    if (!out.ok) return failMeeting(meetingId, out.error);
    const parsed = out.data;
    if (!parsed.summary_markdown?.trim() || !parsed.shared_summary_markdown?.trim())
      return failMeeting(meetingId, "Model output was missing a summary tier.");

    // The AI's mode estimate lands only where the coach hasn't logged one —
    // a coach-entered split is never overwritten.
    const est = parsed.mode_split_estimate;
    const modePatch: Record<string, number> = {};
    const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;
    if (est && inRange(est.coach) && inRange(est.mentor) && inRange(est.direct) && est.coach + est.mentor + est.direct === 100) {
      const { data: current, error: currentError } = await companyOs
        .from("coaching_one_on_ones")
        .select("mode_coach_pct")
        .eq("id", meetingId)
        .maybeSingle();
      if (currentError) console.error("[coaching-ai] coaching_one_on_ones", currentError);
      if ((current as { mode_coach_pct: number | null } | null)?.mode_coach_pct == null) {
        modePatch.mode_coach_pct = est.coach;
        modePatch.mode_mentor_pct = est.mentor;
        modePatch.mode_direct_pct = est.direct;
      }
    }

    // The shared recap stays a DRAFT (shared_published_at untouched) — the
    // coach reviews and publishes explicitly.
    const { error: upErr } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        summary_markdown: parsed.summary_markdown,
        shared_summary_markdown: parsed.shared_summary_markdown,
        status: "held",
        transcript_sha256: hash,
        ai_model: SITE_MODELS["coaching-summary"],
        ai_error: null,
        updated_at: new Date().toISOString(),
        ...modePatch,
      })
      .eq("id", meetingId);
    if (upErr) return failMeeting(meetingId, upErr.message);

    // Insert extracted commitments once per meeting: re-running the summary
    // must not duplicate the ledger.
    const { data: existing, error: existingError } = await companyOs
      .from("coaching_commitments")
      .select("id")
      .eq("one_on_one_id", meetingId)
      .limit(1);
    if (existingError) console.error("[coaching-ai] coaching_commitments", existingError);
    if ((existing ?? []).length === 0 && parsed.commitments.length > 0) {
      const rows = parsed.commitments
        .filter((c) => c.title?.trim())
        .slice(0, 20)
        .map((c) => ({
          coaching_profile_id: m.coaching_profile_id,
          one_on_one_id: meetingId,
          title: c.title.trim().slice(0, 500),
          owner: c.owner === "coach" ? "coach" : "member",
          due_on: c.due_on && /^\d{4}-\d{2}-\d{2}$/.test(c.due_on) ? c.due_on : null,
        }));
      if (rows.length > 0) {
        const { error } = await companyOs.from("coaching_commitments").insert(rows);
        if (error) console.error("[coaching-ai] commitment insert failed:", error.message);
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] summary ${meetingId} failed:`, msg);
    return failMeeting(meetingId, msg);
  }
}

// ---- 4) monthly trend report ------------------------------------------------

export async function generateTrendReport(profileId: string): Promise<Ok | Err> {
  const profile = await loadProfileContext(profileId);
  if (!profile) return { ok: false, error: "Profile not found." };

  // The window is the last 3 held, summarized 1-1s (2 minimum: a trend needs at
  // least two points), NOT a calendar month.
  const { data: recent, error: recentError } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on, summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("summary_markdown", "is", null)
    .order("held_on", { ascending: false })
    .limit(3);
  if (recentError) console.error("[coaching-ai] coaching_one_on_ones", recentError);
  const meetings = ((recent ?? []) as Array<{ id: string; held_on: string; summary_markdown: string }>).reverse();
  if (meetings.length < 2) return { ok: false, error: "Need at least 2 summarized 1-1s to trend." };

  // Stored under the latest 1-1's month (the period CHECK is YYYY-MM and the
  // uniqueness is per period) and stamped with that 1-1's id: the daily cycle
  // keys its "already reported" check on the id, so a second 1-1 in one month
  // refreshes the report instead of finding the first one's row (B5).
  const latest = meetings[meetings.length - 1];
  const period = latest.held_on.slice(0, 7);
  // Returns the upsert's error message, or null. The stamp used to be fire-and-
  // forget, so a failed write left the report unsaved while the action still
  // reported success; the success path now surfaces the failure.
  const stamp = async (patch: Record<string, unknown>): Promise<string | null> => {
    const { error } = await companyOs
      .from("coaching_trends")
      .upsert({ coaching_profile_id: profileId, period, one_on_one_id: latest.id, ...patch }, { onConflict: "coaching_profile_id,period" });
    return error ? error.message : null;
  };

  try {
    const { docs, commitments, priorTrend, checkins, goals, modeHistory } = await trendContext(
      profile,
      period,
      meetings[0].held_on,
    );

    const meetingsBlock = meetings
      .map((m) => `<meeting held_on="${m.held_on}">\n${clip(m.summary_markdown, MAX_DOC_CHARS)}\n</meeting>`)
      .join("\n\n");

    const report = await textCompletion(
      "coaching-text",
      COACHING_TREND_PROMPT,
      COACHING_TREND_PROMPT.system,
      fillPrompt(COACHING_TREND_PROMPT.user, {
        docs,
        person: personBlock(profile),
        goals,
        modeHistory,
        count: meetings.length,
        meetings: meetingsBlock,
        commitments,
        checkins,
        priorTrend,
      }),
      8000,
    );

    const stampError = await stamp({ report_markdown: report, ai_model: SITE_MODELS["coaching-text"], ai_error: null });
    if (stampError) return { ok: false, error: stampError };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] trend ${profileId} failed:`, msg);
    const stampError = await stamp({ ai_error: msg.slice(0, 500) });
    if (stampError) console.error(`[coaching-ai] trend ${profileId} stamp failed:`, stampError);
    return { ok: false, error: msg };
  }
}
