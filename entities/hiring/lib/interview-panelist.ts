import { selectCoreValues } from "@/entities/org";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { AI_PANELIST_EMAIL, AI_PANELIST_NAME, DEFAULT_CRITERIA, recommendationToDb } from "@/entities/hiring/lib/interview-panel";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { insertPeople } from "@/kernel/identity/writes";
import { z } from "zod/v4";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { INTERVIEW_PANELIST_PROMPT } from "./interview-panelist.prompt";

// The AI interview panelist. Given one interview round with a transcript, it
// reads the transcript against the job, the resume screen, prior rounds, and the
// company core values, then writes a scorecard for the AI seat: a recommendation,
// per-criterion scores each backed by a verbatim quote, and a carry-forward block
// (what it confirmed, what is still open, questions for the next round). Mirrors
// lib/resume-screen.ts. Best-effort: it must never throw.

export const INTERVIEW_PANELIST_CLASS: AiDataClass = "S";
const AI = aiSite({ site: "interview-panelist", dataClass: INTERVIEW_PANELIST_CLASS, tier: "standard" });
const MODEL = AI.model;
const TRANSCRIPT_BUCKET = "meeting-transcripts";

type Ok = { ok: true };
type Err = { ok: false; error: string };

// The one schema. It generates the json_schema the model is asked for and
// validates the reply that comes back, so the two cannot drift (ADR 0006).
// The descriptions are prompt engineering, not documentation — the emitter
// carries them through to the model as `description`, which is why they are
// phrased at the model rather than at a reader.
//
// `zod/v4` is a subpath of the installed zod, not an upgrade; `jsonSchemaFor`
// only accepts v4 schema objects. No array here carries `.min(2+)` or
// `.max()`: the structured-output API 400s on those bounds.
export const panelistOutput = z.object({
  recommendation: z
    .enum(["advance", "hold", "reject"])
    .describe("advance = move to the next round or offer; hold = borderline, needs more signal; reject = do not proceed."),
  overall_score: z
    .number()
    .describe(
      "Overall read of the candidate in THIS round, 1.0 to 5.0 with one decimal. 5 = outstanding, 3 = solid with gaps, 1 = poor. Use the full range.",
    ),
  criteria: z
    .array(
      z.object({
        name: z.string().describe("The criterion name, exactly as given."),
        score: z
          .number()
          .nullable()
          .describe("1 to 5, or null if this round genuinely did not test this criterion. Never invent a score."),
        evidence: z
          .string()
          .describe(
            "A short verbatim quote from the transcript that justifies the score, with the speaker timestamp, e.g. 'one main agent can spin up a lot of agent' (08:10). If the criterion was not tested, say so in one line.",
          ),
        confidence: z
          .enum(["high", "low"])
          .describe("low when the supporting quote is garbled by transcription or the signal is thin."),
      }),
    )
    .describe("One entry per criterion you were asked to score. Score only from transcript evidence."),
  verified: z
    .array(z.string())
    .describe("What this round confirmed about the candidate, each tied to evidence. Empty if nothing was confirmed."),
  still_open: z
    .array(z.string())
    .describe("Claims or gaps this round did not resolve (e.g. a resume claim never probed). Empty if none."),
  next_round_questions: z
    .array(z.string())
    .describe("Concrete questions the next interviewer should ask to close the open items. Empty if this was the final round."),
  summary: z.string().describe("2-4 sentences: the overall read on the candidate from this round, in plain language."),
});

export const PANELIST_SCHEMA = jsonSchemaFor(panelistOutput);

type PanelistOutput = z.infer<typeof panelistOutput>;

// The AI panelist is a real people row so it can hold a scorecard like any human.
// Identified by a sentinel email; created on first use. (Mirrors the copy in
// interview-actions so the lib has no dependency on a server-action module.)
export async function ensureAiPanelist(): Promise<string> {
  const { data, error: lookupErr } = await companyOs.from("people").select("id").eq("email", AI_PANELIST_EMAIL).maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (data?.id) return data.id as string;
  const { data: created, error } = await insertPeople({
      full_name: AI_PANELIST_NAME,
      email: AI_PANELIST_EMAIL,
      is_team_member: false,
      do_not_contact: true,
      source: "system",
      metadata: { is_ai: true },
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create the AI panelist.");
  return created.id as string;
}

export async function scoreInterview(interviewId: string): Promise<Ok | Err> {
  try {
    return await runPanelist(interviewId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[interview-panelist] ${interviewId} failed:`, msg);
    return { ok: false, error: msg };
  }
}

async function runPanelist(interviewId: string): Promise<Ok | Err> {
  const llm = AI.clientIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

  // The round + its application + the job.
  const { data: iv, error: ivErr } = await companyOs.from("interviews").select("id, title, mode, created_at, application_id")
    .eq("id", interviewId)
    .maybeSingle();
  if (ivErr || !iv) return { ok: false, error: ivErr?.message ?? "Round not found." };

  const { data: app, error: appErr } = await companyOs.from("applications").select(`id, job_requisition_id, ai_summary, cover_letter, people!person_id ( ${NAME_COLUMNS} )`)
    .eq("id", iv.application_id)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Application not found." };
  const person = Array.isArray(app.people) ? app.people[0] : app.people;
  const candidateName = personName(person as NamedPerson | null, "the candidate");

  const transcript = await loadTranscript(interviewId);
  if (!transcript.ok) return transcript;

  const [reqRes, valuesRes, priorRes] = await Promise.all([
    companyOs.from("job_requisitions").select("title, requirements, responsibilities, full_jd")
      .eq("id", app.job_requisition_id)
      .maybeSingle(),
    selectCoreValues("title, description").order("sort_order", { ascending: true }),
    priorRounds(iv.application_id, iv.created_at as string),
  ]);
  const req = reqRes.data;

  const jd = [
    `Title: ${req?.title ?? "(untitled)"}`,
    req?.requirements && `\n## Requirements\n${req.requirements}`,
    req?.responsibilities && `\n## Responsibilities\n${req.responsibilities}`,
    req?.full_jd && `\n## Full job description\n${req.full_jd}`,
  ]
    .filter(Boolean)
    .join("\n");

  const values = (valuesRes.data ?? [])
    .map((v) => `- ${v.title as string}${v.description ? `: ${v.description as string}` : ""}`)
    .join("\n");

  const criteria = DEFAULT_CRITERIA.join(", ");

  // An optional section is its part, or nothing when the records have none.
  const { parts } = INTERVIEW_PANELIST_PROMPT;
  const userText = fillPrompt(INTERVIEW_PANELIST_PROMPT.user, {
    candidateName,
    roundTitle: iv.title ?? "Interview",
    roundMode: String(iv.mode),
    jd,
    values: values ? fillPrompt(parts.values, { values }) : "",
    resumeScreen: app.ai_summary ? fillPrompt(parts.resumeScreen, { resumeScreen: JSON.stringify(app.ai_summary) }) : "",
    priorRounds: priorRes ? fillPrompt(parts.priorRounds, { priorRounds: priorRes }) : "",
    criteria,
    transcript: transcript.text,
  });

  const response = await llm.messages.create({
    prompt: INTERVIEW_PANELIST_PROMPT,
    model: MODEL,
    // Standard tier: this runs via waitUntil on every transcript upload, so it
    // sits under the Haiku/Sonnet-for-operational-AI cost policy. Override with
    // INTERVIEW_CLAUDE_MODEL (or AI_MODEL_INTERVIEW_PANELIST) if a round needs more.
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: INTERVIEW_PANELIST_PROMPT.system,
    output_config: { format: { type: "json_schema", schema: PANELIST_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });

  const out = readStructuredOutput(
    "interview-panelist",
    MODEL,
    response,
    panelistOutput,
    "The model declined to score this interview.",
  );
  if (!out.ok) return { ok: false, error: out.error };
  return writeScorecard(interviewId, out.data);
}

// Persist the panelist output onto the AI seat: the scorecard row plus one
// score row per criterion. The carry-forward block is appended to the summary
// so the humans see it alongside the read. Re-runnable: replaces prior rows.
async function writeScorecard(interviewId: string, out: PanelistOutput): Promise<Ok | Err> {
  const aiId = await ensureAiPanelist();
  const overall = clampScore(out.overall_score);

  const summary = [
    out.summary.trim(),
    out.verified.length ? `\n\nVerified this round:\n${out.verified.map((v) => `• ${v}`).join("\n")}` : "",
    out.still_open.length ? `\n\nStill open:\n${out.still_open.map((v) => `• ${v}`).join("\n")}` : "",
    out.next_round_questions.length
      ? `\n\nSuggested next-round questions:\n${out.next_round_questions.map((v) => `• ${v}`).join("\n")}`
      : "",
  ].join("");

  const { data: sc, error: scErr } = await companyOs.from("interview_scorecards").upsert(
      {
        interview_id: interviewId,
        interviewer_id: aiId,
        recommendation: recommendationToDb(out.recommendation),
        overall_score: overall,
        summary,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id,interviewer_id" },
    )
    .select("id")
    .single();
  if (scErr || !sc) return { ok: false, error: scErr?.message ?? "Could not write the scorecard." };
  const scorecardId = sc.id as string;

  // Re-runs replace the score rows; if the clear-out fails, inserting on top
  // would double every criterion, so stop here instead.
  const { error: clearErr } = await companyOs.from("scorecard_scores").delete().eq("scorecard_id", scorecardId);
  if (clearErr) return { ok: false, error: clearErr.message };
  const rows = out.criteria
    .filter((c) => c.name.trim())
    .map((c, i) => ({
      scorecard_id: scorecardId,
      criterion: c.name.trim(),
      score: c.score == null ? null : clampScore(c.score),
      comment: [c.evidence?.trim(), c.confidence === "low" ? "(low confidence: transcription)" : ""]
        .filter(Boolean)
        .join(" "),
      position: i,
    }));
  if (rows.length > 0) {
    const { error: rowErr } = await companyOs.from("scorecard_scores").insert(rows);
    if (rowErr) return { ok: false, error: rowErr.message };
  }
  return { ok: true };
}

async function loadTranscript(interviewId: string): Promise<{ ok: true; text: string } | Err> {
  const { data: doc, error } = await companyOs
    .from("documents")
    .select("storage_path")
    .eq("entity_type", "interview")
    .eq("entity_id", interviewId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !doc?.storage_path) return { ok: false, error: "No transcript on file for this round." };
  const { data, error: dlErr } = await supabase.storage.from(TRANSCRIPT_BUCKET).download(doc.storage_path);
  if (dlErr || !data) return { ok: false, error: `Could not download transcript: ${dlErr?.message ?? "no data"}` };
  const text = Buffer.from(await data.arrayBuffer()).toString("utf8").trim();
  if (!text) return { ok: false, error: "Transcript is empty." };
  return { ok: true, text };
}

// Earlier rounds' scorecards (not full transcripts) give the panelist continuity
// without ballooning the prompt.
async function priorRounds(applicationId: string, createdAt: string): Promise<string> {
  const { data, error: priorErr } = await companyOs.from("interviews").select("title, created_at, interview_scorecards ( recommendation, overall_score, summary )")
    .eq("application_id", applicationId)
    .lt("created_at", createdAt)
    .order("created_at", { ascending: true });
  if (priorErr) console.error("[company-os/hiring] interviews", priorErr);
  if (!data || data.length === 0) return "";
  return data
    .map((r) => {
      const cards = (r.interview_scorecards ?? []) as Record<string, unknown>[];
      const lines = cards
        .map((c) => `  - ${c.recommendation ?? "?"} (${c.overall_score ?? "?"}/5): ${((c.summary as string) ?? "").slice(0, 300)}`)
        .join("\n");
      return `Round "${r.title ?? "Interview"}":\n${lines || "  (no scorecards)"}`;
    })
    .join("\n");
}

function clampScore(v: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 3;
  return Math.min(5, Math.max(1, Math.round(v * 10) / 10));
}
