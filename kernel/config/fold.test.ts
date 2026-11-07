import { describe, expect, it } from "vitest";

import { foldDiacritics } from "./fold";

// The search screens (the org tree, the team directory, Sparks), the
// Workboard's search, the slugs and every name match fold through this one
// function, so its output is their contract: a change here is a change on all
// of them.
describe("foldDiacritics", () => {
  it("strips Vietnamese diacritics and folds đ so ascii typing matches", () => {
    expect(foldDiacritics("Đặng Phương Mai")).toBe("dang phuong mai");
    expect(foldDiacritics("Lê Đình Ngọc")).toBe("le dinh ngoc");
    expect(foldDiacritics("Nghiêm Cẩm Việt Hà")).toBe("nghiem cam viet ha");
  });

  it("is a plain lower-case on ascii", () => {
    expect(foldDiacritics("Ho Chi Minh City")).toBe("ho chi minh city");
  });

  it("folds a lone Đ or đ, which NFD does not decompose", () => {
    expect(foldDiacritics("Đ")).toBe("d");
    expect(foldDiacritics("đ")).toBe("d");
  });

  it("keeps spaces, punctuation and length as they are", () => {
    // Callers that want those changed do it after the fold (slugify,
    // the Workboard's search), so the fold itself must not.
    expect(foldDiacritics("  Đỗ,  Trang! ")).toBe("  do,  trang! ");
  });
});
