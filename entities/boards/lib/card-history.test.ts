import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// W.34's house rule, held where it is actually enforceable.
//
// task_stage_log carries `moved_by`. The strip renders WHAT moved and WHEN,
// never WHO moved it — the same line flow-metrics.ts already holds. The only
// durable way to keep that true is that the column is never selected and the
// row type has no field for it, so a later caller cannot render what was
// never fetched. These tests fail the moment either changes.
// Comments are stripped before every assertion below. The prose in this
// module talks ABOUT moved_by at length — that is the point of it — and a
// check that could not tell the two apart would forbid explaining the rule.
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("a card's own history", () => {
  const source = read("./card-history.ts");

  it("never selects moved_by", () => {
    expect(source).not.toContain("moved_by");
  });

  it("reads one card, and has no list variant to aggregate with", () => {
    expect(source).toContain('.eq("task_id", taskId)');
    expect(source).not.toContain(".in(\"task_id\"");
  });

  it("guards before it reads", () => {
    // The guard is the first statement, so someone who cannot reach the board
    // cannot learn its history either (CLAUDE.md rule 1).
    const body = source.slice(source.indexOf("export async function getCardHistory"));
    expect(body.indexOf("await boardMutation")).toBeLessThan(body.indexOf("task_stage_log"));
  });

  it("does not collapse a failed read into an empty history", () => {
    // "This card has never moved" and "we could not find out" are different
    // statements, so the read is a must* one and the failure is returned.
    expect(source).toContain("mustRows");
    expect(source).not.toContain("readOr");
  });
});

describe("the CardHop row type", () => {
  const source = read("./card-history.ts");
  const hop = source.slice(source.indexOf("export type CardHop"), source.indexOf("export async function"));

  it("has no field a person could be rendered from", () => {
    // The enforcement point. The strip can only show what the row carries,
    // and the row carries the move: from, to, when, kind, note.
    for (const forbidden of ["movedBy", "by:", "person", "assignee", "actor"]) {
      expect(hop).not.toContain(forbidden);
    }
  });
});
