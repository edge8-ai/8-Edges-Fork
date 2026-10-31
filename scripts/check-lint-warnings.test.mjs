// The comparison and baseline logic are pure so they can be tested without
// running ESLint; the real-tree check is the `check:lint-warnings` gate.

import { describe, expect, it } from "vitest";
import { compareToBaseline, countWarnings, nextBaseline } from "./check-lint-warnings.mjs";

const results = [
  { messages: [{ severity: 1, ruleId: "a" }, { severity: 1, ruleId: "a" }, { severity: 2, ruleId: "x" }] },
  { messages: [{ severity: 1, ruleId: "b" }] },
];

describe("countWarnings", () => {
  it("counts severity-1 messages per rule and ignores errors", () => {
    expect(countWarnings(results)).toEqual({ a: 2, b: 1 });
  });
});

describe("compareToBaseline", () => {
  it("passes at or below baseline and reports zero-count rules as promotable", () => {
    const r = compareToBaseline({ a: 2 }, { a: 2, b: 1 });
    expect(r.errors).toEqual([]);
    expect(r.promotable).toEqual(["b"]);
  });
  it("fails when a count rises", () => {
    expect(compareToBaseline({ a: 3 }, { a: 2 }).errors[0]).toMatch(/a: 3 warnings, baseline 2/);
  });
  it("fails on a rule with no baseline", () => {
    expect(compareToBaseline({ c: 1 }, {}).errors[0]).toMatch(/no baseline/);
  });
});

describe("nextBaseline", () => {
  it("lowers counts and drops rules that reached zero", () => {
    expect(nextBaseline({ a: 1 }, { a: 2, b: 1 }).next).toEqual({ a: 1 });
  });
  it("refuses to raise a number or add a rule", () => {
    const { errors } = nextBaseline({ a: 3, c: 1 }, { a: 2 });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/refusing to raise/);
    expect(errors[1]).toMatch(/refusing to add/);
  });
});
