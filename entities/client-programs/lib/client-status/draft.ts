import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { AiDataClass } from "@/kernel/ai/routing";
import { CLIENT_STATUS_STEP_SECONDS } from "./steps";
import { SECTION_MAX_LINES } from "./check";
import { STATUS_SECTIONS, type StatusFact, type StatusFacts } from "./facts";
import { CLIENT_STATUS_DRAFT_PROMPT } from "./draft.prompt";

// The draft step's model call (Z.12, spec §5): one client's week, written for
// that client from the facts gathered, every line citing the fact it rests on.
//
// Class C, confidential: the input is one client's card titles, roadmap items
// and document names, which are client business content, not a person's record,
// pay or a price (the facts schema has no field for any of those). Class C keeps
// the call on Claude direct. Standard tier. No tools: the worst a fact that
// reads like an instruction can do is a draft the check refuses.

export const CLIENT_STATUS_DRAFT_CLASS: AiDataClass = "C";
const AI = aiSite({
  site: "client-status-draft",
  dataClass: CLIENT_STATUS_DRAFT_CLASS,
  tier: "standard",
  routeSeconds: CLIENT_STATUS_STEP_SECONDS,
});

const statusLine = z.object({
  factId: z.string().describe("The id of the one fact this line rests on, exactly as it appears in the facts block, e.g. F3."),
  line: z.string().describe("One plain sentence for the client, at most 200 characters."),
});

export const clientStatusDraftOutput = z.object({
  summary: z.string().describe("At most three sentences: what moved this week, what is next, and what waits on the client."),
  shipped: z.array(statusLine).describe("What was finished this week."),
  inProgress: z.array(statusLine).describe("What is under way now."),
  next: z.array(statusLine).describe("What comes next."),
  needsFromClient: z.array(statusLine).describe("What Edge8 is waiting on from the client."),
});
export type StatusNarrative = z.infer<typeof clientStatusDraftOutput>;

const DRAFT_SCHEMA = jsonSchemaFor(clientStatusDraftOutput);

// The system text with the section cap the check enforces filled in.
const SYSTEM = fillPrompt(CLIENT_STATUS_DRAFT_PROMPT.system, { sectionMaxLines: SECTION_MAX_LINES });

// The facts the model is handed: at most SECTION_MAX_LINES per section, newest
// first as gathered, and as many of the unsectioned (context) facts. A busy
// board has dozens of open cards; handing them all asked for a draft the
// check's caps refuse, or one cut off at max_tokens (Z.12 review, finding 3).
export function factsForModel(facts: StatusFacts): StatusFact[] {
  const keys: (StatusFact["section"])[] = [...STATUS_SECTIONS, null];
  return keys.flatMap((key) => facts.items.filter((f) => f.section === key).slice(0, SECTION_MAX_LINES));
}

/** The user message: the facts, fenced as data under a fixed heading. */
export function draftPrompt(facts: StatusFacts, failedRule: string | null): string {
  const block = JSON.stringify({ client: facts.company, week: facts.week, facts: factsForModel(facts) }, null, 2);
  const retry = failedRule ? fillPrompt(CLIENT_STATUS_DRAFT_PROMPT.parts.retry, { failedRule }) : "";
  return fillPrompt(CLIENT_STATUS_DRAFT_PROMPT.user, { company: facts.company, facts: block, retry });
}

/**
 * One draft, or why there is none. Never throws: a missing key, a refused
 * route, a timeout or a reply that does not fit the schema is an error the
 * step records and the driver retries.
 */
export async function draftNarrative(
  facts: StatusFacts,
  failedRule: string | null,
): Promise<{ ok: true; narrative: StatusNarrative } | { ok: false; error: string }> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "The model provider's key is not configured." };
    const response = await llm.messages.create({
      prompt: CLIENT_STATUS_DRAFT_PROMPT,
      model: AI.model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages: [{ role: "user", content: [{ type: "text", text: draftPrompt(facts, failedRule) }] }],
    });
    const out = readStructuredOutput(AI.site, AI.model, response, clientStatusDraftOutput, "The model declined to draft this status.");
    return out.ok ? { ok: true, narrative: out.data } : { ok: false, error: out.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
