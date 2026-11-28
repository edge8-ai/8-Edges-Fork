import { describe, expect, it } from "vitest";
import { validatePreferredSlot } from "./preferred-slot";

describe("validatePreferredSlot", () => {
  it("accepts a 24-hour time, or nothing at all", () => {
    expect(validatePreferredSlot({ time: "15:00" })).toEqual({ ok: true });
    expect(validatePreferredSlot({ time: null })).toEqual({ ok: true });
  });
  it("refuses malformed times", () => {
    expect(validatePreferredSlot({ time: "3pm" }).ok).toBe(false);
    expect(validatePreferredSlot({ time: "24:00" }).ok).toBe(false);
  });
});
