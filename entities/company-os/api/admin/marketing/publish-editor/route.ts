import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { getAccess } from "@/kernel/identity/access-request";
import { makePublishEditorTools } from "@/entities/campaigns";
import { PUBLISH_EDITOR_PROMPT } from "@/entities/campaigns";
import { withHistoryCache } from "@/kernel/ai/cache";
import { logAiUsage } from "@/kernel/ai/response";

// In-app loop runtime for the Publish Editor agent. A teammate hits this from the
// admin with one assetId; the agent reviews, fixes, publishes, and reports over
// SSE. The tool layer is runtime-agnostic (lib/marketing/publish-editor/tools),
// so this route can be swapped for a Managed Agent orchestrator without touching
// the tools or the prompt. Mirrors the proven app/api/admin/chat SSE pattern.

export const PUBLISH_EDITOR_CLASS: AiDataClass = "A";
const AI = aiSite({ site: "publish-editor", dataClass: PUBLISH_EDITOR_CLASS, tier: "standard" });
const MODEL = AI.model;
const MAX_ITERATIONS = 16;

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function POST(request: NextRequest) {
  // Its own atom (AE.3), not entering the Admin view.
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.may("company-os.publish-editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = access.user;
  const client = AI.clientIfConfigured();
  if (!client) {
    return NextResponse.json({ error: "The publish editor is not configured (missing API key)." }, { status: 503 });
  }

  let body: { assetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });

  const { tools, exec } = makePublishEditorTools(assetId, user.email);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: PUBLISH_EDITOR_PROMPT.user },
      ];

      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const msgStream = client.messages.stream({
            prompt: PUBLISH_EDITOR_PROMPT,
            model: MODEL,
            max_tokens: 4096,
            output_config: { effort: "medium" },
            system: [{ type: "text", text: PUBLISH_EDITOR_PROMPT.system, cache_control: { type: "ephemeral" } }],
            tools,
            messages: withHistoryCache(messages),
          });
          msgStream.on("text", (delta) => send({ type: "text", text: delta }));
          const msg = await msgStream.finalMessage();
          logAiUsage("publish-editor", MODEL, msg.usage);
          messages.push({ role: "assistant", content: msg.content });
          if (msg.stop_reason !== "tool_use") break;

          const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const r = await exec(tu.name, tu.input as Record<string, unknown>);
            if (r.chip) send({ type: "tool", name: tu.name, detail: r.chip });
            results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError });
          }
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (err) {
        console.error("publish-editor route:", err);
        send({
          type: "error",
          error:
            err instanceof Anthropic.APIError
              ? `The publish editor hit an API error (${err.status ?? "network"}). Try again.`
              : "The publish editor hit an unexpected error. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
