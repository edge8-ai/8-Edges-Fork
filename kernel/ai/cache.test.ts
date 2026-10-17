import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { withHistoryCache } from "./cache";

// The cache breakpoints are invisible when they are wrong: the loop still
// answers, it just re-reads the whole conversation at full price, or trips the
// API's four-breakpoint limit and fails mid-turn. Both failure modes are
// arithmetic on the returned array, so they are pinned here.

type Msg = Anthropic.MessageParam;

const text = (t: string): Msg => ({ role: "user", content: [{ type: "text", text: t }] });
const CACHE = { type: "ephemeral" };

/** Every block in `messages` carrying a cache breakpoint, as `i:j` positions. */
function breakpoints(messages: Msg[]): string[] {
  const out: string[] = [];
  messages.forEach((m, i) => {
    if (typeof m.content === "string") return;
    m.content.forEach((b, j) => {
      if ((b as { cache_control?: unknown }).cache_control) out.push(`${i}:${j}`);
    });
  });
  return out;
}

describe("withHistoryCache", () => {
  it("marks the last two turns, and only those", () => {
    const out = withHistoryCache([text("a"), text("b"), text("c"), text("d")]);
    expect(breakpoints(out)).toEqual(["2:0", "3:0"]);
  });

  it("marks one turn when that is all there is", () => {
    expect(breakpoints(withHistoryCache([text("only")]))).toEqual(["0:0"]);
  });

  it("returns an empty history untouched", () => {
    expect(withHistoryCache([])).toEqual([]);
  });

  it("never mutates the array it was given", () => {
    // The loops re-send the live array every iteration. Marking it in place
    // would add a breakpoint per iteration and blow the API's limit inside one
    // turn, which is exactly why this returns a copy.
    const input = [text("a"), text("b")];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = withHistoryCache(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
  });

  it("is idempotent in effect: re-marking a marked history still yields two", () => {
    const once = withHistoryCache([text("a"), text("b"), text("c")]);
    const twice = withHistoryCache(once);
    expect(breakpoints(twice)).toEqual(["1:0", "2:0"]);
  });

  it("marks the LAST cacheable block of a turn, not the first", () => {
    const assistant: Msg = {
      role: "assistant",
      content: [
        { type: "text", text: "thinking out loud" },
        { type: "tool_use", id: "tu_1", name: "search", input: {} },
      ],
    };
    const out = withHistoryCache([assistant]);
    expect(breakpoints(out)).toEqual(["0:1"]);
  });

  it("skips a thinking-only turn and marks the next markable one instead", () => {
    // Thinking blocks do not accept cache_control. A turn made only of them
    // must be stepped over, or the two breakpoints land on nothing.
    const thinkingOnly = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "hmm", signature: "sig" }],
    } as unknown as Msg;
    const out = withHistoryCache([text("a"), text("b"), thinkingOnly]);
    expect(breakpoints(out)).toEqual(["0:0", "1:0"]);
  });

  it("marks the last cacheable block of a turn that mixes thinking and text", () => {
    const mixed = {
      role: "assistant",
      content: [
        { type: "text", text: "answer" },
        { type: "thinking", thinking: "hmm", signature: "sig" },
      ],
    } as unknown as Msg;
    const out = withHistoryCache([mixed]);
    expect(breakpoints(out)).toEqual(["0:0"]);
  });

  it("promotes a string-content turn to a marked text block", () => {
    const out = withHistoryCache([{ role: "user", content: "hello" }]);
    expect(out[0].content).toEqual([{ type: "text", text: "hello", cache_control: CACHE }]);
  });

  it("skips an empty string turn, which has nothing to mark", () => {
    const out = withHistoryCache([text("a"), { role: "user", content: "" }]);
    expect(out[1].content).toBe("");
    expect(breakpoints(out)).toEqual(["0:0"]);
  });

  it("skips a turn with an empty block list", () => {
    const out = withHistoryCache([text("a"), { role: "assistant", content: [] }]);
    expect(breakpoints(out)).toEqual(["0:0"]);
  });
});
