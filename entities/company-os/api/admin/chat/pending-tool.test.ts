import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

// This is the gate an approve/deny decision is checked against: the route
// refuses the decision unless this returns a block whose id matches. Every
// `null` below is therefore a refusal, and every non-null one is a write the
// admin is about to authorise — so the shapes it accepts are the security
// surface, not a detail.
//
// The assistant door is stubbed to a fixed privileged set: this file is about
// the shape test, not about which tools happen to be privileged today.
vi.mock("@/entities/assistant", () => ({
  PRIVILEGED_TOOL_NAMES: new Set(["execute_write", "send_email", "invite_portal_member"]),
}));

const { getPendingToolUse } = await import("./pending-tool");

const toolUse = (id: string, name: string): Anthropic.ToolUseBlock =>
  ({ type: "tool_use", id, name, input: {} }) as Anthropic.ToolUseBlock;

const assistant = (content: unknown[]): Anthropic.MessageParam =>
  ({ role: "assistant", content }) as Anthropic.MessageParam;

describe("getPendingToolUse", () => {
  it("returns the block when the tail is one privileged tool_use", () => {
    const block = toolUse("tu_1", "execute_write");
    expect(getPendingToolUse([assistant([block])])).toBe(block);
  });

  it("accepts a privileged tool_use alongside text in the same turn", () => {
    const block = toolUse("tu_1", "send_email");
    const out = getPendingToolUse([assistant([{ type: "text", text: "About to send:" }, block])]);
    expect(out).toBe(block);
  });

  it("looks only at the LAST message", () => {
    const older = assistant([toolUse("tu_0", "execute_write")]);
    const tail: Anthropic.MessageParam = { role: "user", content: "and then?" };
    expect(getPendingToolUse([older, tail])).toBeNull();
  });

  it("returns null for two tool_use blocks, privileged or not", () => {
    // The loop only ever pauses on a single privileged call; two means the
    // model batched, and approving one id would silently run the other.
    expect(getPendingToolUse([assistant([
      toolUse("tu_1", "execute_write"),
      toolUse("tu_2", "send_email"),
    ])])).toBeNull();
    expect(getPendingToolUse([assistant([
      toolUse("tu_1", "execute_write"),
      toolUse("tu_2", "run_query"),
    ])])).toBeNull();
  });

  it("returns null for a tool_use that is not privileged", () => {
    expect(getPendingToolUse([assistant([toolUse("tu_1", "run_query")])])).toBeNull();
  });

  it("returns null when the tail is not an assistant turn", () => {
    expect(getPendingToolUse([{ role: "user", content: "hi" }])).toBeNull();
    expect(getPendingToolUse([{
      role: "user",
      content: [toolUse("tu_1", "execute_write")],
    } as Anthropic.MessageParam])).toBeNull();
  });

  it("returns null when the tail has string content, not blocks", () => {
    expect(getPendingToolUse([{ role: "assistant", content: "just talking" }])).toBeNull();
  });

  it("returns null for an assistant turn with no tool_use at all", () => {
    expect(getPendingToolUse([assistant([{ type: "text", text: "done" }])])).toBeNull();
    expect(getPendingToolUse([assistant([])])).toBeNull();
  });

  it("returns null for an empty conversation", () => {
    expect(getPendingToolUse([])).toBeNull();
  });
});
