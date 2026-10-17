import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ReadFailure, mustRows, mustCount, readOr, countOr } from "./read";

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
