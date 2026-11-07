import { describe, expect, it } from "vitest";
import { ACTION_UPLOAD_MAX_BYTES, needsRedraw, scaledSize } from "./shrink-image";

// M1.2: a phone photo must reach a server action under Vercel's body limit.
describe("scaledSize", () => {
  it("caps the long edge and keeps the shape", () => {
    expect(scaledSize(8064, 6048, 2400)).toEqual({ width: 2400, height: 1800 });
    expect(scaledSize(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it("never enlarges a small photo", () => {
    expect(scaledSize(800, 600, 2400)).toEqual({ width: 800, height: 600 });
  });
});

describe("needsRedraw", () => {
  const small = { type: "image/jpeg", size: 300 * 1024 };
  it("keeps a small JPEG as it is", () => {
    expect(needsRedraw(small, 1200, 900, 2400)).toBe(false);
  });
  it("redraws a 12 MP phone photo, a heavy file and a HEIC", () => {
    expect(needsRedraw(small, 4032, 3024, 2400)).toBe(true);
    expect(needsRedraw({ type: "image/png", size: ACTION_UPLOAD_MAX_BYTES + 1 }, 1200, 900, 2400)).toBe(true);
    expect(needsRedraw({ type: "image/heic", size: 300 * 1024 }, 1200, 900, 2400)).toBe(true);
  });
});
