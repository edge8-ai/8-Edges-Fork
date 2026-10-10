import { resumeContentBlock, selectApplications, withResumeBlock } from "@/entities/hiring";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { FAMILY_BY_KEY, type FamilyScreen, type RoleFamilyKey } from "@/entities/team/lib/role-families";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { updateApplications } from "@/entities/hiring";
import { z } from "zod/v4";
import { FAMILY_SCREEN_PROMPT } from "./family-screen.prompt";

// Family AI screen: rates one application's resume against a role-family
// ideal profile (lib/role-families.ts) instead of a specific req's JD, so
// candidates across several reqs share one comparable 0-5 score. The result
// is stored at applications.metadata.family_screen — the per-req screen on
// the ai_* columns is never touched. Never throws.

export const FAMILY_SCREEN_CLASS: AiDataClass = "S";
const AI = aiSite({ site: "family-screen", dataClass: FAMILY_SCREEN_CLASS, tier: "standard" });
const MODEL = AI.model;

export const familyOutput = z.object({
  overview: z.string().describe("One tight paragraph: who the candidate is, years of experience, and their most relevant concrete accomplishments for this role family."),
  strengths: z.array(z.string()).describe("3-5 bullets tying the candidate's real experience to the ideal profile's key criteria."),
  gaps: z.array(z.string()).describe("1-3 bullets on the biggest gaps versus the ideal profile. Empty only for a truly exceptional match."),
  rating: z.number().describe("Fit against the role-family ideal profile, 0.0 to 5.0 with one decimal. 5 = exceptional on every criterion; 3 = solid with real gaps; 1 = poor fit. Use the full scale — this stack-ranks the whole talent pool."),
});

const FAMILY_SCHEMA = jsonSchemaFor(familyOutput);

type Ok = { ok: true; rating: number };
type Err = { ok: false; error: string };

export async function screenApplicationForFamily(
  applicationId: string,
  familyKey: RoleFamilyKey,
): Promise<Ok | Err> {
  try {
    return await runFamilyScreen(applicationId, familyKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[family-screen] ${applicationId} failed:`, msg);
    return { ok: false, error: msg };
  }
}

async function runFamilyScreen(applicationId: string, familyKey: RoleFamilyKey): Promise<Ok | Err> {
  const llm = AI.clientIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const family = FAMILY_BY_KEY[familyKey];
  if (!family) return { ok: false, error: `Unknown role family: ${familyKey}` };

  const { data: app, error: appErr } = await selectApplications("id, metadata, resume_document_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Application not found." };
  // hiring owns applications, so the read comes through its door and the row
  // shape is stated here rather than inferred from the column list.
  const application = app as { id: string; metadata: unknown; resume_document_id: string | null };
  if (!application.resume_document_id) return { ok: false, error: "No resume on file." };

  const { data: doc, error: docErr } = await companyOs
    .from("documents")
    .select("storage_path, mime_type")
    .eq("id", application.resume_document_id)
    .maybeSingle();
  if (docErr || !doc) return { ok: false, error: docErr?.message ?? "Resume document not found." };

  const document = doc as { storage_path: string; mime_type: string };
  // hiring owns the resumes bucket and how a resume reaches the model, including
  // the text fallback for a PDF the API refuses, so both screens read it one way.
  const resume = await resumeContentBlock(document.storage_path, document.mime_type);
  if (!resume.ok) return { ok: false, error: resume.error };

  const response = await withResumeBlock(resume, (block) => llm.messages.create({
    prompt: FAMILY_SCREEN_PROMPT,
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: FAMILY_SCREEN_PROMPT.system,
    output_config: { effort: "medium", format: { type: "json_schema", schema: FAMILY_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          block,
          {
            type: "text",
            text: fillPrompt(FAMILY_SCREEN_PROMPT.user, { familyLabel: family.label, familyProfile: family.profile }),
          },
        ],
      },
    ],
  }));

  const out = readStructuredOutput(
    "family-screen",
    MODEL,
    response,
    familyOutput,
    "The model declined to screen this document.",
  );
  if (!out.ok) return { ok: false, error: out.error };

  const parsed = out.data;
  const screen: FamilyScreen = {
    family: familyKey,
    rating: Math.min(5, Math.max(0, Math.round(parsed.rating * 10) / 10)),
    overview: parsed.overview,
    strengths: parsed.strengths,
    gaps: parsed.gaps,
    screened_at: new Date().toISOString(),
    model: MODEL,
  };

  const metadata = { ...((app.metadata as Record<string, unknown>) ?? {}), family_screen: screen };
  const { error: upErr } = await updateApplications({ metadata }).eq("id", applicationId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, rating: screen.rating };
}
