import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";
import { BROADCAST_TAKEAWAY_PROMPT } from "./broadcast-takeaway.prompt";

// One plain-English takeaway line for a broadcast's settled numbers, posted with
// its per-broadcast Lark summary 72 hours after send. Same never-throws contract
// as the other lib/ai helpers: returns null on any failure (no key or API error)
// so the summary still posts with just the numbers.

export const BROADCAST_TAKEAWAY_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "broadcast-takeaway", dataClass: BROADCAST_TAKEAWAY_CLASS, tier: "fast" });
const MODEL = AI.model;

export type BroadcastTakeawayInput = {
  name: string;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  // Topics that pulled clicks, most-engaged first, from the utm_content tags.
  topTopics: { topic: string; people: number }[];
};

export const broadcastTakeawayOutput = z.object({
  takeaway: z.string().describe("One sentence, at most ~25 words, naming the single most useful thing these numbers say (what worked or what underperformed). No preamble, no restating every metric."),
});

const SCHEMA = jsonSchemaFor(broadcastTakeawayOutput);

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

export async function generateBroadcastTakeaway(input: BroadcastTakeawayInput): Promise<string | null> {
  const anthropic = AI.clientIfConfigured();
  if (!anthropic) return null;

  const topics =
    input.topTopics.length > 0
      ? input.topTopics.map((t) => `${t.topic} (${t.people} people)`).join(", ")
      : "no clicks tagged to a topic";

  const material = fillPrompt(BROADCAST_TAKEAWAY_PROMPT.user, {
    name: input.name,
    subject: input.subject,
    sent: input.sent,
    delivered: input.delivered,
    opened: input.opened,
    openedPct: pct(input.opened, input.delivered),
    clicked: input.clicked,
    clickedPct: pct(input.clicked, input.delivered),
    unsubscribed: input.unsubscribed,
    topics,
  });

  try {
    const response = await anthropic.messages.create({
      prompt: BROADCAST_TAKEAWAY_PROMPT,
      model: MODEL,
      max_tokens: 300,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          // The instruction leads the user message; the site sends no system
          // prompt (see ./broadcast-takeaway.prompt).
          content: BROADCAST_TAKEAWAY_PROMPT.parts.instruction + "\n\n" + material,
        },
      ],
    });
    const out = readStructuredOutput("broadcast-takeaway", MODEL, response, broadcastTakeawayOutput);
    if (!out.ok) {
      console.error("broadcast-takeaway:", out.error);
      return null;
    }
    const parsed = out.data;
    const takeaway = typeof parsed.takeaway === "string" ? parsed.takeaway.trim() : "";
    return takeaway.length > 0 ? takeaway : null;
  } catch {
    return null;
  }
}
