import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes plain titles", () => {
    expect(slugify("AI Workshop — Saigon")).toBe("ai-workshop-saigon");
  });
  it("folds Vietnamese accents and tone marks", () => {
    expect(slugify("Nguyễn Thị Mai")).toBe("nguyen-thi-mai");
    expect(slugify("Hồ Chí Minh")).toBe("ho-chi-minh");
  });
  it("replaces đ/Đ, which NFD does not decompose", () => {
    expect(slugify("Đà Nẵng đẹp")).toBe("da-nang-dep");
  });
  it("collapses punctuation runs and trims edge dashes", () => {
    expect(slugify("  --Hello,   World!!  ")).toBe("hello-world");
  });
  it("returns an empty string for empty or symbol-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!! ***")).toBe("");
  });
  it("caps at 80 by default without leaving a trailing dash", () => {
    const long = Array.from({ length: 30 }, () => "abc").join(" ");
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith("-")).toBe(false);
  });
  it("honours a caller-supplied cap", () => {
    expect(slugify("one two three", 7)).toBe("one-two");
  });
});
