import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ReadFailure, PAGE_ROWS, IN_CHUNK, mustPages, mustPagesIn, mustRows, mustCount, readOr, countOr } from "./read";

const ok = <T,>(data: T) => ({ data, error: null });
const bad = (message: string) => ({ data: null, error: { message } });
const badCount = (message: string) => ({ count: null, error: { message } });

describe("the must* reads: a failure is raised, never defaulted", () => {
  it("returns the data when the read succeeded", () => {
    expect(mustRows(ok([{ id: "a" }]), "[x] t")).toEqual([{ id: "a" }]);
    expect(mustCount({ count: 3, error: null }, "[x] t")).toBe(3);
  });

  it("distinguishes an empty result from a failure", () => {
    // The whole point: both of these used to produce the same value.
    expect(mustRows(ok([]), "[x] t")).toEqual([]);
    expect(() => mustRows(bad("timeout"), "[x] t")).toThrow(ReadFailure);
  });

  it("carries what failed and why", () => {
    try {
      mustCount(badCount("connection reset"), "[team/hiring] job_requisitions");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReadFailure);
      const f = e as ReadFailure;
      expect(f.what).toBe("[team/hiring] job_requisitions");
      expect(f.reason).toBe("connection reset");
      expect(f.message).toContain("connection reset");
    }
  });

  it("treats a missing count with no error as a genuine zero", () => {
    // head:true counts come back with data null; no error means no rows.
    expect(mustCount({ count: null, error: null }, "[x] t")).toBe(0);
  });

});

describe("the *Or reads: the caller names the fallback", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("returns the fallback and logs when the read failed", () => {
    expect(readOr(bad("timeout"), "[x] t", null)).toBeNull();
    expect(readOr(bad("timeout"), "[x] t", [] as string[])).toEqual([]);
    expect(countOr(badCount("timeout"), "[x] t", 0)).toBe(0);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("does not log when the read merely found nothing", () => {
    expect(readOr({ data: null, error: null }, "[x] t", "none")).toBe("none");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("lets the fallback be a different shape from the row", () => {
    // The signature that stops `null` collapsing the row type to `never`.
    const v: { id: string } | null = readOr(ok({ id: "a" }), "[x] t", null);
    expect(v).toEqual({ id: "a" });
  });
});

describe("mustPages: every page of a read, raised like mustRows", () => {
  it("asks page after page until a short page, in order", async () => {
    const all = Array.from({ length: PAGE_ROWS * 2 + 5 }, (_, i) => ({ i }));
    const asked: [number, number][] = [];
    const rows = await mustPages<{ i: number }>("[x] t", async (from, to) => {
      asked.push([from, to]);
      return ok(all.slice(from, to + 1));
    });
    expect(rows).toEqual(all);
    expect(asked).toEqual([
      [0, PAGE_ROWS - 1],
      [PAGE_ROWS, PAGE_ROWS * 2 - 1],
      [PAGE_ROWS * 2, PAGE_ROWS * 3 - 1],
    ]);
  });

  it("raises a failed page instead of returning the pages before it", async () => {
    let n = 0;
    const full = Array.from({ length: PAGE_ROWS }, () => ({}));
    await expect(mustPages("[x] t", async () => (n++ === 0 ? ok(full) : bad("timeout")))).rejects.toBeInstanceOf(ReadFailure);
  });
});

describe("mustPagesIn: every page for every chunk of ids", () => {
  it("slices the ids by IN_CHUNK, pages each slice, and keeps the order", async () => {
    const ids = Array.from({ length: IN_CHUNK * 2 + 3 }, (_, i) => `id-${i}`);
    const asked: string[][] = [];
    const rows = await mustPagesIn<{ id: string }>(ids, "[x] t", async (slice, from, to) => {
      if (from === 0) asked.push(slice);
      return ok(slice.slice(from, to + 1).map((id) => ({ id })));
    });
    expect(asked.map((s) => s.length)).toEqual([IN_CHUNK, IN_CHUNK, 3]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it("asks nothing for no ids", async () => {
    const read = vi.fn(async () => ok([]));
    expect(await mustPagesIn([], "[x] t", read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("raises a failed chunk instead of returning the chunks before it", async () => {
    const ids = Array.from({ length: IN_CHUNK + 1 }, (_, i) => `id-${i}`);
    await expect(mustPagesIn(ids, "[x] t", async (slice) => (slice.length === IN_CHUNK ? ok([]) : bad("timeout")))).rejects.toBeInstanceOf(ReadFailure);
  });
});
