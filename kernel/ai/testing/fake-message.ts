import type Anthropic from "@anthropic-ai/sdk";

// A non-streaming `Anthropic.Message`, built from the two fields a test
// actually cares about: what the model said and why it stopped.
//
// The repo's only shared model fake before this one
// (entities/assistant/lib/chat-stream-fake.ts) covers the streaming loop, so
// every test that faked a single-shot call rolled its own object literal and
// each had to keep up with the SDK's message shape. Following the
// kernel/data/testing/ precedent: the fake lives beside the module it
// fakes for, and each suite still declares its own `vi.mock`, which vitest
// hoists per file.
export function fakeMessage(
  opts: { text?: string; stopReason?: Anthropic.Message["stop_reason"]; usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  const { text = "", stopReason = "end_turn", usage } = opts;
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-fake",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    // Usage is always present on a real response and `readTextOutput` logs it
    // on every path, so a fake without it would exercise the wrong branch.
    usage: { input_tokens: 10, output_tokens: 5, ...usage },
  } as Anthropic.Message;
}

/** The same fake carrying a JSON body, which is what a structured-output call returns. */
export const fakeJsonMessage = (value: unknown, opts: Parameters<typeof fakeMessage>[0] = {}): Anthropic.Message =>
  fakeMessage({ ...opts, text: JSON.stringify(value) });
