import { describe, it, expect } from "vitest";
import { ilikeAnyOf, stripPostgrestMetacharacters } from "./postgrest-filter";

describe("stripPostgrestMetacharacters", () => {
  it("leaves an ordinary term untouched", () => {
    expect(stripPostgrestMetacharacters("dave")).toBe("dave");
    expect(stripPostgrestMetacharacters("o'brien-smith")).toBe("o'brien-smith");
    expect(stripPostgrestMetacharacters("a@b.com")).toBe("a@b.com");
  });

  it("removes every character PostgREST reads as filter syntax", () => {
    for (const ch of [",", "%", "(", ")", "*", "\\"]) {
      expect(stripPostgrestMetacharacters(`a${ch}b`)).toBe("ab");
    }
  });

  it("defuses a term that would otherwise inject a second or() condition", () => {
    // `or(full_name.ilike.%x%,email.ilike.%x%)` is built by interpolation, so
    // an unstripped comma-and-paren term would add conditions of its own.
    const evil = "x%,id.gt.0,email.ilike.*(";
    expect(stripPostgrestMetacharacters(evil)).toBe("xid.gt.0email.ilike.");
    expect(stripPostgrestMetacharacters(evil)).not.toMatch(/[,%()*\\]/);
  });

  it("can strip a term down to nothing, which the caller's length check catches", () => {
    expect(stripPostgrestMetacharacters("%%%")).toBe("");
  });

  it("does not trim: the caller trims first", () => {
    expect(stripPostgrestMetacharacters("  a  ")).toBe("  a  ");
  });
});

describe("ilikeAnyOf", () => {
  it("matches the term anywhere in any of the columns, as one or() argument", () => {
    expect(ilikeAnyOf(["full_name", "email"], "dave")).toBe("full_name.ilike.*dave*,email.ilike.*dave*");
  });

  it("strips filter syntax from the term itself, so a caller cannot forget to", () => {
    expect(ilikeAnyOf(["name"], "a,id.gt.0)")).toBe("name.ilike.*aid.gt.0*");
  });
});
