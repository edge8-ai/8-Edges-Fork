import type Anthropic from "@anthropic-ai/sdk";

// How many messages a stored chat transcript may carry back into the next turn.
const MAX_MESSAGES = 24;
// Tool results are kept verbatim only for this many trailing messages.
const KEEP_RECENT = 6;

/**
 * Cap the transcript a chat client echoes back on its next request.
 *
 * Two separate reductions, in order:
 *
 *  - Blank the body of every `tool_result` outside the last few messages. Query
 *    rows are the bulk of a long assistant transcript and the model almost never
 *    re-reads old ones, so this is where the tokens actually are. The block is
 *    replaced, never removed, because a `tool_result` must keep answering its
 *    `tool_use` or the API rejects the request.
 *  - Drop whole turns from the front once the array is still too long, cutting
 *    only at a plain user text turn. Slicing anywhere else can orphan a
 *    `tool_result` from its `tool_use` — the same pairing rule, at the seam.
 *
 * Shared because the admin and team chat routes had byte-identical copies: the
 * pairing invariant above is an Anthropic API rule, not a per-surface policy, so
 * a fix to it must not be able to land on only one of the two.
 */
export function trimMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = messages.map((m, i) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    if (i >= messages.length - KEEP_RECENT) return m;
    return {
      ...m,
      content: m.content.map((block) =>
        block.type === "tool_result"
          ? { ...block, content: "[old query results omitted]" }
          : block,
      ),
    };
  });

  if (out.length <= MAX_MESSAGES) return out;
  // Find the earliest cut point that starts on a plain user text turn.
  for (let i = out.length - MAX_MESSAGES; i < out.length; i++) {
    const m = out[i];
    const isPlainUser =
      m.role === "user" &&
      (typeof m.content === "string" ||
        (Array.isArray(m.content) && m.content.every((b) => b.type === "text")));
    if (isPlainUser) return out.slice(i);
  }
  return out;
}
