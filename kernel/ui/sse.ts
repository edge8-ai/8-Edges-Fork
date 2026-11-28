// Browser-safe SSE frame reader for the streaming chat surfaces.
//
// AdminChatWidget, TeamChatWidget and PlanChat each hand-rolled the same
// `indexOf("\n\n")` buffer loop over `res.body`. Three copies of a parser is
// three chances to get a split frame wrong, and a chunk boundary is exactly the
// case a hand test never hits — so the loop lives here once.
//
// Two details this preserves from the copies it replaces:
//   - `decoder.decode(value, { stream: true })` is what makes a multi-byte
//     character split across two chunks survive; a fresh TextDecoder per read
//     would turn it into U+FFFD.
//   - The generator does NOT parse JSON. A malformed payload is the caller's
//     concern, and every caller skips it rather than throwing.

export type SseFrame = { event?: string; data: string };

/**
 * Yield one frame per `data:` line in the response body, in order.
 *
 * A frame's optional `event:` line (SSE's event-name field) is attached to
 * every `data:` line in the same block. Lines that are neither are ignored, as
 * are the trailing bytes of an unterminated final frame — a stream cut mid-frame
 * has no complete event to report, and the chat callers detect the truncation
 * by the absence of their own `done` event.
 */
export async function* sseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event: string | undefined;
      const frames: SseFrame[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) frames.push({ data: line.slice(6) });
      }
      for (const frame of frames) yield event === undefined ? frame : { event, data: frame.data };
    }
  }
}
