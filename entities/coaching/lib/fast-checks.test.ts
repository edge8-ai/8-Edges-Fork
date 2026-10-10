import { describe, expect, it } from "vitest";

// The FAST checks as product rules, not as a rendered component. The goal form
// only lights a letter when fastChecks() says so, so these cases are the
// specification of when a goal has earned each letter (K.13, spec §2.6).

import {
  darkCount,
  darkNotice,
  fastChecks,
  quarterLabelFor,
  sentenceOf,
  type FastCheckInput,
} from "./fast-checks";
import { QUARTER_PATTERN } from "./quarter-review";

const base: FastCheckInput = {
  sentence: "",
  stretchMarkdown: null,
  metricUnit: null,
  targetValue: null,
  dueDate: null,
  ladder: { kind: "none" },
};

const lit = (input: Partial<FastCheckInput>) =>
  fastChecks({ ...base, ...input })
    .filter((c) => c.lit)
    .map((c) => c.key);

describe("fastChecks", () => {
  it("F is always on, because the prep guarantees it", () => {
    expect(lit({})).toEqual(["F"]);
    expect(fastChecks(base)[0].note).toContain("first bullet of every 1-1 prep");
  });

  it("A lights when doubling the goal is written down", () => {
    expect(lit({ stretchMarkdown: "Twice this would be 40 clients" })).toContain("A");
    // Whitespace is not an answer.
    expect(lit({ stretchMarkdown: "   " })).not.toContain("A");
  });

  it("S needs a unit, a target, and a date somewhere", () => {
    expect(lit({ metricUnit: "days", targetValue: 20 })).not.toContain("S");
    expect(lit({ metricUnit: "days", targetValue: 20, dueDate: "2026-09-30" })).toContain("S");
    // A deadline written into the sentence counts even with the field blank.
    expect(lit({ metricUnit: "days", targetValue: 20, sentence: "Cut days to hire by 30 September" })).toContain("S");
    // A trailing bare "by" is not a deadline.
    expect(lit({ metricUnit: "days", targetValue: 20, sentence: "Cut days to hire by" })).not.toContain("S");
    // A target of zero is a target.
    expect(lit({ metricUnit: "bugs", targetValue: 0, dueDate: "2026-09-30" })).toContain("S");
  });

  it("T lights when the goal ladders to a company key result", () => {
    expect(lit({ ladder: { kind: "key_result", id: "kr-1" } })).toContain("T");
    expect(lit({ ladder: { kind: "objective", id: "o-1" } })).toContain("T");
    expect(lit({ ladder: { kind: "none" } })).not.toContain("T");
  });

  it("counts the dark letters and says so, because saving is still allowed", () => {
    expect(darkCount(fastChecks(base))).toBe(3);
    expect(darkNotice(fastChecks(base))).toBe("3 checks still dark; talk about it at your next 1-1.");
    expect(darkNotice(fastChecks({ ...base, stretchMarkdown: "x", ladder: { kind: "key_result", id: "k" } })))
      .toBe("1 check still dark; talk about it at your next 1-1.");
    const all = fastChecks({
      sentence: "Cut days to hire to under 20 by 30 September",
      stretchMarkdown: "Ten days",
      metricUnit: "days",
      targetValue: 20,
      dueDate: "2026-09-30",
      ladder: { kind: "key_result", id: "kr-1" },
    });
    expect(darkNotice(all)).toBeNull();
  });
});

describe("the sentence and the cycle label", () => {
  it("joins the filled boxes and drops the blank ones", () => {
    expect(sentenceOf({ verb: "Cut", what: "days to hire", amount: "", byWhen: "by 30 Sep" }))
      .toBe("Cut days to hire by 30 Sep");
    expect(sentenceOf({ verb: " ", what: "", amount: "", byWhen: "" })).toBe("");
  });

  it("derives the quarter from the date rather than hardcoding 2026-Q3", () => {
    expect(quarterLabelFor("2026-09-16")).toBe("2026-Q3");
    expect(quarterLabelFor("2026-10-01")).toBe("2026-Q4");
    expect(quarterLabelFor("2027-01-31")).toBe("2027-Q1");
  });

  // The label this function writes is the one the goal form sends and a goal
  // action parses, so the producer and the canonical pattern have to agree.
  // This pins that pair. What it cannot see is the pattern re-typed somewhere
  // else: the coach tier's schema was given /^\d{4}Q[1-4]$/ with no hyphen, and
  // refuses every label produced here. That copy is the defect, and the reason
  // a shape worth parsing belongs in one shared schema rather than one per tier.
  it("writes a label the canonical QUARTER_PATTERN accepts", () => {
    for (const day of ["2026-01-01", "2026-04-30", "2026-07-15", "2026-12-31", "2099-09-18"]) {
      expect(QUARTER_PATTERN.test(quarterLabelFor(day))).toBe(true);
    }
  });
});
