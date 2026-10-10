import { describe, expect, it } from "vitest";
import { formatValue, niceCeil } from "./ticks";

// formatValue("usd") must stay byte-equal to compactUsd(n * 100) in
// entities/company-os/lib/dashboard-helpers.ts, which the pages use for their
// tiles: the kernel may not import an entity, so the compaction is repeated
// here and this test is what stops the two drifting.
describe("formatValue", () => {
  it("compacts dollars the way the tiles do", () => {
    expect(formatValue("usd", 0)).toBe("$0");
    expect(formatValue("usd", 999)).toBe("$999");
    expect(formatValue("usd", 1000)).toBe("$1.0k");
    expect(formatValue("usd", 84_203)).toBe("$84.2k");
    expect(formatValue("usd", 100_000)).toBe("$100k");
    expect(formatValue("usd", 1_648_532)).toBe("$1.65M");
  });
  it("formats counts with thousands separators", () => {
    expect(formatValue("count", 1234)).toBe("1,234");
  });
});

describe("niceCeil", () => {
  it("gives small counts an axis top divisible by four", () => {
    expect([1, 4, 5, 8, 9, 20].map(niceCeil)).toEqual([4, 4, 8, 8, 12, 20]);
  });
  it("rounds larger values to 1, 2, 2.5, 5 or 10 times a power of ten", () => {
    expect([21, 130, 2600, 51_895].map(niceCeil)).toEqual([25, 200, 5000, 100_000]);
  });
});
