import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { resumeContentBlock, withResumeBlock } from "@/entities/hiring/lib/resume-screen";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";
import { externalHref } from "@/kernel/ui/url";
import { RESUME_EXTRACT_PROMPT } from "./resume-extract.prompt";

// Resume field extraction for the recruiter add-candidates intake: reads an
// already-uploaded resume from the `resumes` bucket and asks Claude for the
// contact/profile fields, which prefill an editable draft — the recruiter
// always reviews before anything is saved. Distinct from the resume *screen*
// (fit rating), which runs later against a job requisition.

export const RESUME_EXTRACT_CLASS: AiDataClass = "S";
const AI = aiSite({ site: "resume-extract", dataClass: RESUME_EXTRACT_CLASS, tier: "fast" });
const MODEL = AI.model;

export type ExtractedCandidate = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  headline: string | null;
  current_title: string | null;
};

export const resumeExtractOutput = z.object({
  full_name: z.string().nullable().describe("The candidate's full name as written on the resume."),
  email: z.string().nullable().describe("The candidate's email address. null if none appears."),
  phone: z.string().nullable().describe("Phone number exactly as written, including country code if present. null if none appears."),
  linkedin_url: z.string().nullable().describe("Full LinkedIn profile URL (https://linkedin.com/in/…). Reconstruct from a bare handle like 'linkedin.com/in/x' if needed. null if none appears."),
  portfolio_url: z.string().nullable().describe("Personal site, portfolio, or GitHub URL — the single most representative one if several. null if none appears."),
  headline: z.string().nullable().describe("A one-line professional headline for this candidate, e.g. 'Senior Backend Engineer — Go, Kubernetes, 8 yrs'. Compose it from the resume; keep it under 90 characters."),
  current_title: z.string().nullable().describe("The candidate's current (most recent) job title as stated on the resume. null if unclear."),
});

const EXTRACT_SCHEMA = jsonSchemaFor(resumeExtractOutput);

type Ok = { ok: true; fields: ExtractedCandidate };
type Err = { ok: false; error: string };

export async function extractResumeFields(storagePath: string, mimeType: string | null): Promise<Ok | Err> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const resume = await resumeContentBlock(storagePath, mimeType);
    if (!resume.ok) return { ok: false, error: resume.error };

    const response = await withResumeBlock(resume, (block) => llm.messages.create({
      prompt: RESUME_EXTRACT_PROMPT,
      model: MODEL,
      max_tokens: 2000,
      system: RESUME_EXTRACT_PROMPT.system,
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [block, { type: "text", text: RESUME_EXTRACT_PROMPT.user }],
        },
      ],
    }));

    const out = readStructuredOutput(
      "resume-extract",
      MODEL,
      response,
      resumeExtractOutput,
      "The model declined to read this document.",
    );
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = out.data;
    const clean = (s: string | null) => (typeof s === "string" && s.trim() ? s.trim() : null);
    return {
      ok: true,
      fields: {
        full_name: clean(parsed.full_name),
        email: clean(parsed.email),
        phone: clean(parsed.phone),
        // The model can be steered by the document it reads, so a link it
        // returns pre-fills the form only when it is one.
        linkedin_url: externalHref(parsed.linkedin_url),
        portfolio_url: externalHref(parsed.portfolio_url),
        headline: clean(parsed.headline),
        current_title: clean(parsed.current_title),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resume-extract] ${storagePath} failed:`, msg);
    return { ok: false, error: msg };
  }
}
