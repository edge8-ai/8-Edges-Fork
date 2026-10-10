import { describe, expect, it } from "vitest";
import { escapeLikeLiteral } from "./postgrest-filter";

// `activePortalAuthUser` in portal-invite.ts decides whether a "send me a
// sign-in link" request resolves to a real portal member, and it looks the
// address up with `.ilike`. ILIKE treats % and _ as wildcards, so without this
// escape a crafted address matches other people's rows and the link goes to
// the wrong inbox.

describe("escapeLikeLiteral", () => {
  it("leaves an ordinary address untouched", () => {
    expect(escapeLikeLiteral("person@example.com")).toBe("person@example.com");
    expect(escapeLikeLiteral("first.last+tag@example.co.uk")).toBe("first.last+tag@example.co.uk");
  });

  it("escapes % so a domain wildcard cannot match everyone at that domain", () => {
    expect(escapeLikeLiteral("%@example.com")).toBe("\\%@example.com");
    expect(escapeLikeLiteral("a%b@example.com")).toBe("a\\%b@example.com");
  });

  it("escapes _ so a single-character wildcard cannot match a neighbour", () => {
    expect(escapeLikeLiteral("_x@example.com")).toBe("\\_x@example.com");
    expect(escapeLikeLiteral("a_b@example.com")).toBe("a\\_b@example.com");
  });

  it("escapes the backslash itself, so an escape cannot be smuggled in", () => {
    // Without this, the input `\%@example.com` would arrive at Postgres as a
    // literal backslash followed by a live wildcard.
    expect(escapeLikeLiteral("\\%@example.com")).toBe("\\\\\\%@example.com");
    expect(escapeLikeLiteral("\\")).toBe("\\\\");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeLikeLiteral("%%__")).toBe("\\%\\%\\_\\_");
  });

  it("leaves an escaped value with no live wildcard characters", () => {
    for (const raw of ["%@example.com", "_x@example.com", "%_\\@example.com"]) {
      // Strip the escaped pairs; nothing wildcard-ish may remain.
      expect(escapeLikeLiteral(raw).replace(/\\[%_\\]/g, "")).not.toMatch(/[%_\\]/);
    }
  });

  it("does nothing to an empty string", () => {
    expect(escapeLikeLiteral("")).toBe("");
  });
});
