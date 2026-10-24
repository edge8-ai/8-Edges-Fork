// Characterisation tests for the shared streaming agent loop.
//
// Written against the behaviour the two chat routes had BEFORE the loop moved
// out of them, and kept afterwards: they pin the SSE event names, payload
// shapes and ordering, the `done` payload, and the persistence call — the whole
// observable contract between either route and its widget. The admin-only
// approval pause/resume path is pinned here in full, driven through the
// `approval` hook the admin route passes and the team route does not.
//
// The loop lives in the assistant entity, so its tests do too: a route test in
// company-os or team could only reach it through the entity's door, and the
// door is exactly what the routes mock.

import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definePrompt } from "@/kernel/ai/prompts";
import { fakeAnthropic, type ScriptedTurn } from "./chat-stream-fake";

const { upsertConversation } = vi.hoisted(() => ({ upsertConversation: vi.fn() }));

vi.mock("./history/store", () => ({ upsertConversation }));
vi.mock("./history/title", () => ({ deriveTitle: () => "Derived title" }));
vi.mock("@/kernel/ai/response", () => ({ logAiUsage: () => {} }));

import { runChatTurn, type ChatSseEvent, type ChatTurnOptions } from "./chat-turn";

// The loop sends whatever prompt the route hands it; a stand-in will do (Z.6.1).
const PROMPT = definePrompt("admin-chat", { system: "SYSTEM" });

const textBlock = (text: string) =>
  ({ type: "text", text, citations: null }) as unknown as Anthropic.ContentBlock;
const toolBlock = (id: string, name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;

/**
 * Run the loop over a scripted model and collect what it emitted. `overrides`
 * carries the per-surface half — the executor, the approval hook, the persist
 * target — so each test states only the difference it is about.
 */
async function run(
  turns: ScriptedTurn[],
  overrides: Partial<ChatTurnOptions> = {},
): Promise<{ events: ChatSseEvent[]; calls: Anthropic.MessageCreateParamsStreaming[] }> {
  const fake = fakeAnthropic(turns);
  const events: ChatSseEvent[] = [];
  await runChatTurn({
    client: fake.client,
    model: "test-model",
    prompt: PROMPT,
    system: "SYSTEM",
    tools: [{ name: "query_database" } as unknown as Anthropic.ToolUnion],
    messages: [{ role: "user", content: "hi" }],
    usageSite: "admin-chat",
    logLabel: "admin chat",
    conversationId: null,
    priorItems: [],
    persist: { surface: "admin", authUserId: "auth-1", personId: null },
    recordToolName: true,
    executeTool: async (tu) => ({ content: `Unknown tool: ${tu.name}`, isError: true }),
    send: (event) => events.push(event),
    ...overrides,
  });
  return { events, calls: fake.calls };
}

describe("runChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertConversation.mockResolvedValue({ id: "conv-1", title: "Saved title" });
  });

  it("streams text deltas then done, and persists the transcript", async () => {
    const { events } = await run([
      { texts: ["Hel", "lo"], content: [textBlock("Hello")], stop_reason: "end_turn" },
    ]);
    expect(events).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      {
        type: "done",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: [{ type: "text", text: "Hello", citations: null }] },
        ],
        conversationId: "conv-1",
        title: "Saved title",
      },
    ]);
    expect(upsertConversation).toHaveBeenCalledWith({
      id: null,
      surface: "admin",
      authUserId: "auth-1",
      personId: null,
      title: "Derived title",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: "Hello", citations: null }] },
      ],
      displayItems: [{ kind: "bot", text: "Hello" }],
    });
  });

  it("sends the model the system prompt, tools and cached history each iteration", async () => {
    const { calls } = await run([{ content: [textBlock("hi")], stop_reason: "end_turn" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      prompt: PROMPT,
      model: "test-model",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      tools: [{ name: "query_database" }],
    });
  });

  it("emits a tool chip before the tool runs and feeds the result back", async () => {
    const order: string[] = [];
    const { events, calls } = await run(
      [
        { content: [toolBlock("tu1", "query_database", {})], stop_reason: "tool_use" },
        { texts: ["one"], content: [textBlock("one")], stop_reason: "end_turn" },
      ],
      {
        executeTool: async (tu, chip) => {
          chip("query_database", "select 1");
          order.push("ran");
          return { content: '{"rows":[]}', isError: false };
        },
      },
    );
    // The chip reaches the widget while the query is still in flight.
    expect(events[0]).toEqual({ type: "tool", name: "query_database", detail: "select 1" });
    expect(order).toEqual(["ran"]);
    expect(events[1]).toEqual({ type: "text", text: "one" });
    const second = calls[1].messages;
    expect(second[second.length - 1]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu1",
          content: '{"rows":[]}',
          is_error: false,
          cache_control: { type: "ephemeral" },
        },
      ],
    });
    expect(upsertConversation.mock.calls[0][0].displayItems).toEqual([
      { kind: "tool", name: "query_database", detail: "select 1" },
      { kind: "bot", text: "one" },
    ]);
  });

  it("omits the tool name from the persisted item when recordToolName is false", async () => {
    // The team transcript has only ever stored the chip's detail, and stored
    // rows are what the history panel replays.
    await run(
      [
        { content: [toolBlock("tu1", "query_database", {})], stop_reason: "tool_use" },
        { texts: ["one"], content: [textBlock("one")], stop_reason: "end_turn" },
      ],
      {
        recordToolName: false,
        executeTool: async (_tu, chip) => {
          chip("query_database", "select 1");
          return { content: "{}", isError: false };
        },
      },
    );
    expect(upsertConversation.mock.calls[0][0].displayItems).toEqual([
      { kind: "tool", detail: "select 1" },
      { kind: "bot", text: "one" },
    ]);
  });

  it("breaks the bot bubble at a chip and appends this turn's items to the prior ones", async () => {
    await run(
      [
        {
          texts: ["before"],
          content: [toolBlock("tu1", "query_database", {})],
          stop_reason: "tool_use",
        },
        { texts: ["after"], content: [textBlock("after")], stop_reason: "end_turn" },
      ],
      {
        priorItems: [{ kind: "user", text: "q" }],
        executeTool: async (_tu, chip) => {
          chip("query_database", "select 1");
          return { content: "{}", isError: false };
        },
      },
    );
    expect(upsertConversation.mock.calls[0][0].displayItems).toEqual([
      { kind: "user", text: "q" },
      { kind: "bot", text: "before" },
      { kind: "tool", name: "query_database", detail: "select 1" },
      { kind: "bot", text: "after" },
    ]);
  });

  it("reports an unknown tool back to the model", async () => {
    const { calls } = await run([
      { content: [toolBlock("tu1", "nope", {})], stop_reason: "tool_use" },
      { content: [textBlock("ok")], stop_reason: "end_turn" },
    ]);
    expect(calls[1].messages.at(-1)).toMatchObject({
      content: [
        { type: "tool_result", tool_use_id: "tu1", content: "Unknown tool: nope", is_error: true },
      ],
    });
  });

  it("stops after MAX_ITERATIONS tool rounds rather than looping forever", async () => {
    const toolTurn: ScriptedTurn = {
      content: [toolBlock("tu1", "query_database", {})],
      stop_reason: "tool_use",
    };
    const { calls, events } = await run(Array.from({ length: 9 }, () => toolTurn), {
      executeTool: async () => ({ content: "{}", isError: false }),
    });
    expect(calls).toHaveLength(8);
    expect((events.at(-1) as { type: string }).type).toBe("done");
  });

  describe("the approval hook", () => {
    const approval = (over: Partial<NonNullable<ChatTurnOptions["approval"]>> = {}) => ({
      pending: null,
      pauseFor: (toolUses: Anthropic.ToolUseBlock[]) =>
        toolUses.length === 1 && toolUses[0].name === "execute_write" ? toolUses[0] : null,
      run: async () => ({ ok: true, resultForModel: "1 row", chipDetail: "Updated x" }),
      declinedResult: "The admin declined this action.",
      ...over,
    });

    it("pauses on the tool call it selects and ends the turn on `approval`", async () => {
      const { events } = await run(
        [
          {
            texts: ["About to write."],
            content: [toolBlock("tu9", "execute_write", { sql: "update x" })],
            stop_reason: "tool_use",
          },
        ],
        { approval: approval() },
      );
      expect(events[0]).toEqual({ type: "text", text: "About to write." });
      expect(events[1]).toEqual({
        type: "approval",
        id: "tu9",
        name: "execute_write",
        input: { sql: "update x" },
      });
      expect((events[2] as { type: string }).type).toBe("done");
      expect(events).toHaveLength(3);
      expect(upsertConversation.mock.calls[0][0].displayItems).toEqual([
        { kind: "bot", text: "About to write." },
        {
          kind: "approval",
          id: "tu9",
          name: "execute_write",
          input: { sql: "update x" },
          status: "pending",
        },
      ]);
    });

    it("runs the pending tool only after an approving decision", async () => {
      const pending = toolBlock("tu9", "execute_write", {
        sql: "update x",
      }) as Anthropic.ToolUseBlock;
      const runTool = vi.fn().mockResolvedValue({
        ok: true,
        resultForModel: "1 row",
        chipDetail: "Updated x",
      });
      const { events, calls } = await run(
        [{ texts: ["Done."], content: [textBlock("Done.")], stop_reason: "end_turn" }],
        {
          approval: approval({
            pending,
            decision: { toolUseId: "tu9", approved: true },
            run: runTool,
          }),
        },
      );
      expect(runTool).toHaveBeenCalledWith(pending);
      expect(events[0]).toEqual({ type: "tool", name: "execute_write", detail: "Updated x" });
      expect(events[1]).toEqual({ type: "text", text: "Done." });
      expect(calls[0].messages.at(-1)).toMatchObject({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu9", content: "1 row", is_error: false },
        ],
      });
    });

    it("marks the tool_result an error and skips the chip when the tool fails", async () => {
      const pending = toolBlock("tu9", "execute_write", {}) as Anthropic.ToolUseBlock;
      const { events, calls } = await run(
        [{ content: [textBlock("Sorry.")], stop_reason: "end_turn" }],
        {
          approval: approval({
            pending,
            decision: { toolUseId: "tu9", approved: true },
            run: async () => ({ ok: false, resultForModel: "denied", chipDetail: "n/a" }),
          }),
        },
      );
      expect(events.some((e) => e.type === "tool")).toBe(false);
      expect(calls[0].messages.at(-1)).toMatchObject({
        content: [{ type: "tool_result", tool_use_id: "tu9", content: "denied", is_error: true }],
      });
    });

    it("declines without running anything and tells the model so", async () => {
      const pending = toolBlock("tu9", "send_email", {}) as Anthropic.ToolUseBlock;
      const runTool = vi.fn();
      const { calls } = await run(
        [{ content: [textBlock("Okay.")], stop_reason: "end_turn" }],
        {
          approval: approval({
            pending,
            decision: { toolUseId: "tu9", approved: false },
            run: runTool,
          }),
        },
      );
      expect(runTool).not.toHaveBeenCalled();
      // No `is_error` on a decline: the model is told in prose, not by a flag.
      expect(calls[0].messages.at(-1)).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu9",
            content: "The admin declined this action.",
            cache_control: { type: "ephemeral" },
          },
        ],
      });
    });

    it("falls through to executeTool when pauseFor selects nothing", async () => {
      const { calls } = await run(
        [
          {
            content: [
              toolBlock("tu1", "query_database", {}),
              toolBlock("tu2", "execute_write", {}),
            ],
            stop_reason: "tool_use",
          },
          { content: [textBlock("ok")], stop_reason: "end_turn" },
        ],
        {
          approval: approval(),
          executeTool: async (tu) => ({ content: `refused ${tu.name}`, isError: true }),
        },
      );
      const results = (calls[1].messages.at(-1) as { content: { content: string }[] }).content;
      expect(results.map((r) => r.content)).toEqual(["refused query_database", "refused execute_write"]);
    });

    it("never pauses on a surface that passes no approval hook", async () => {
      const { events } = await run([
        {
          content: [toolBlock("tu9", "execute_write", {})],
          stop_reason: "tool_use",
        },
        { content: [textBlock("ok")], stop_reason: "end_turn" },
      ]);
      expect(events.some((e) => e.type === "approval")).toBe(false);
    });
  });

  it("emits an error event when the model call throws", async () => {
    const events: ChatSseEvent[] = [];
    await runChatTurn({
      client: {
        messages: {
          stream() {
            throw new Error("boom");
          },
        },
      } as unknown as Anthropic,
      model: "test-model",
      prompt: PROMPT,
      system: "SYSTEM",
      tools: [],
      messages: [{ role: "user", content: "hi" }],
      usageSite: "team-chat",
      logLabel: "team chat",
      conversationId: null,
      priorItems: [],
      persist: { surface: "team", authUserId: "auth-2", personId: "p1" },
      recordToolName: false,
      executeTool: async () => ({ content: "", isError: false }),
      send: (event) => events.push(event),
    });
    expect(events).toEqual([
      { type: "error", error: "The assistant hit an unexpected error. Try again." },
    ]);
    expect(upsertConversation).not.toHaveBeenCalled();
  });

  it("still emits done, with the existing id, when the save fails", async () => {
    upsertConversation.mockRejectedValue(new Error("db down"));
    const { events } = await run([{ content: [textBlock("hi")], stop_reason: "end_turn" }], {
      conversationId: "conv-7",
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "conv-7",
      title: "Derived title",
    });
  });

  it("keeps the existing id and derived title when the store returns nothing", async () => {
    upsertConversation.mockResolvedValue(null);
    const { events } = await run([{ content: [textBlock("hi")], stop_reason: "end_turn" }], {
      conversationId: "conv-7",
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "conv-7",
      title: "Derived title",
    });
  });
});
