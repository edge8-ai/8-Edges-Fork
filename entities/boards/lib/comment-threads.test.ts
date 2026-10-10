import { describe, expect, it } from "vitest";
import { mentionRecipients, replyParentProblem, resolveProblem } from "./comment-threads";
import { groupComments } from "./card-comments";

describe("replyParentProblem (W.143)", () => {
  it("lets a top-level comment on the same card be replied to", () => {
    expect(replyParentProblem({ task_id: "t1", parent_comment_id: null }, "t1")).toBeNull();
  });

  it("refuses a reply to a reply: one level only", () => {
    expect(replyParentProblem({ task_id: "t1", parent_comment_id: "c1" }, "t1")).toMatch(/cannot be replied to/);
  });

  it("refuses a parent on another card, and one that is not there, with the same words", () => {
    const other = replyParentProblem({ task_id: "t2", parent_comment_id: null }, "t1");
    expect(other).toBe("That comment is not on this card.");
    expect(replyParentProblem(null, "t1")).toBe(other);
  });
});

describe("resolveProblem", () => {
  it("lets a thread on the card be resolved", () => {
    expect(resolveProblem({ task_id: "t1", parent_comment_id: null }, "t1")).toBeNull();
  });

  it("refuses to resolve a reply on its own", () => {
    expect(resolveProblem({ task_id: "t1", parent_comment_id: "c1" }, "t1")).toMatch(/resolved with its thread/);
  });

  it("refuses a comment from another card", () => {
    expect(resolveProblem({ task_id: "t2", parent_comment_id: null }, "t1")).toBe("That comment is not on this card.");
  });
});

describe("mentionRecipients", () => {
  it("tells each tagged person once and never the author", () => {
    expect(mentionRecipients(["p2", "p1", "p2", "p3"], "p1")).toEqual(["p2", "p3"]);
  });

  it("tells everyone tagged when the author has no people row", () => {
    expect(mentionRecipients(["p2"], null)).toEqual(["p2"]);
  });
});

describe("groupComments", () => {
  const row = { id: "c1", task_id: "t1", author_label: "Ada Rivers", body: "@Ben Okafor ok?", created_at: "2026-09-01T00:00:00Z" };

  it("carries the thread fields and names each mention from the people in scope", () => {
    const byTask = groupComments(
      [{ ...row, parent_comment_id: null, resolved_at: "2026-09-02T00:00:00Z", resolved_by_label: "Ben Okafor", mentions: ["p2"] }],
      new Map([["p2", "Ben Okafor"]]),
    );
    expect(byTask.get("t1")).toEqual([
      {
        id: "c1",
        author: "Ada Rivers",
        body: "@Ben Okafor ok?",
        createdAt: "2026-09-01T00:00:00Z",
        parentId: null,
        resolvedAt: "2026-09-02T00:00:00Z",
        resolvedBy: "Ben Okafor",
        mentions: [{ id: "p2", name: "Ben Okafor" }],
      },
    ]);
  });

  it("leaves out a mention nobody in scope is named for, rather than inventing a name", () => {
    const byTask = groupComments([{ ...row, mentions: ["p2", "p9"] }], new Map([["p2", "Ben Okafor"], ["p9", null]]));
    expect(byTask.get("t1")?.[0].mentions).toEqual([{ id: "p2", name: "Ben Okafor" }]);
  });

  it("reads a row from before the migration as a plain top-level comment", () => {
    const byTask = groupComments([row], new Map());
    expect(byTask.get("t1")?.[0]).toMatchObject({ parentId: null, resolvedAt: null, resolvedBy: null, mentions: [] });
  });
});
