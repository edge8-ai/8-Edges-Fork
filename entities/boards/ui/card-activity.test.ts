import { describe, expect, it } from "vitest";
import { hopLabel, mergeActivity, threadComments } from "./card-activity";
import type { TaskComment } from "@/entities/boards/lib/data";
import type { CardHop } from "@/entities/boards/lib/card-history";

const comment = (id: string, at: string, body = "said something"): TaskComment => ({
  id,
  author: "Ada Rivers",
  body,
  createdAt: at,
});
const hop = (id: string, at: string, from: string | null, to: string | null, note: string | null = null): CardHop => ({
  id,
  from,
  to,
  at,
  kind: "move",
  note,
});

describe("hopLabel", () => {
  it("reads a first row as a beginning, not as a gap", () => {
    expect(hopLabel({ from: null, to: "To do" })).toBe("Started in To do");
  });

  it("names both ends of an ordinary move", () => {
    expect(hopLabel({ from: "To do", to: "Doing" })).toBe("To do → Doing");
  });

  it("says what it can when the card only left somewhere", () => {
    expect(hopLabel({ from: "Doing", to: null })).toBe("Left Doing");
    expect(hopLabel({ from: null, to: null })).toBe("Moved");
  });
});

describe("mergeActivity", () => {
  it("puts comments and moves in one time order, oldest first", () => {
    const items = mergeActivity(
      [comment("c1", "2026-09-02T10:00:00Z"), comment("c2", "2026-09-04T10:00:00Z")],
      [hop("h1", "2026-09-01T10:00:00Z", null, "To do"), hop("h2", "2026-09-03T10:00:00Z", "To do", "Doing")],
    );
    expect(items.map((i) => i.id)).toEqual(["hop-h1", "comment-c1", "hop-h2", "comment-c2"]);
  });

  it("reads the move before the comment that explains it, when they share a second", () => {
    const at = "2026-09-03T10:00:00Z";
    const items = mergeActivity([comment("c1", at)], [hop("h1", at, "Doing", "Review")]);
    expect(items.map((i) => i.kind)).toEqual(["move", "comment"]);
  });

  it("NEVER carries a person on a move — a comment's author is the only name here", () => {
    const items = mergeActivity([comment("c1", "2026-09-02T10:00:00Z")], [hop("h1", "2026-09-01T10:00:00Z", "A", "B")]);
    const move = items.find((i) => i.kind === "move");
    expect(move && Object.keys(move).sort()).toEqual(["at", "id", "kind", "label", "note"]);
    expect(JSON.stringify(move)).not.toContain("Ada Rivers");
  });

  it("keeps a board move's note, which is the only thing that says where it came from", () => {
    const items = mergeActivity([], [hop("h1", "2026-09-01T10:00:00Z", null, "To do", "Moved from Acme")]);
    expect(items[0]).toMatchObject({ kind: "move", note: "Moved from Acme" });
  });

  it("is empty for a card nothing has happened to", () => {
    expect(mergeActivity([], [])).toEqual([]);
  });
});

describe("comment threads (W.143)", () => {
  const reply = (id: string, at: string, parentId: string, body = "answered"): TaskComment => ({
    ...comment(id, at, body),
    parentId,
  });

  it("puts a reply under the comment it answers, not in time order among the moves", () => {
    const items = mergeActivity(
      [comment("c1", "2026-09-02T10:00:00Z"), reply("r1", "2026-09-05T10:00:00Z", "c1")],
      [hop("h1", "2026-09-03T10:00:00Z", "To do", "Doing")],
    );
    expect(items.map((i) => i.id)).toEqual(["comment-c1", "hop-h1"]);
    const thread = items[0];
    expect(thread.kind === "comment" && thread.replies.map((r) => r.commentId)).toEqual(["r1"]);
  });

  it("keeps top-level comments interleaved with moves while their replies stay with them", () => {
    const items = mergeActivity(
      [
        comment("c1", "2026-09-01T10:00:00Z"),
        comment("c2", "2026-09-04T10:00:00Z"),
        reply("r2", "2026-09-05T10:00:00Z", "c2"),
        reply("r1", "2026-09-06T10:00:00Z", "c1"),
      ],
      [hop("h1", "2026-09-02T10:00:00Z", "To do", "Doing")],
    );
    expect(items.map((i) => i.id)).toEqual(["comment-c1", "hop-h1", "comment-c2"]);
    const replies = items.flatMap((i) => (i.kind === "comment" ? i.replies.map((r) => `${i.commentId}:${r.commentId}`) : []));
    expect(replies).toEqual(["c1:r1", "c2:r2"]);
  });

  it("orders a thread's replies oldest first, whatever order they were read in", () => {
    const [thread] = threadComments([
      comment("c1", "2026-09-01T10:00:00Z"),
      reply("late", "2026-09-03T10:00:00Z", "c1"),
      reply("early", "2026-09-02T10:00:00Z", "c1"),
    ]);
    expect(thread.replies.map((r) => r.commentId)).toEqual(["early", "late"]);
  });

  it("reads a resolved thread as resolved, with who resolved it, and keeps it in the stream", () => {
    const items = mergeActivity(
      [{ ...comment("c1", "2026-09-02T10:00:00Z"), resolvedAt: "2026-09-03T10:00:00Z", resolvedBy: "Ben Okafor" }, comment("c2", "2026-09-04T10:00:00Z")],
      [],
    );
    expect(items.map((i) => i.id)).toEqual(["comment-c1", "comment-c2"]);
    expect(items[0]).toMatchObject({ resolved: { at: "2026-09-03T10:00:00Z", by: "Ben Okafor" } });
    expect(items[1]).toMatchObject({ resolved: null });
  });

  it("files a reply to a reply under the thread, one level deep, rather than nesting or dropping it", () => {
    const threads = threadComments([
      comment("c1", "2026-09-01T10:00:00Z"),
      reply("r1", "2026-09-02T10:00:00Z", "c1"),
      reply("rr1", "2026-09-03T10:00:00Z", "r1"),
    ]);
    expect(threads.map((t) => t.commentId)).toEqual(["c1"]);
    expect(threads[0].replies.map((r) => r.commentId)).toEqual(["r1", "rr1"]);
    // A reply carries no replies of its own: there is nowhere to put one.
    expect(Object.keys(threads[0].replies[0])).not.toContain("replies");
  });

  it("shows a reply whose parent was not read as a thread of its own, never hiding it", () => {
    const threads = threadComments([reply("r1", "2026-09-02T10:00:00Z", "gone")]);
    expect(threads.map((t) => t.commentId)).toEqual(["r1"]);
  });

  it("ends on a cycle in bad data instead of spinning, and still shows both comments", () => {
    const threads = threadComments([reply("a", "2026-09-01T10:00:00Z", "b"), reply("b", "2026-09-02T10:00:00Z", "a")]);
    expect(threads.map((t) => t.commentId).sort()).toEqual(["a", "b"]);
  });

  it("carries a comment's mentions for the highlight", () => {
    const [thread] = threadComments([{ ...comment("c1", "2026-09-01T10:00:00Z", "@Ben Okafor look"), mentions: [{ id: "p2", name: "Ben Okafor" }] }]);
    expect(thread.mentions).toEqual([{ id: "p2", name: "Ben Okafor" }]);
  });
});
