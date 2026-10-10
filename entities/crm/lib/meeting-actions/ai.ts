import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fenceUntrusted, untrustedPreamble, type Screened } from "@/kernel/ai/screen";
import { MEETING_ACTIONS_EXTRACT_PROMPT as EXTRACT_PROMPT, MEETING_FOLLOWUP_DRAFT_PROMPT as DRAFT_PROMPT } from "./ai.prompt";

// The chain's two model calls (Z.13, spec section 5). Both read a client
// meeting's own words, which are client-confidential business content: class
// C, as the meeting summary is (MEETING_SUMMARY_CLASS). Not S: no ATS, payroll,
// money or people records are read, and the names are the meeting's own. C
// keeps the call on Claude or a host that denies data collection.
//
// Input screening (kernel/ai/screen.ts): the extract step screens the
// transcript (screenUntrusted) before this module sees it, and the prompt here
// tells the model, by the screen's nonce, that everything inside the tag is
// quoted speech and never an instruction. The summary and the action lists,
// which the meeting's own words wrote, are fenced the same way (fenceUntrusted)
// in both calls. The output is schema-checked, so a refusal or a miss fails
// the step and writes nothing. What the model returns is then checked by code
// (checks.ts): every action must quote a transcript line, owners come only from
// the name lists, and the draft may carry no address or foreign link.

const MEETING_ACTIONS_CLASS: AiDataClass = "C";
const FOLLOWUP_DRAFT_CLASS: AiDataClass = "C";

// The steps run inside the crm driver's tick (maxDuration 300).
const EXTRACT = aiSite({ site: "meeting-actions-extract", dataClass: MEETING_ACTIONS_CLASS, tier: "standard", routeSeconds: 300 });
const DRAFT = aiSite({ site: "meeting-followup-draft", dataClass: FOLLOWUP_DRAFT_CLASS, tier: "standard", routeSeconds: 300 });

/** The transcript is capped as the summary caps it; the tail is dropped. */
export const MAX_TRANSCRIPT_CHARS = 120_000;

const ITEM = z.object({
  title: z.string().describe("The action as a short imperative card title, at most ten words: 'Send the pilot data checklist'."),
  detail: z.string().describe("One or two sentences of context from the meeting, or an empty string."),
  owner_side: z.enum(["edge8", "client", "unclear"]).describe("Who the meeting said will do it: edge8 for anyone on the Edge8 list, client for anyone on the client list, unclear when nobody was named."),
  owner_name: z.string().nullable().describe("The owner's name exactly as written in one of the two name lists, or null when nobody was named or the name is not on either list."),
  due_date: z.string().nullable().describe("The date the meeting said it is due, as YYYY-MM-DD, or null when no date was said. Never guess one."),
  evidence: z.string().describe("The exact words from the transcript the action comes from, copied verbatim, one sentence or less."),
});

export const extractOutput = z.object({
  items: z.array(ITEM).describe("Actions Edge8 agreed to do, or that nobody owned. Only what the meeting agreed; never an idea that was only floated."),
  client_items: z.array(ITEM).describe("Actions the client's people agreed to do."),
  commitments: z
    .array(z.string())
    .describe("Every price, date or scope Edge8 stated or promised in the meeting, each in a short sentence quoting the meeting. Empty when none."),
});
export type ExtractOutput = z.infer<typeof extractOutput>;

export const draftOutput = z.object({
  subject: z.string().describe("The email subject, at most ten words, starting 'Follow-up:'."),
  body_md: z
    .string()
    .describe(
      "The email body in plain Markdown: a greeting to the recipients by first name, one line of thanks, 'What we covered' (2-4 bullets), 'What Edge8 will do' (the Edge8 actions as bullets), 'What you said you would do' (the client actions as bullets, left out when there are none), one closing line, and the sender's name. No links, no email addresses, no figures, prices or dates the meeting did not state.",
    ),
});
export type DraftOutput = z.infer<typeof draftOutput>;

const EXTRACT_SCHEMA = jsonSchemaFor(extractOutput);
const DRAFT_SCHEMA = jsonSchemaFor(draftOutput);

const SUMMARY_TAG = "meeting_summary";
const MATERIAL_TAG = "meeting_material";

// The authored text of both calls is in ai.prompt.ts; the preambles that name
// each fence's nonce are the kernel's, filled into the system text per call.
const EXTRACT_SYSTEM = (transcriptNonce: string, summaryNonce: string) =>
  fillPrompt(EXTRACT_PROMPT.system, {
    transcriptPreamble: untrustedPreamble(transcriptNonce),
    summaryPreamble: untrustedPreamble(summaryNonce, SUMMARY_TAG, EXTRACT_PROMPT.parts.summaryWhat),
  });

const DRAFT_SYSTEM = (nonce: string) =>
  fillPrompt(DRAFT_PROMPT.system, {
    materialPreamble: untrustedPreamble(nonce, MATERIAL_TAG, DRAFT_PROMPT.parts.materialWhat),
  });

/** A list as bullet lines, or the prompt's "(none)" when it is empty. */
const bullets = (items: string[], none: string) => items.map((n) => `- ${n}`).join("\n") || none;

export type ExtractInput = { screened: Screened; summary: string | null; edge8Names: string[]; clientNames: string[] };

/** The extract call. Answers the parsed output, or why there is none; never a half answer. */
export async function extractActions(input: ExtractInput): Promise<{ ok: true; data: ExtractOutput } | { ok: false; error: string }> {
  const llm = EXTRACT.clientIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const none = EXTRACT_PROMPT.parts.none;
  const summary = fenceUntrusted(SUMMARY_TAG, input.summary ?? none);
  const truncated = input.screened.truncated;
  const user = [
    fillPrompt(EXTRACT_PROMPT.user, {
      edge8People: bullets(input.edge8Names, none),
      clientPeople: bullets(input.clientNames, none),
      summary: summary.text,
    }),
    truncated ? fillPrompt(EXTRACT_PROMPT.parts.truncated, { keptChars: truncated.keptChars, originalChars: truncated.originalChars }) : "",
    EXTRACT_PROMPT.parts.transcriptHeading,
    input.screened.text,
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await llm.messages.create({
    prompt: EXTRACT_PROMPT,
    model: EXTRACT.model,
    max_tokens: 4000,
    system: EXTRACT_SYSTEM(input.screened.nonce, summary.nonce),
    output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  return readStructuredOutput("meeting-actions-extract", EXTRACT.model, response, extractOutput, "The model declined to list this meeting's actions.");
}

export type DraftInput = {
  companyName: string;
  meetingDate: string | null;
  summary: string | null;
  edge8Actions: string[];
  clientActions: string[];
  recipientNames: string[];
  senderName: string;
};

/** The draft call. Answers the parsed output, or why there is none. */
export async function draftFollowup(input: DraftInput): Promise<{ ok: true; data: DraftOutput } | { ok: false; error: string }> {
  const llm = DRAFT.clientIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const none = DRAFT_PROMPT.parts.none;
  const material = fenceUntrusted(
    MATERIAL_TAG,
    fillPrompt(DRAFT_PROMPT.parts.material, {
      summary: input.summary ?? none,
      edge8Actions: bullets(input.edge8Actions, none),
      clientActions: bullets(input.clientActions, none),
    }),
  );
  const user = fillPrompt(DRAFT_PROMPT.user, {
    companyName: input.companyName,
    meetingDate: input.meetingDate ?? DRAFT_PROMPT.parts.noDate,
    recipients: input.recipientNames.join(", ") || DRAFT_PROMPT.parts.noRecipients,
    senderName: input.senderName,
    material: material.text,
  });
  const response = await llm.messages.create({
    prompt: DRAFT_PROMPT,
    model: DRAFT.model,
    max_tokens: 1500,
    system: DRAFT_SYSTEM(material.nonce),
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  return readStructuredOutput("meeting-followup-draft", DRAFT.model, response, draftOutput, "The model declined to draft this follow-up.");
}
