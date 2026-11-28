// The personal read (TR.10, ADR 0016): written when the member opens it, shown
// to them alone and never stored. This file reads and writes no table, and a
// test holds it to that. ai_calls keeps metadata and a hash of the input, never
// the words (kernel/ai/calls.ts).
//
// A failure logs its kind and no message: a JSON parse error quotes the reply it
// failed on, and a log line is a place the read would then be kept.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { log } from "@/kernel/config/log";
import { PERSONAL_READ_PROMPT } from "./personal-read.prompt";
import { checkRead, readInput, readUsedLine, type ReadDraft, type ReadInputs } from "./personal-read-rules";

export const PERSONAL_READ_SITE = "training-personal-read";
// One person's reviews, notes and record, by the person they are about: sensitive, class S.
const PERSONAL_READ_CLASS: AiDataClass = "S";
// The page's maxDuration in training's mounts.ts: a member is waiting on it.
const ROUTE_SECONDS = 60;

const ReadOutput = z.object({ headline: z.string(), noticed: z.array(z.string()), worthTrying: z.string().nullable() });

export type MyRead = { ok: true; read: ReadDraft; used: string } | { ok: false };

function failed(kind: "not-configured" | "no-reply" | "refused" | "threw"): MyRead {
  log("warn", "training-personal-read-failed", { kind });
  return { ok: false };
}

/** One model call over the member's own record. Any failure comes back as `ok: false`, which the card says plainly. */
export async function writeMyRead(load: () => Promise<ReadInputs>): Promise<MyRead> {
  try {
    const inputs = await load();
    const ai = aiSite({ site: PERSONAL_READ_SITE, dataClass: PERSONAL_READ_CLASS, tier: "standard", routeSeconds: ROUTE_SECONDS });
    const client = ai.clientIfConfigured();
    if (!client) return failed("not-configured");
    const input = readInput(inputs);
    const response = await client.messages.create({
      prompt: PERSONAL_READ_PROMPT,
      model: ai.model,
      max_tokens: 800,
      system: PERSONAL_READ_PROMPT.system,
      output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchemaFor(ReadOutput) } },
      messages: [{ role: "user", content: fillPrompt(PERSONAL_READ_PROMPT.user, { record: input }) }],
    });
    const out = readStructuredOutput(PERSONAL_READ_SITE, ai.model, response, ReadOutput, "The model declined this read.");
    if (!out.ok) return failed("no-reply");
    const checked = checkRead(out.data, input);
    return checked.ok ? { ok: true, read: checked.read, used: readUsedLine(inputs) } : failed("refused");
  } catch {
    return failed("threw");
  }
}
