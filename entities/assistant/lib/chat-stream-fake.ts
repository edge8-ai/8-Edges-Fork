import type Anthropic from "@anthropic-ai/sdk";

/**
 * A scripted stand-in for the Anthropic streaming client, used by the agent
 * loop's characterisation tests.
 *
 * The real `client.messages.stream()` emits `text` deltas while the request is
 * in flight and resolves `finalMessage()` afterwards. Replaying the deltas from
 * inside `finalMessage()` produces the same observable ordering for a caller
 * that awaits it, which is exactly what both routes do.
 *
 * It lives beside the loop rather than inside the test file so a second surface's
 * tests can drive the same loop without a second copy of the double — the kind of
 * duplication this lane exists to remove.
 */

export type ScriptedTurn = {
  /** Text deltas the model streams for this turn, in order. */
  texts?: string[];
  /** The final message's content blocks. */
  content: Anthropic.ContentBlock[];
  stop_reason: Anthropic.Message["stop_reason"];
};

export type FakeAnthropic = {
  client: Anthropic;
  /** Every params object the loop passed to `messages.stream()`. */
  calls: Anthropic.MessageCreateParamsStreaming[];
};

export function fakeAnthropic(turns: ScriptedTurn[]): FakeAnthropic {
  const calls: Anthropic.MessageCreateParamsStreaming[] = [];
  let index = 0;
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParamsStreaming) {
        calls.push(JSON.parse(JSON.stringify(params)));
        const turn = turns[index++];
        if (!turn) throw new Error("fakeAnthropic: ran out of scripted turns");
        const handlers = new Map<string, (delta: string) => void>();
        return {
          on(event: string, cb: (delta: string) => void) {
            handlers.set(event, cb);
            return this;
          },
          async finalMessage(): Promise<Anthropic.Message> {
            for (const delta of turn.texts ?? []) handlers.get("text")?.(delta);
            return {
              id: `msg_${index}`,
              type: "message",
              role: "assistant",
              model: "test",
              content: turn.content,
              stop_reason: turn.stop_reason,
              stop_sequence: null,
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
              },
            } as unknown as Anthropic.Message;
          },
        };
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}
