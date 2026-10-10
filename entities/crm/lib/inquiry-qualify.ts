import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fenceUntrusted, untrustedPreamble } from "@/kernel/ai/screen";
import { stripContacts, type QualifyInput } from "./inquiry-screen";
import { LEAD_QUALIFY_PROMPT } from "./inquiry-qualify.prompt";
import { NOT_STATED } from "./inquiry-triage-shapes";

// lead-qualify (Z.11, spec section 5): one read of one inquiry against the fit
// the contact page itself states. The model sees the screened input only
// (inquiry-screen.ts): the visitor's message with their name, address and
// phone masked, their company and team size, whether they wrote from a company
// domain, and how they arrived. It has no tools and no actions; its answer is a
// classification that the chain files, and the worst it can do is hold a real
// inquiry on the board (one click from restored) or show a low fit.
//
// Class C (decision 2): an outside person's business message and company is
// internal business content, and the input builder strips what would make it
// personal. Class C keeps Claude on api.anthropic.com and lets an open model
// run only through OpenRouter with data collection denied; Fable is refused.

export const LEAD_QUALIFY_CLASS: AiDataClass = "C";
// routeSeconds: the step runs in the inquiry-to-lead cron (maxDuration 300) or
// in a person's Read again, a server action with the same budget.
const AI = aiSite({ site: "lead-qualify", dataClass: LEAD_QUALIFY_CLASS, tier: "fast", routeSeconds: 300 });

/** A short classification: three short reasons and six short answers fit well inside it. */
const MAX_TOKENS = 800;

export const VERDICTS = ["sales", "not_sales", "spam", "needs_a_person"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const NOT_SALES_KINDS = ["job_seeker", "vendor", "support", "partnership", "other"] as const;
export type NotSalesKind = (typeof NOT_SALES_KINDS)[number];
export const GPCT_KEYS = ["goal", "plan", "challenge", "timeline", "budget", "authority"] as const;
export type GpctKey = (typeof GPCT_KEYS)[number];
export type Gpct = Record<GpctKey, string>;

const REASON_MAX = 140;
const GPCT_MAX = 200;
const REASONS_MAX = 3;

// The request schema carries no numeric or array bounds: the structured-output
// API refuses them (kernel/ai/response.ts). The ranges are in the descriptions,
// where the model reads them, and enforced in readQualification below.
const gpctField = (what: string) => z.string().describe(`${what}, in the visitor's own terms, at most 200 characters; exactly "Not stated" when they did not say.`);
export const leadQualifyOutput = z.object({
  verdict: z.enum(["sales", "not_sales", "spam"]).describe("sales: someone who may buy the company's help for their own organisation. not_sales: a job seeker, a vendor or agency pitching to the company, a support request, or a partnership offer. spam: automated, irrelevant or abusive text."),
  not_sales_kind: z.enum(NOT_SALES_KINDS).nullable().describe("For not_sales only, which kind; null for sales and spam."),
  fit: z.number().int().describe("How well the sender matches the fit below, as an integer from 0 (no match) to 5 (an exact match). 0 for spam."),
  reasons: z.array(z.string()).describe("One to three short reasons for the verdict and fit, each at most 140 characters, using only what the visitor wrote."),
  gpct: z
    .object({
      goal: gpctField("What they want to achieve"),
      plan: gpctField("How they plan to get there"),
      challenge: gpctField("What stands in their way"),
      timeline: gpctField("When they want it"),
      budget: gpctField("Any budget they named; never a guess"),
      authority: gpctField("Their role and who decides"),
    })
    .describe("Suggested qualification answers drawn only from what the visitor wrote."),
});

const OUTPUT_SCHEMA = jsonSchemaFor(leadQualifyOutput);

export function qualifyMessages(input: QualifyInput, fieldsNonce?: string): { system: string; user: string } {
  // The form's other fields are the visitor's words too (team size, the
  // campaign they arrived from), so they are fenced like the message.
  const fields = fenceUntrusted(
    "untrusted_form_fields",
    fillPrompt(LEAD_QUALIFY_PROMPT.parts.formFields, { teamSize: input.teamSize, source: input.source, campaign: input.campaign }),
    fieldsNonce,
  );
  const system = fillPrompt(LEAD_QUALIFY_PROMPT.system, {
    transcriptPreamble: untrustedPreamble(input.nonce, "untrusted_transcript", LEAD_QUALIFY_PROMPT.parts.transcriptWhat),
    formFieldsPreamble: untrustedPreamble(fields.nonce, "untrusted_form_fields", LEAD_QUALIFY_PROMPT.parts.formFieldsWhat),
  });
  const user = fillPrompt(LEAD_QUALIFY_PROMPT.user, {
    sender: input.sender,
    priorInquiries: input.priorInquiries,
    formFields: fields.text,
    visitorText: input.visitorText,
  });
  return { system, user };
}

export type QualifierRead = {
  verdict: Exclude<Verdict, "needs_a_person">;
  notSalesKind: NotSalesKind | null;
  fit: number;
  reasons: string[];
  gpct: Gpct;
};

// `promptVersion` is the prompt's `name@version` (LEAD_QUALIFY_PROMPT.ref), the
// same value ai_calls records, so a triage row names the exact text it was read with.
export type QualifyOutcome = { ok: true; read: QualifierRead; promptVersion: string } | { ok: false; error: string };

function short(text: string, max: number): string {
  const clean = stripContacts(text.replace(/\s+/g, " ").trim());
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * The model's answer made safe to store and post, or why it is unusable. An
 * enum, the fit's range or a kind that contradicts the verdict is unusable
 * (the step fails and is retried); a long or extra reason is cut, and every
 * string loses its links, addresses and phone numbers.
 */
export function readQualification(raw: z.infer<typeof leadQualifyOutput>): { ok: true; read: QualifierRead } | { ok: false; error: string } {
  if (!Number.isInteger(raw.fit) || raw.fit < 0 || raw.fit > 5) return { ok: false, error: `fit ${raw.fit} is not an integer from 0 to 5` };
  const kind = raw.verdict === "not_sales" ? (raw.not_sales_kind ?? "other") : null;
  const reasons = raw.reasons.map((r) => short(r, REASON_MAX)).filter(Boolean).slice(0, REASONS_MAX);
  const gpct = {} as Gpct;
  for (const key of GPCT_KEYS) gpct[key] = short(raw.gpct[key] ?? "", GPCT_MAX) || NOT_STATED;
  return { ok: true, read: { verdict: raw.verdict, notSalesKind: kind, fit: raw.verdict === "spam" ? 0 : raw.fit, reasons, gpct } };
}

/** The model call, as the chain sees it; replaced in tests. */
export type LeadQualifier = (input: QualifyInput) => Promise<QualifyOutcome>;

/**
 * Read one screened inquiry. A model error, a refusal or unusable output is
 * `{ ok: false }`, never a guess: the chain's step fails and is retried, and
 * after three attempts the inquiry is filed the way it was before the chain.
 */
export const qualifyInquiry: LeadQualifier = async (input) => {
  const llm = AI.clientIfConfigured();
  if (!llm) return { ok: false, error: "The AI provider's key is not configured." };
  const { system, user } = qualifyMessages(input);
  const response = await llm.messages.create({
    prompt: LEAD_QUALIFY_PROMPT,
    model: AI.model,
    max_tokens: MAX_TOKENS,
    system,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  });
  const out = readStructuredOutput("lead-qualify", AI.model, response, leadQualifyOutput, "The model declined to read this inquiry.");
  if (!out.ok) return { ok: false, error: out.error };
  const read = readQualification(out.data);
  if (!read.ok) return { ok: false, error: `unusable output: ${read.error}` };
  return { ok: true, read: read.read, promptVersion: LEAD_QUALIFY_PROMPT.ref };
};
