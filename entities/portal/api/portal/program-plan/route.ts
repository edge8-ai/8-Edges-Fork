// Portal "Create a Plan" chatbot: streaming A01 plan-builder.
//
// Stateless like the admin chat route (app/api/admin/chat/route.ts): the client
// POSTs the full messages array echoed from the previous turn's `done` event
// plus the new user turn. No tools — this is a plain guided conversation whose
// final turn emits the 5Ds brief as a fenced ```html block. SSE events:
// {type: "text" | "error" | "done"}; `done` carries the updated messages array.

import Anthropic from "@anthropic-ai/sdk";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { NextRequest, NextResponse } from "next/server";
import { getPortalActor } from "@/kernel/identity/portal-auth";
import { PROGRAM_PLAN_PROMPT } from "@/entities/portal/lib/program-plan.prompt";
import { withHistoryCache } from "@/kernel/ai/cache";
import { logAiUsage } from "@/kernel/ai/response";

export const PROGRAM_PLAN_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "program-plan", dataClass: PROGRAM_PLAN_CLASS, tier: "standard" });
const MODEL = AI.model;
const MAX_MESSAGES = 60;

type SseEvent =
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | { type: "done"; messages: Anthropic.MessageParam[] };

// Keep the tail of the conversation bounded; the plan builder is long but a
// runaway array is still capped so the model context stays sane.
function trimMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  const cut = messages.length - MAX_MESSAGES;
  // Always start the kept slice on a user turn so pairing stays valid.
  for (let i = cut; i < messages.length; i++) {
    if (messages[i].role === "user") return messages.slice(i);
  }
  return messages.slice(-MAX_MESSAGES);
}

export async function POST(request: NextRequest) {
  const { actor } = await getPortalActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = AI.clientIfConfigured();
  if (!client) {
    return NextResponse.json({ error: "The assistant is not configured (missing API key)" }, { status: 503 });
  }

  let body: { messages?: Anthropic.MessageParam[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? trimMessages([...body.messages]) : null;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // The given name, never the actor's email fallback: the prompt goes to the
  // model (S.16.26).
  const system = fillPrompt(PROGRAM_PLAN_PROMPT.system, {
    today,
    userName: actor.greeting ? fillPrompt(PROGRAM_PLAN_PROMPT.parts.userName, { greeting: actor.greeting }) : "",
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const msgStream = client.messages.stream({
          prompt: PROGRAM_PLAN_PROMPT,
          model: MODEL,
          max_tokens: 8192,
          output_config: { effort: "medium" },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: withHistoryCache(messages),
        });
        msgStream.on("text", (delta) => send({ type: "text", text: delta }));
        const msg = await msgStream.finalMessage();
        logAiUsage("program-plan", MODEL, msg.usage);
        messages.push({ role: "assistant", content: msg.content });
        send({ type: "done", messages: trimMessages(messages) });
      } catch (err) {
        console.error("portal program-plan route:", err);
        send({
          type: "error",
          error:
            err instanceof Anthropic.APIError
              ? `The assistant hit an API error (${err.status ?? "network"}). Try again.`
              : "The assistant hit an unexpected error. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
