// Team portal assistant: streaming, read-only tool-use agent loop.
//
// The client POSTs the full messages array (echoed back from the previous turn's
// `done` event, plus the new user turn) — the server is stateless. SSE events:
// {type: "text" | "tool" | "error" | "done"}. `done` carries the updated messages
// array for the client to echo next turn.
//
// The loop itself is runChatTurn (entities/assistant/lib/chat-turn.ts), shared
// with the admin assistant. This surface passes NO `approval` hook, which is
// what makes the pause/resume path structurally absent here rather than merely
// unreachable.
//
// This assistant is answer-only, with one deliberate exception. Its reads are
// fixed, typed tools (entities/team/lib/chat), not SQL: the database cannot tell
// one employee from another, so what a person may see of a client's money and
// contacts is decided inside each tool against the access resolved here, once,
// from the session (2026-10-02). request_review_link (offered to admins, the
// talent director, and managers) adds reviewers to a performance review and
// returns links; it re-checks the caller against the subject inside the team
// entity. The my_* tools read the signed-in person's own private records
// (reviews, goals, coaching, time off, pay, claims), handed the session's actor
// and never a person named by the model (2026-10-10). There are no general write, email, or approval paths here — that
// surface exists only in the admin assistant.
//
// The model is handed only the tools whose permission the person holds (ADR
// 0013, entities/assistant/lib/tool-permission.ts), and a call to any tool it
// was not handed is refused here, so the assistant is never a side door.

import type Anthropic from "@anthropic-ai/sdk";
import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { getAccess } from "@/kernel/identity/access-request";
import { requestReviewLinks } from "@/entities/team/lib/reviews/chat-tool";
import { resolveChatAccess, seesAnyClient, type ChatAccess } from "@/entities/team/lib/chat/access";
import { isMyTool, isTeamDataTool, runMyTool, runTeamDataTool } from "@/entities/team/lib/chat/run-tool";
import { ReadFailure } from "@/kernel/data/read";
import { TALENT_DIRECTOR_EMAIL } from "@/entities/onboarding";
// The assistant entity owns the chat back end (ME-08); this route composes it
// through the entity's index, aliasing the door's disambiguated names back to
// the short ones the body reads with.
import {
  teamChatTools as chatbotTools,
  buildTeamChatPrompt as buildSystemPrompt,
  TEAM_CHAT_PROMPT,
  runChatTurn,
  type ChatSseEvent,
} from "@/entities/assistant";

export const TEAM_CHAT_CLASS: AiDataClass = "S";
const AI = aiSite({ site: "team-chat", dataClass: TEAM_CHAT_CLASS, tier: "standard" });
const MODEL = AI.model;

export async function POST(request: NextRequest) {
  const { actor } = await getTeamActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = AI.clientIfConfigured();
  if (!client) {
    return NextResponse.json(
      { error: "The assistant is not configured (missing API key)" },
      { status: 503 },
    );
  }

  let body: {
    messages?: Anthropic.MessageParam[];
    conversationId?: string | null;
    displayItems?: unknown[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? [...body.messages] : null;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }
  // Which saved conversation this belongs to (null = start a fresh one), and the
  // widget's complete visual history so far — the route appends this turn's items
  // to it before persisting.
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const priorItems = Array.isArray(body.displayItems) ? body.displayItems : [];

  // What the person may do, and who may see which client's money and contacts,
  // from the session alone. A failed read refuses the turn rather than
  // answering as if the person held nothing or were assigned nowhere.
  let access: ChatAccess;
  let may: (permission: string) => boolean;
  try {
    const held = await getAccess();
    may = (permission) => held?.may(permission) ?? false;
    access = await resolveChatAccess(actor, { may });
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("team chat access:", err.message);
    return NextResponse.json({ error: "The assistant is unavailable right now. Try again." }, { status: 503 });
  }

  const canRequestReviews = actor.isAdmin || actor.role === "manager" || actor.email === TALENT_DIRECTOR_EMAIL;
  const tools = chatbotTools({ may, canRequestReviews, seesAnyClient: seesAnyClient(access) });
  const handed = new Set(tools.map((t) => t.name));
  const system = buildSystemPrompt({ userName: actor.displayName });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatSseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runChatTurn({
          client,
          model: MODEL,
          prompt: TEAM_CHAT_PROMPT,
          system,
          tools,
          messages,
          usageSite: "team-chat",
          logLabel: "team chat",
          conversationId,
          priorItems,
          persist: {
            surface: "team",
            authUserId: actor.authUserId,
            personId: actor.personId,
          },
          // The team transcript has only ever stored the chip's detail: its one
          // chip label is fixed, so the name would be dead weight in every row.
          recordToolName: false,
          send,
          executeTool: async (tu, chip) => {
            const input = tu.input as Record<string, unknown>;
            // A tool the person was not handed does not exist for them.
            if (!handed.has(tu.name)) return { content: `Unknown tool: ${tu.name}`, isError: true };
            if (isTeamDataTool(tu.name)) {
              chip(tu.name, `${tu.name.replace(/_/g, " ")} ${JSON.stringify(input)}`.slice(0, 120));
              return runTeamDataTool(tu.name, input, access);
            }
            // The person's own records: the body is handed the session's actor,
            // so a person id in the input reaches nothing.
            if (isMyTool(tu.name)) {
              chip(tu.name, tu.name.replace(/_/g, " "));
              return runMyTool(tu.name, input, actor);
            }
            if (tu.name === "request_review_link" && canRequestReviews) {
              const subject = typeof input.subject === "string" ? input.subject : "";
              chip("request_review_link", `review link: ${subject}`.slice(0, 120));
              const outcome = await requestReviewLinks(actor, {
                subject,
                reviewers: Array.isArray(input.reviewers) ? (input.reviewers as Array<{ name?: string; email?: string }>) : [],
                send: input.send === true,
              });
              return { content: JSON.stringify(outcome), isError: !outcome.ok };
            }
            return { content: `Unknown tool: ${tu.name}`, isError: true };
          },
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
