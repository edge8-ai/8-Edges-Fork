import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { IDEA_OFFICES } from "@/entities/ideas/lib/ideas";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";
import { NAME_ONLY_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { IDEA_LEARNING_PROMPT, IDEA_PLAN_PROMPT } from "./idea-plan.prompt";

// Ideas Backlog generation, both kinds. Build ideas: reads the first four Ds
// of the 5D framework, asks Claude — writing as Dan Shipper — for a product
// plan and an office classification. Learnings ("What have I learned?"): a
// much lighter pass that polishes the raw story + takeaway into a short
// shareable write-up for the team feed. Both write to ai_plan on the idea row.
// Called from the /team submit actions and from admin retry — it must never
// throw. Same shape as lib/resume-screen.ts.

export const ADMIN_IDEA_PLAN_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "admin-idea-plan", dataClass: ADMIN_IDEA_PLAN_CLASS, tier: "standard" });
const MODEL = AI.model;

export const planOutput = z.object({
  office: z.enum(IDEA_OFFICES).describe("Which of the Four Outcomes this idea primarily drives, mapped to its office: increased revenue -> 'revenue'; higher-performing people (capability, performance, onboarding) -> 'talent'; cheaper operations (time, cost, error rate of a repeating process) -> 'operations'; valuable innovation (new capacity for work the team could not do before) -> 'innovation'. Pick exactly one."),
  plan_markdown: z.string().describe("The full product plan in Markdown. Sections, in order: a one-line pitch; 'The problem' (sharpened restatement); 'Program type' (Packaged AI, Automated Workflow, or Agentic Workflow, with one sentence on why, and what simpler type to start with if they picked too big); 'The workflow' (numbered steps from trigger to output, marking where AI does the work and where a human stays in the loop); 'Data it needs' (what information, where it lives, what is missing); 'FAST goal' (a Frequently discussed, Ambitious, Specific, Transparent goal with a real number and the ROI in plain terms); 'First slice' (the smallest version worth building in week one); 'Open questions' (2-4 things to resolve before building). Use ## headings. No preamble before the pitch line."),
});

const PLAN_SCHEMA = jsonSchemaFor(planOutput);

export const learningOutput = z.object({
  office: z.enum(IDEA_OFFICES).describe("Which of the Four Outcomes this learning most relates to, mapped to its office: increased revenue -> 'revenue'; higher-performing people -> 'talent'; cheaper operations -> 'operations'; valuable innovation -> 'innovation'. Pick exactly one."),
  summary_markdown: z.string().describe("The polished learning in Markdown, under 150 words total. Structure: a single bold takeaway line (the lesson, stated so a teammate could act on it); then '## What happened' (the story, tightened); then '## Try it yourself' (1-3 short bullets on how a teammate applies this). No preamble before the takeaway line."),
});

const LEARNING_SCHEMA = jsonSchemaFor(learningOutput);

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function markFailed(ideaId: string, error: string): Promise<Err> {
  await companyOs.from("ideas").update({ ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", ideaId);
  return { ok: false, error };
}

export async function generateIdeaPlan(ideaId: string): Promise<Ok | Err> {
  try {
    return await runGeneration(ideaId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-idea-plan] ${ideaId} failed:`, msg);
    return markFailed(ideaId, msg);
  }
}

async function runGeneration(ideaId: string): Promise<Ok | Err> {
  const llm = AI.clientIfConfigured();
  if (!llm) {
    return markFailed(ideaId, "ANTHROPIC_API_KEY is not configured.");
  }

  const { data: idea, error: ideaErr } = await companyOs.from("ideas").select(`id, kind, title, problem, data_needed, workflow, roi, story, takeaway, people:people!person_id(${NAME_ONLY_COLUMNS})`)
    .eq("id", ideaId)
    .maybeSingle();
  if (ideaErr || !idea) return markFailed(ideaId, ideaErr?.message ?? "Idea not found.");

  const personRaw = (idea as { people: NamedPerson | NamedPerson[] | null }).people;
  const person = Array.isArray(personRaw) ? personRaw[0] ?? null : personRaw;
  // The name goes to the model, so it is read without the email: a submitter
  // with no name is "an Edge8 team member", never their address (S.16.10).
  const submitter = personName(person && { ...person, email: null }, "an Edge8 team member");

  const isLearning = idea.kind === "learning";
  // A null field renders as "null", as it did in the template literal this
  // replaced.
  const prompt = isLearning ? IDEA_LEARNING_PROMPT : IDEA_PLAN_PROMPT;
  const userMessage = isLearning
    ? fillPrompt(IDEA_LEARNING_PROMPT.user, {
        submitter,
        title: String(idea.title),
        story: String(idea.story),
        takeaway: String(idea.takeaway),
      })
    : fillPrompt(IDEA_PLAN_PROMPT.user, {
        submitter,
        title: String(idea.title),
        problem: String(idea.problem),
        dataNeeded: String(idea.data_needed),
        workflow: String(idea.workflow),
        roi: String(idea.roi),
      });

  const response = await llm.messages.create({
    prompt,
    model: MODEL,
    max_tokens: isLearning ? 2000 : 8000,
    system: prompt.system,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: isLearning ? LEARNING_SCHEMA : PLAN_SCHEMA },
    },
    messages: [{ role: "user", content: userMessage }],
  });

  const out = readStructuredOutput(
    "admin-idea-plan",
    MODEL,
    response,
    isLearning ? learningOutput : planOutput,
    "The model declined to generate a plan for this idea.",
  );
  if (!out.ok) return markFailed(ideaId, out.error);

  // Validated data is a union of the two branches; the code below reads the
  // field the branch it asked for supplies, so it is flattened once here.
  const parsed: { office: string; plan_markdown?: string; summary_markdown?: string } = out.data;
  const markdown = isLearning ? parsed.summary_markdown : parsed.plan_markdown;
  const office = (IDEA_OFFICES as readonly string[]).includes(parsed.office) ? parsed.office : null;
  if (!office || !markdown?.trim()) {
    return markFailed(ideaId, "Model output was missing the office or the plan.");
  }

  const { error: upErr } = await companyOs.from("ideas").update({
      office,
      ai_plan: markdown,
      ai_model: MODEL,
      ai_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId);
  if (upErr) return markFailed(ideaId, upErr.message);

  return { ok: true };
}
