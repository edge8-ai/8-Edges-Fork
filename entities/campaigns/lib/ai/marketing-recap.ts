import { selectEmailCampaigns } from "../reads";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { MARKETING_RECAP_PROMPT } from "./marketing-recap.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";
import { getBroadcastLinkStats, getBroadcastUnsubscribes } from "@/entities/campaigns/lib/broadcast-report";
import { z } from "zod/v4";

// The monthly marketing recap: read every broadcast that went out in one
// calendar month, aggregate how they performed, and ask Claude for a plain
// readout plus content suggestions for next month, grounded in which topics
// actually earned opens and clicks. Same never-throws contract as the other
// lib/ai helpers: returns null on any failure (no key, no sends, or an API
// error) so the cron records a clean skip.

export const MARKETING_RECAP_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "marketing-recap", dataClass: MARKETING_RECAP_CLASS, tier: "standard" });
const MODEL = AI.model;

export type RecapSuggestion = { title: string; rationale: string };
export type RecapMetrics = {
  broadcasts: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
};
export type MarketingRecap = {
  readout: string;
  suggestions: RecapSuggestion[];
  metrics: RecapMetrics;
  model: string;
};

export const marketingRecapOutput = z.object({
  readout: z.string().describe("2-4 sentences: how the month's email marketing performed and what stands out. Plain, specific, grounded in the numbers given. No fluff."),
  suggestions: z.array(z.object({
    title: z.string().describe("A content type or topic to produce next month."),
    rationale: z.string().describe("One sentence tying it to this month's engagement data."),
  })),
});

const SCHEMA = jsonSchemaFor(marketingRecapOutput);

type SentBroadcast = { id: string; name: string; subject: string; approved_at: string | null };

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

// [start, end) bounds of the calendar month that `month` falls in, in UTC.
export function monthBounds(month: Date): { start: Date; end: Date; periodMonth: string } {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  return { start, end, periodMonth: start.toISOString().slice(0, 10) };
}

export async function generateMarketingRecap(month: Date): Promise<MarketingRecap | null> {
  const anthropic = AI.clientIfConfigured();
  if (!anthropic) return null;

  const { start, end } = monthBounds(month);
  const { data, error } = await companyOs.from("email_campaigns").select("id, name, subject, approved_at")
    .eq("status", "sent")
    .gte("sent_at", start.toISOString())
    .lt("sent_at", end.toISOString())
    .order("sent_at", { ascending: true });
  if (error) {
    console.error("marketing-recap: broadcast read failed:", error.message);
    return null;
  }

  const broadcasts = (data ?? []) as SentBroadcast[];
  if (broadcasts.length === 0) return null;

  const metrics: RecapMetrics = { broadcasts: broadcasts.length, sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 };
  const topicPeople = new Map<string, number>();
  const lines: string[] = [];

  for (const b of broadcasts) {
    const [stats, links, unsub] = await Promise.all([
      getBroadcastStats(b.id),
      getBroadcastLinkStats(b.id),
      getBroadcastUnsubscribes(b.id, b.approved_at),
    ]);
    metrics.sent += stats.sent;
    metrics.delivered += stats.delivered;
    metrics.opened += stats.opened;
    metrics.clicked += stats.clicked;
    metrics.unsubscribed += unsub;
    for (const l of links) topicPeople.set(l.content, (topicPeople.get(l.content) ?? 0) + l.people);

    const topics = links
      .slice(0, 3)
      .map((l) => `${l.content} (${l.people})`)
      .join(", ");
    lines.push(
      `- "${b.subject}" — sent ${stats.sent}, opens ${pct(stats.opened, stats.delivered)}, clicks ${pct(stats.clicked, stats.delivered)}, unsub ${unsub}` +
        (topics ? `; top topics: ${topics}` : ""),
    );
  }

  const topTopics = [...topicPeople.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, people]) => `${topic} (${people} people)`)
    .join(", ");

  // The prompt's template is the whole user message: the instruction, then
  // the month's figures (./marketing-recap.prompt.ts says why it sits in
  // `system`). No system prompt is sent.
  const content = fillPrompt(MARKETING_RECAP_PROMPT.user, {
    broadcasts: metrics.broadcasts,
    sent: metrics.sent,
    openRate: pct(metrics.opened, metrics.delivered),
    clickRate: pct(metrics.clicked, metrics.delivered),
    unsubscribed: metrics.unsubscribed,
    perBroadcast: lines.join("\n"),
    topics: topTopics || MARKETING_RECAP_PROMPT.parts.noTopics,
  });

  try {
    const response = await anthropic.messages.create({
      prompt: MARKETING_RECAP_PROMPT,
      model: MODEL,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
    const out = readStructuredOutput("marketing-recap", MODEL, response, marketingRecapOutput);
    if (!out.ok) {
      console.error("marketing-recap:", out.error);
      return null;
    }
    const parsed = out.data;
    const readout = typeof parsed.readout === "string" ? parsed.readout.trim() : "";
    if (!readout) return null;
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter(
        (s): s is RecapSuggestion =>
          !!s && typeof s === "object" && typeof (s as RecapSuggestion).title === "string" && typeof (s as RecapSuggestion).rationale === "string",
      )
      .slice(0, 5);
    return { readout, suggestions, metrics, model: MODEL };
  } catch {
    return null;
  }
}
