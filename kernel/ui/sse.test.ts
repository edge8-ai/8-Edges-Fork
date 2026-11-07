import { describe, expect, it } from "vitest";
import { sseEvents, type SseFrame } from "./sse";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const utf8 = (s: string) => new TextEncoder().encode(s);

async function drain(stream: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const out: SseFrame[] = [];
  for await (const frame of sseEvents(stream)) out.push(frame);
  return out;
}

describe("sseEvents", () => {
  it("yields one frame per data line, in order", async () => {
    expect(await drain(streamOf([utf8('data: {"a":1}\n\ndata: {"a":2}\n\n')]))).toEqual([
      { data: '{"a":1}' },
      { data: '{"a":2}' },
    ]);
  });

  it("reassembles a frame split across chunk boundaries", async () => {
    // The split lands inside the JSON payload AND inside the "\n\n" terminator,
    // which is the pair of cases the hand-rolled copies had to get right.
    const frames = await drain(
      streamOf([utf8('data: {"te'), utf8('xt":"hi"}\n'), utf8('\ndata: {"x":1}\n\n')]),
    );
    expect(frames).toEqual([{ data: '{"text":"hi"}' }, { data: '{"x":1}' }]);
  });

  it("survives a multi-byte character split across chunks", async () => {
    const payload = utf8('data: {"text":"héllo — ✅"}\n\n');
    // Cut inside the em dash's three bytes.
    const cut = payload.indexOf(0xe2);
    expect(cut).toBeGreaterThan(0);
    const frames = await drain(
      streamOf([payload.slice(0, cut + 1), payload.slice(cut + 1)]),
    );
    expect(frames).toEqual([{ data: '{"text":"héllo — ✅"}' }]);
  });

  it("attaches an event name to every data line in its block", async () => {
    expect(await drain(streamOf([utf8("event: tick\ndata: 1\ndata: 2\n\ndata: 3\n\n")]))).toEqual([
      { event: "tick", data: "1" },
      { event: "tick", data: "2" },
      { data: "3" },
    ]);
  });

  it("ignores comment lines and an unterminated trailing frame", async () => {
    expect(await drain(streamOf([utf8(": keep-alive\ndata: 1\n\ndata: cut-off")]))).toEqual([
      { data: "1" },
    ]);
  });

  it("does not parse the payload, so a malformed one is the caller's to skip", async () => {
    const frames = await drain(streamOf([utf8("data: not-json\n\n")]));
    expect(frames).toEqual([{ data: "not-json" }]);
    expect(() => JSON.parse(frames[0].data)).toThrow();
  });
});
