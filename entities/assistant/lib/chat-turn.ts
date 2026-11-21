// The streaming tool-use agent loop both chat assistants run.
//
// The admin route (entities/company-os/api/admin/chat) and the team route
// (entities/team/api/team/chat) were 85% byte-identical: the same iteration
// cap, the same SSE frame shapes, the same display-item accumulation, the same
// trim-and-persist on `done`, and the same two error strings. Only the surface
// details differed — who the actor is, which tools exist, what a tool chip is
// called, and whether privileged tool calls pause for approval. Everything that
// differed is now an option; everything that did not lives here once, so a fix
// to the loop cannot land on only one of the two surfaces.
//
// The loop writes to the SSE stream through `send` and never touches the
// controller: the route owns opening and closing the stream, because that is
// where the Response is built.

import type Anthropic from "@anthropic-ai/sdk";
import AnthropicSdk from "@anthropic-ai/sdk";
import { withHistoryCache } from "@/kernel/ai/cache";
import type { AiClient } from "@/kernel/ai/gateway";
import type { Prompt } from "@/kernel/ai/prompts";
import { logAiUsage } from "@/kernel/ai/response";
import { trimMessages } from "@/kernel/ai/messages";
import { upsertConversation, type Surface } from "./history/store";
import { deriveTitle } from "./history/title";

/** Multi-tool loops can run past 60s; requires Vercel fluid compute. */
const MAX_ITERATIONS = 8;

export type ChatSseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "approval"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; error: string }
  | {
      type: "done";
      messages: Anthropic.MessageParam[];
      conversationId: string | null;
      title: string | null;
    };

/**
 * Render items mirror the widgets' DisplayItem shapes. The loop builds this
 * turn's items as it streams so the persisted visual transcript matches what
 * the widget rendered.
 */
export type ChatTurnItem =
  | { kind: "bot"; text: string }
  | { kind: "tool"; name?: string; detail: string }
  | {
      kind: "approval";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "pending";
    };

/**
 * Emit a tool chip. Called by the executor BEFORE it runs the tool, so the chip
 * reaches the widget while the query is still in flight — which is why the chip
 * is a callback rather than part of the executor's return value.
 */
export type ChatToolChip = (name: string, detail: string) => void;

export type ChatToolExecutor = (
  toolUse: Anthropic.ToolUseBlock,
  chip: ChatToolChip,
) => Promise<{ content: string; isError: boolean }>;

/** The admin-only pause/resume around privileged tools. Omitted = no approvals. */
export type ChatApproval = {
  /** The unanswered tool_use a `decision` in this request refers to, if any. */
  pending: Anthropic.ToolUseBlock | null;
  decision?: { toolUseId: string; approved: boolean };
  /** Which tool_use (if any) in this model turn should pause instead of run. */
  pauseFor: (toolUses: Anthropic.ToolUseBlock[]) => Anthropic.ToolUseBlock | null;
  /** Run an approved tool. Only ever called after an approving decision. */
  run: (toolUse: Anthropic.ToolUseBlock) => Promise<{
    ok: boolean;
    resultForModel: string;
    chipDetail: string;
  }>;
  /** The tool_result content sent back when the admin declines. */
  declinedResult: string;
};

export type ChatTurnOptions = {
  /** The route's gateway client (kernel/ai/gateway), so each turn is class-checked and recorded. */
  client: AiClient;
  model: string;
  /**
   * The versioned prompt `system` was built from (Z.6.1). Every model call in
   * the loop sends it, so each is recorded under the prompt's version.
   */
  prompt: Prompt;
  system: string;
  tools: Anthropic.ToolUnion[];
  /** The conversation so far. Mutated in place as the loop appends turns. */
  messages: Anthropic.MessageParam[];
  /** `site` for logAiUsage, e.g. "admin-chat". */
  usageSite: string;
  /** Prefix for this surface's console.error lines, e.g. "admin chat". */
  logLabel: string;
  conversationId: string | null;
  /** The widget's visual history so far; this turn's items are appended to it. */
  priorItems: unknown[];
  persist: { surface: Surface; authUserId: string; personId: string | null };
  /**
   * Whether a persisted tool item carries the tool's `name`. The admin
   * transcript needs it to pick a chip label; the team transcript has one chip
   * label and has never stored it, and stored rows are what the history panel
   * replays — so the two shapes stay as they are.
   */
  recordToolName: boolean;
  executeTool: ChatToolExecutor;
  approval?: ChatApproval;
  send: (event: ChatSseEvent) => void;
};

export async function runChatTurn(opts: ChatTurnOptions): Promise<void> {
  const { messages, approval, send } = opts;

  // Streaming text deltas coalesce into one bot bubble until a tool chip or
  // approval card breaks it. The approval card a turn PAUSES on is captured
  // here; the card's later approved/declined status arrives inside the next
  // request's priorItems, so it is never double-counted.
  const turnItems: ChatTurnItem[] = [];
  let currentBot: { kind: "bot"; text: string } | null = null;
  const appendBotText = (delta: string) => {
    if (currentBot) currentBot.text += delta;
    else {
      currentBot = { kind: "bot", text: delta };
      turnItems.push(currentBot);
    }
  };

  const chip: ChatToolChip = (name, detail) => {
    send({ type: "tool", name, detail });
    currentBot = null; // a tool chip breaks the current bot bubble
    turnItems.push(opts.recordToolName ? { kind: "tool", name, detail } : { kind: "tool", detail });
  };

  // Save on the `done` event: the transcript is fully assembled here, so this
  // never depends on a second client call. Best-effort — a save failure must
  // not break the reply, so it still emits `done` with the existing id.
  const finishDone = async () => {
    const displayItems = [...opts.priorItems, ...turnItems];
    const trimmed = trimMessages(messages);
    const title = deriveTitle(displayItems);
    let savedId = opts.conversationId;
    let savedTitle: string | null = title;
    try {
      const saved = await upsertConversation({
        id: opts.conversationId,
        surface: opts.persist.surface,
        authUserId: opts.persist.authUserId,
        personId: opts.persist.personId,
        title,
        messages: trimmed,
        displayItems,
      });
      if (saved) {
        savedId = saved.id;
        savedTitle = saved.title;
      }
    } catch (err) {
      console.error(`${opts.logLabel} persist:`, err);
    }
    send({ type: "done", messages: trimmed, conversationId: savedId, title: savedTitle });
  };

  try {
    // Resolve a pending approval first: run (or decline) the action and hand the
    // tool_result to the model, then fall into the normal loop.
    if (approval?.decision && approval.pending) {
      const pending = approval.pending;
      let result: Anthropic.ToolResultBlockParam;
      if (approval.decision.approved) {
        const outcome = await approval.run(pending);
        if (outcome.ok) chip(pending.name, outcome.chipDetail);
        result = {
          type: "tool_result",
          tool_use_id: pending.id,
          content: outcome.resultForModel,
          is_error: !outcome.ok,
        };
      } else {
        result = {
          type: "tool_result",
          tool_use_id: pending.id,
          content: approval.declinedResult,
        };
      }
      messages.push({ role: "user", content: [result] });
    }

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const msgStream = opts.client.messages.stream({
        prompt: opts.prompt,
        model: opts.model,
        max_tokens: 4096,
        output_config: { effort: "medium" },
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        tools: opts.tools,
        messages: withHistoryCache(messages),
      });
      msgStream.on("text", (delta) => {
        send({ type: "text", text: delta });
        appendBotText(delta);
      });
      const msg = await msgStream.finalMessage();
      logAiUsage(opts.usageSite, opts.model, msg.usage);

      messages.push({ role: "assistant", content: msg.content });
      if (msg.stop_reason !== "tool_use") break;

      const toolUses = msg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // A tool call that needs approval pauses the turn. The pending tool_use
      // stays unanswered at the tail of `messages`; the widget's Approve/Cancel
      // POSTs the decision that resolves it.
      const pause = approval?.pauseFor(toolUses) ?? null;
      if (pause) {
        const input = pause.input as Record<string, unknown>;
        send({ type: "approval", id: pause.id, name: pause.name, input });
        currentBot = null; // the approval card breaks the current bot bubble
        turnItems.push({
          kind: "approval",
          id: pause.id,
          name: pause.name,
          input,
          status: "pending",
        });
        await finishDone();
        return;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const outcome = await opts.executeTool(tu, chip);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }

      messages.push({ role: "user", content: results });
    }

    await finishDone();
  } catch (err) {
    console.error(`${opts.logLabel} route:`, err);
    send({
      type: "error",
      error:
        err instanceof AnthropicSdk.APIError
          ? `The assistant hit an API error (${err.status ?? "network"}). Try again.`
          : "The assistant hit an unexpected error. Try again.",
    });
  }
}
