import type Anthropic from "@anthropic-ai/sdk";
import { PRIVILEGED_TOOL_NAMES } from "@/entities/assistant";

/**
 * The pending privileged tool_use a decision refers to: the last message must
 * be an assistant turn whose ONLY tool_use is a privileged one (that is the
 * exact shape the chat loop pauses on).
 *
 * It lives beside the route rather than inside it because it is the gate an
 * approve/deny decision is checked against, and a route file may only export
 * the HTTP verbs — so this is the only way it can be tested directly.
 */
export function getPendingToolUse(
  messages: Anthropic.MessageParam[],
): Anthropic.ToolUseBlock | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.content)) return null;
  const toolUses = last.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (toolUses.length !== 1 || !PRIVILEGED_TOOL_NAMES.has(toolUses[0].name)) return null;
  return toolUses[0];
}
