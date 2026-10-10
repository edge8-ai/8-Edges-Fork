import { describe, expect, it } from "vitest";
import { keyResultDelta, signedDelta, type KeyResultAuditRow } from "./key-result-move";

const row = (changedAt: string, oldValue: number | null, newValue: number | null): KeyResultAuditRow => ({
  changed_at: changedAt,
  old_data: oldValue === null ? null : { current_value: oldValue },
  new_data: newValue === null ? null : { current_value: newValue },
});

describe("keyResultDelta", () => {
  it("takes the value the key result was left at on or before the meeting", () => {
    const rows = [
      row("2026-08-01T09:00:00Z", 80, 100),
      row("2026-09-10T09:00:00Z", 100, 120),
      row("2026-09-16T09:00:00Z", 120, 220),
    ];
    expect(keyResultDelta(rows, 220, "2026-09-10")).toEqual({ previous: 120, delta: 100 });
  });

  it("falls back to what the first row after the meeting replaced", () => {
    const rows = [row("2026-09-16T09:00:00Z", 120, 220)];
    expect(keyResultDelta(rows, 220, "2026-09-10")).toEqual({ previous: 120, delta: 100 });
  });

  it("claims nothing when the trail holds no value for that window", () => {
    // The documented fallback: with no usable audit row the rung shows the
    // number alone, so the rule answers null rather than guessing a baseline.
    expect(keyResultDelta([], 220, "2026-09-10")).toBeNull();
    expect(keyResultDelta([row("2026-09-16T09:00:00Z", null, null)], 220, "2026-09-10")).toBeNull();
    expect(keyResultDelta([row("2026-09-16T09:00:00Z", 120, 220)], 220, null)).toBeNull();
    expect(keyResultDelta([row("2026-09-16T09:00:00Z", 120, 220)], null, "2026-09-10")).toBeNull();
  });

  it("reports a standstill as zero, not as nothing", () => {
    // Zero is a real answer — the key result was seen and has not moved — and
    // the caller uses it to decide there is no movement line to draw.
    expect(keyResultDelta([row("2026-09-09T09:00:00Z", 100, 220)], 220, "2026-09-10")).toEqual({
      previous: 220,
      delta: 0,
    });
  });

  it("reads a fall the same way it reads a rise", () => {
    expect(keyResultDelta([row("2026-09-09T09:00:00Z", 260, 240)], 220, "2026-09-10")).toEqual({
      previous: 240,
      delta: -20,
    });
  });

  it("signs the movement both ways", () => {
    expect(signedDelta(100)).toBe("+100");
    expect(signedDelta(-20)).toBe("−20");
  });
});
