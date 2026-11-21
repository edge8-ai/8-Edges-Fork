import type Anthropic from "@anthropic-ai/sdk";

/**
 * Prompt-cache breakpoints for the conversation history in the agent loops.
 *
 * The loops re-send the whole conversation on every iteration. With the only
 * breakpoint on `system`, the tools + system prefix is cached but every tool
 * result and assistant turn accumulated so far is re-read at full input price,
 * up to MAX_ITERATIONS times per user message. Marking the tail of the history
 * makes each iteration read what the previous one wrote.
 */

/** Block types that accept `cache_control`. Thinking blocks do not. */
const CACHEABLE = new Set(["text", "image", "document", "tool_use", "tool_result"]);

type Block = Anthropic.MessageParam["content"] extends string | (infer B)[] ? B : never;

/**
 * Return a copy of `message` with a cache breakpoint on its last cacheable
 * block, or null when it has none (a thinking-only assistant turn).
 */
function markLastBlock(message: Anthropic.MessageParam): Anthropic.MessageParam | null {
  if (typeof message.content === "string") {
    if (!message.content) return null;
    return {
      ...message,
      content: [
        { type: "text", text: message.content, cache_control: { type: "ephemeral" } },
      ],
    };
  }

  const blocks = [...message.content] as Block[];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i] as { type?: string };
    if (!block?.type || !CACHEABLE.has(block.type)) continue;
    blocks[i] = { ...blocks[i], cache_control: { type: "ephemeral" } } as Block;
    return { ...message, content: blocks as Anthropic.MessageParam["content"] };
  }
  return null;
}

/**
 * A view of `messages` with breakpoints on the last two cacheable turns.
 *
 * Two, not one: the newest turn is still being written to cache when the next
 * request goes out, so the second breakpoint gives that request an older
 * boundary it can actually read from. Combined with the one on `system` that
 * is 3 of the API's 4 permitted breakpoints.
 *
 * Always returns a copy. Marking the live array instead would accumulate a new
 * breakpoint every iteration and blow the limit within one turn.
 */
export function withHistoryCache(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  const out = [...messages];
  let applied = 0;
  for (let i = out.length - 1; i >= 0 && applied < 2; i--) {
    const marked = markLastBlock(out[i]);
    if (!marked) continue;
    out[i] = marked;
    applied++;
  }
  return out;
}
