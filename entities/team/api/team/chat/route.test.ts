// Characterisation tests for the team chat route's own half of the turn.
//
// The streaming loop moved to entities/assistant/lib/chat-turn.ts and is pinned
// by its own tests there. What is left here is what this route decides: the
// guard, its status codes, the SSE response headers, and the ChatTurnOptions it
// builds. The load-bearing assertion is the last one — this surface passes NO
// approval hook, which is what keeps the admin assistant's write/email path
// structurally absent here rather than merely unreachable.

import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTurnOptions } from "@/entities/assistant";

type ToolOpts = { may: (p: string) => boolean; canRequestReviews: boolean; seesAnyClient: boolean };

const { getTeamActor, anthropicIfConfigured, runChatTurn, requestReviewLinks, teamChatTools, resolveChatAccess, runTeamDataTool, runMyTool, getAccess } =
  vi.hoisted(() => ({
    getTeamActor: vi.fn(),
    anthropicIfConfigured: vi.fn(),
    runChatTurn: vi.fn(),
    requestReviewLinks: vi.fn(),
    // The door's rule, in the shape it returns: every tool needs surface.team,
    // the per-client and review tools their scopes too (the assistant's
    // tool-permission tests pin the real lists).
    teamChatTools: vi.fn((o: ToolOpts) =>
      o.may("surface.team")
        ? [
            "company_totals",
            "my_work",
            ...(o.seesAnyClient ? ["client_financials", "client_contacts"] : []),
            ...(o.canRequestReviews ? ["request_review_link"] : []),
          ].map((name) => ({ name }))
        : [],
    ),
    resolveChatAccess: vi.fn(),
    runTeamDataTool: vi.fn(),
    runMyTool: vi.fn(),
    // What the person may do (ADR 0013); each test says which atoms they hold.
    getAccess: vi.fn(),
  }));

const holding = (...held: string[]) => ({ may: (p: string) => held.includes(p) });

vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor }));
vi.mock("@/kernel/identity/access-request", () => ({ getAccess }));
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured }));
// The route must hand the loop a team-chat prompt: the gateway refuses a
// prompt named after another site.
vi.mock("@/entities/assistant", async () => ({
  runChatTurn,
  teamChatTools,
  buildTeamChatPrompt: () => "SYSTEM",
  TEAM_CHAT_PROMPT: (await import("@/kernel/ai/prompts")).definePrompt("team-chat", { system: "SYSTEM" }),
}));
// The review-link tool's body lives in the team entity and reaches the database;
// the route only decides who is offered it and how its outcome is relayed.
vi.mock("@/entities/team/lib/reviews/chat-tool", () => ({ requestReviewLinks }));
// The access rules and tool bodies are pinned by entities/team/lib/chat's own
// tests; here the route only resolves access once and hands it to every tool.
vi.mock("@/entities/team/lib/chat/access", () => ({
  resolveChatAccess,
  seesAnyClient: (a: { hasRevenueAccess: boolean; assignedClientIds: string[] }) =>
    a.hasRevenueAccess || a.assignedClientIds.length > 0,
}));
vi.mock("@/entities/team/lib/chat/run-tool", () => ({
  isTeamDataTool: (name: string) => name === "company_totals" || name === "client_financials",
  runTeamDataTool,
  isMyTool: (name: string) => name === "my_work",
  runMyTool,
}));

import { ReadFailure } from "@/kernel/data/read";
import { POST } from "./route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return POST(
    new NextRequest("https://www.example.com/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function optionsFor(body: unknown): Promise<ChatTurnOptions> {
  const res = await post(body);
  await res.text();
  expect(runChatTurn).toHaveBeenCalledTimes(1);
  return runChatTurn.mock.calls[0][0] as ChatTurnOptions;
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ToolUseBlock;

describe("POST /api/team/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamActor.mockResolvedValue({
      actor: { authUserId: "auth-9", personId: "person-9", displayName: "Ana", greeting: "Ana" },
    });
    anthropicIfConfigured.mockReturnValue({ messages: {} });
    runChatTurn.mockResolvedValue(undefined);
    resolveChatAccess.mockResolvedValue({ hasRevenueAccess: false, assignedClientIds: [] });
    getAccess.mockResolvedValue(holding("surface.team"));
  });

  it("rejects a caller who is not a team member", async () => {
    getTeamActor.mockResolvedValue({ actor: null });
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it("503s when the assistant is not configured", async () => {
    anthropicIfConfigured.mockReturnValue(null);
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "The assistant is not configured (missing API key)",
    });
  });

  it("400s on an unparseable body", async () => {
    const res = await POST(
      new NextRequest("https://www.example.com/api/team/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("400s on an empty messages array", async () => {
    const res = await post({ messages: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages is required" });
  });

  it("answers with an SSE stream and hands the loop the team member's turn", async () => {
    const res = await post({
      messages: [{ role: "user", content: "hi" }],
      displayItems: [{ kind: "user", text: "hi" }],
      conversationId: "conv-9",
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    await res.text();

    const opts = runChatTurn.mock.calls[0][0] as ChatTurnOptions;
    expect(opts).toMatchObject({
      system: "SYSTEM",
      usageSite: "team-chat",
      logLabel: "team chat",
      conversationId: "conv-9",
      priorItems: [{ kind: "user", text: "hi" }],
      persist: { surface: "team", authUserId: "auth-9", personId: "person-9" },
      // The team transcript has only ever stored the chip's detail.
      recordToolName: false,
    });
    expect(opts.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(opts.prompt.name).toBe("team-chat");
  });

  it("passes no approval hook, so this surface has no write or email path at all", async () => {
    const opts = await optionsFor({ messages: [{ role: "user", content: "hi" }] });
    expect(opts.approval).toBeUndefined();
  });

  it("defaults a missing conversationId and displayItems", async () => {
    const opts = await optionsFor({ messages: [{ role: "user", content: "hi" }] });
    expect(opts.conversationId).toBeNull();
    expect(opts.priorItems).toEqual([]);
  });

  it("writes the SSE frames the loop sends", async () => {
    runChatTurn.mockImplementation(async (o: ChatTurnOptions) => {
      o.send({ type: "text", text: "hi" });
      o.send({ type: "done", messages: [], conversationId: "c1", title: "T" });
    });
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(await res.text()).toBe(
      'data: {"type":"text","text":"hi"}\n\n' +
        'data: {"type":"done","messages":[],"conversationId":"c1","title":"T"}\n\n',
    );
  });

  describe("tool dispatch", () => {
    it("runs a data tool with the access resolved from the session, whatever the input says", async () => {
      const access = { hasRevenueAccess: false, assignedClientIds: ["client-a"] };
      resolveChatAccess.mockResolvedValue(access);
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runTeamDataTool.mockResolvedValue({ content: "{}", isError: false });
      const chip = vi.fn();
      const input = { company: "Client B", hasRevenueAccess: true, assignedClientIds: ["client-b"] };
      const out = await opts.executeTool(toolUse("tu1", "client_financials", input), chip);
      expect(runTeamDataTool).toHaveBeenCalledWith("client_financials", input, access);
      expect(chip.mock.calls[0][0]).toBe("client_financials");
      expect(chip.mock.calls[0][1].length).toBeLessThanOrEqual(120);
      expect(out).toEqual({ content: "{}", isError: false });
    });

    it("runs a my_* tool for the signed-in actor, whatever person the input names", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runMyTool.mockResolvedValue({ content: "{}", isError: false });
      const chip = vi.fn();
      const input = { personId: "person-other", teamMemberId: "tm-other", name: "Someone Else" };
      const out = await opts.executeTool(toolUse("tu1", "my_work", input), chip);
      expect(runMyTool).toHaveBeenCalledWith("my_work", input, expect.objectContaining({ authUserId: "auth-9", personId: "person-9" }));
      expect(chip).toHaveBeenCalledWith("my_work", "my work");
      expect(runTeamDataTool).not.toHaveBeenCalled();
      expect(out).toEqual({ content: "{}", isError: false });
    });

    it("resolves access once per request, from the signed-in actor", async () => {
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(resolveChatAccess).toHaveBeenCalledTimes(1);
      expect(resolveChatAccess).toHaveBeenCalledWith(expect.objectContaining({ authUserId: "auth-9" }), expect.objectContaining({ may: expect.any(Function) }));
    });

    it("refuses the turn when access cannot be read, rather than answering as unassigned", async () => {
      resolveChatAccess.mockRejectedValue(new ReadFailure("[team/chat] staff_assignments", "boom"));
      const res = await post({ messages: [{ role: "user", content: "hi" }] });
      expect(res.status).toBe(503);
      expect(runChatTurn).not.toHaveBeenCalled();
    });

    it("offers the per-client tools only to someone who can see a client", async () => {
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith(expect.objectContaining({ canRequestReviews: false, seesAnyClient: false }));
      vi.clearAllMocks();
      runChatTurn.mockResolvedValue(undefined);
      resolveChatAccess.mockResolvedValue({ hasRevenueAccess: false, assignedClientIds: ["client-a"] });
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith(expect.objectContaining({ canRequestReviews: false, seesAnyClient: true }));
    });

    it("offers request_review_link only to admins, managers, and the talent director", async () => {
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith(expect.objectContaining({ canRequestReviews: false, seesAnyClient: false }));
      vi.clearAllMocks();
      runChatTurn.mockResolvedValue(undefined);
      resolveChatAccess.mockResolvedValue({ hasRevenueAccess: false, assignedClientIds: [] });
      getTeamActor.mockResolvedValue({
        actor: { authUserId: "a", personId: "p", displayName: "Mai", greeting: "Mai", email: "mai@example.com", role: "employee", isAdmin: false },
      });
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith(expect.objectContaining({ canRequestReviews: true, seesAnyClient: false }));
    });

    it("treats request_review_link as unknown for a caller it was not offered to", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const out = await opts.executeTool(toolUse("tu1", "request_review_link", { subject: "x", reviewers: [] }), vi.fn());
      expect(out).toEqual({ content: "Unknown tool: request_review_link", isError: true });
      expect(requestReviewLinks).not.toHaveBeenCalled();
    });

    it("chips and runs request_review_link for a manager, relaying the outcome", async () => {
      const actor = { authUserId: "a", personId: "p", displayName: "Q", greeting: "Q", email: "q@example.com", role: "manager", isAdmin: false };
      getTeamActor.mockResolvedValue({ actor });
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const outcome = { ok: true, links: [{ name: "L", kind: "external", link: "https://x/y", created: true }], skipped: [] };
      requestReviewLinks.mockResolvedValue(outcome);
      const chip = vi.fn();
      const out = await opts.executeTool(
        toolUse("tu1", "request_review_link", { subject: "Ngoc", reviewers: [{ name: "L", email: "l@x.com" }], send: "yes" }),
        chip,
      );
      expect(chip).toHaveBeenCalledWith("request_review_link", "review link: Ngoc");
      // `send` must be a literal true; anything else never emails.
      expect(requestReviewLinks).toHaveBeenCalledWith(actor, {
        subject: "Ngoc",
        reviewers: [{ name: "L", email: "l@x.com" }],
        send: false,
      });
      expect(out).toEqual({ content: JSON.stringify(outcome), isError: false });
    });

    it("reports every other tool, privileged names included, as unknown", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(await opts.executeTool(toolUse("tu1", "nope", {}), vi.fn())).toEqual({
        content: "Unknown tool: nope",
        isError: true,
      });
      expect(await opts.executeTool(toolUse("tu2", "execute_write", {}), vi.fn())).toEqual({
        content: "Unknown tool: execute_write",
        isError: true,
      });
    });
  });

  describe("tools follow the person's permissions (ADR 0013)", () => {
    it("hands no tool to someone without the Team view's permission, and refuses a data tool call anyway", async () => {
      getAccess.mockResolvedValue(holding());
      resolveChatAccess.mockResolvedValue({ hasRevenueAccess: true, assignedClientIds: ["client-a"] });
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(opts.tools).toEqual([]);
      expect(await opts.executeTool(toolUse("tu1", "company_totals", {}), vi.fn())).toEqual({
        content: "Unknown tool: company_totals",
        isError: true,
      });
      expect(runTeamDataTool).not.toHaveBeenCalled();
      expect(await opts.executeTool(toolUse("tu2", "my_work", {}), vi.fn())).toEqual({
        content: "Unknown tool: my_work",
        isError: true,
      });
      expect(runMyTool).not.toHaveBeenCalled();
    });

    it("refuses a per-client tool the person was not handed, before its body runs", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(await opts.executeTool(toolUse("tu1", "client_financials", { company: "Acme" }), vi.fn())).toEqual({
        content: "Unknown tool: client_financials",
        isError: true,
      });
      expect(runTeamDataTool).not.toHaveBeenCalled();
    });

    it("refuses the turn when the person's access cannot be read", async () => {
      getAccess.mockRejectedValue(new ReadFailure("[access] access_roles", "boom"));
      const res = await post({ messages: [{ role: "user", content: "hi" }] });
      expect(res.status).toBe(503);
      expect(runChatTurn).not.toHaveBeenCalled();
    });
  });
});
