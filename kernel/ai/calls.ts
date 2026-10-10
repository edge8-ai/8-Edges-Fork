import { createHash } from "node:crypto";
import { currentRunId, type AiUsage } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { log } from "@/kernel/config/log";
import type { AiDataClass } from "@/kernel/ai/routing";
import { costOf } from "@/kernel/ai/prices";

/**
 * The one writer of company_os.ai_calls: one row per model call, metadata only.
 *
 * The gateway (kernel/ai/gateway.ts) calls this after every attempt, and the
 * Gemini image call records itself here too, so a feature's spend and latency
 * can be read per call rather than per run. Nothing here carries prompt or
 * completion text; the input is kept as a hash.
 *
 * A failed write never fails the call it describes. The user's summary or
 * draft is worth more than its ledger line, so an insert error is logged as
 * `ai-call-not-recorded` (the grep handle for a gap in the ledger) and
 * swallowed. Without a database configured (a local run, a test) nothing is
 * written, because the placeholder client would only turn every model call
 * into a failed network round-trip.
 */

export type AiCallProvider = "anthropic" | "openrouter" | "google";

export type AiCallErrorKind = "refusal" | "max_tokens" | "timeout" | "connection" | "rate_limit" | "api_error" | "unknown";

export type AiCallRecord = {
  site: string;
  dataClass: AiDataClass;
  provider: AiCallProvider;
  model: string;
  /** The response's usage; null when the call failed before a response. */
  usage: AiUsage | null;
  /** Cost as the provider reported it (OpenRouter's usage.cost); null otherwise. */
  costUsd: number | null;
  latencyMs: number;
  /**
   * The prompt the call sent, as `name@version` (kernel/ai/prompts.ts): the
   * version is a hash of the prompt's text, so a row says exactly which text
   * produced it (Z.6.1). Rows written before Z.6.1 hold a bare number.
   */
  promptVersion: string;
  inputHash: string;
  ok: boolean;
  errorKind: AiCallErrorKind | null;
  /** The routine run the call belongs to; when omitted, the run on the current async chain. */
  runId?: string | null;
};

/** sha256 (hex) of a request's messages: identical inputs match, nothing is kept. */
export function inputHashOf(messages: unknown): string {
  return createHash("sha256").update(JSON.stringify(messages ?? null)).digest("hex");
}

export async function recordAiCall(call: AiCallRecord): Promise<void> {
  if (!process.env.SUPABASE_URL) return;
  try {
    const { error } = await companyOs.from("ai_calls").insert({
      site: call.site,
      class: call.dataClass,
      provider: call.provider,
      model: call.model,
      input_tokens: call.usage?.input_tokens ?? null,
      output_tokens: call.usage?.output_tokens ?? null,
      cache_read_tokens: call.usage ? (call.usage.cache_read_input_tokens ?? null) : null,
      cache_write_tokens: call.usage ? (call.usage.cache_creation_input_tokens ?? null) : null,
      // The provider's own figure where it reports one (OpenRouter), else the
      // versioned price table (Y.76).
      cost_usd: call.costUsd ?? costOf(call.model, call.usage),
      latency_ms: Math.max(0, Math.round(call.latencyMs)),
      prompt_version: call.promptVersion,
      input_hash: call.inputHash,
      // The routine run this call happened inside, from the run's context
      // (Y.72.1); null for a call outside any run (a chat turn, a button).
      run_id: call.runId ?? currentRunId(),
      ok: call.ok,
      error_kind: call.errorKind,
    });
    if (error) log("warn", "ai-call-not-recorded", { site: call.site, model: call.model, error: error.message });
  } catch (e) {
    log("warn", "ai-call-not-recorded", { site: call.site, model: call.model, error: e instanceof Error ? e.message : String(e) });
  }
}
