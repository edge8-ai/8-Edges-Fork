import { describe, expect, it, vi } from "vitest";
import { IN_CHUNK, readInChunks } from "./in-chunks";

// W.138: 680 card ids in one `.in(...)` was a 25 KB URL the gateway refused,
// and every card on the all-boards workboard lost its comments.
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("readInChunks", () => {
  it("never sends more than IN_CHUNK ids in one request, and asks for every id once", async () => {
    const read = vi.fn(async (slice: string[]) => ({ data: slice.map((id) => ({ id })), error: null }));
    const res = await readInChunks(ids(680), read);
    expect(read).toHaveBeenCalledTimes(Math.ceil(680 / IN_CHUNK));
    for (const [slice] of read.mock.calls) expect(slice.length).toBeLessThanOrEqual(IN_CHUNK);
    expect(read.mock.calls.flatMap(([slice]) => slice)).toEqual(ids(680));
    expect(res).toEqual({ data: ids(680).map((id) => ({ id })), error: null });
  });

  it("keeps each piece's own order when it joins them", async () => {
    // Two comments on one card, oldest first, must still read oldest first.
    const res = await readInChunks(ids(IN_CHUNK + 1), async (slice) => ({
      data: slice.flatMap((id) => [{ id, n: 1 }, { id, n: 2 }]),
      error: null,
    }));
    expect(res.data?.slice(0, 2)).toEqual([{ id: "id-0", n: 1 }, { id: "id-0", n: 2 }]);
    expect(res.data?.slice(-2)).toEqual([{ id: `id-${IN_CHUNK}`, n: 1 }, { id: `id-${IN_CHUNK}`, n: 2 }]);
  });

  it("fails the whole read when one piece fails, rather than passing off part of it as all", async () => {
    const res = await readInChunks(ids(IN_CHUNK * 2), async (slice) =>
      slice[0] === "id-0" ? { data: [{ id: "id-0" }], error: null } : { data: null, error: { message: "Bad Request" } },
    );
    expect(res).toEqual({ data: null, error: { message: "Bad Request" } });
  });

  it("sends nothing for no ids", async () => {
    const read = vi.fn();
    expect(await readInChunks([], read)).toEqual({ data: [], error: null });
    expect(read).not.toHaveBeenCalled();
  });
});
