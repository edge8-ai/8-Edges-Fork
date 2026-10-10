import { describe, expect, it } from "vitest";
import { compactUsd } from "./dashboard-helpers";
import { formatValue } from "@/kernel/ui/dash/ticks";

// The two compactions agree, and a seven-figure sum reads as millions.
describe("compactUsd and formatValue", () => {
  it("compacts thousands and millions the same way", () => {
    expect(compactUsd(102_700_000)).toBe("$1.03M");
    expect(compactUsd(100_000_000)).toBe("$1M");
    expect(compactUsd(97_900_000)).toBe("$979k");
    expect(compactUsd(4_250)).toBe("$43");
    expect(formatValue("usd", 1_027_000)).toBe("$1.03M");
    expect(formatValue("usd", 979_000)).toBe("$979k");
    expect(formatValue("usd", 1_500)).toBe("$1.5k");
  });
});
