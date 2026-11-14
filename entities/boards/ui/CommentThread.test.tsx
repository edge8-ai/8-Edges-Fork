import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommentThread } from "./CommentThread";
import type { CommentItem } from "./card-activity";

// W.143: what a thread shows on each surface. Rendered to markup, so these pin
// the contract (who sees Reply and Resolve, what a resolved thread says, what
// is highlighted) rather than the keyboard, which needs a browser.

const thread = (over: Partial<CommentItem> = {}): CommentItem => ({
  kind: "comment",
  id: "comment-c1",
  commentId: "c1",
  at: "2026-09-24T10:00:00Z",
  author: "Ada Rivers",
  body: "@Ben Okafor can you check the spec?",
  mentions: [{ id: "p2", name: "Ben Okafor" }],
  resolved: null,
  replies: [{ id: "comment-r1", commentId: "r1", at: "2026-09-24T11:00:00Z", author: "Ben Okafor", body: "Done.", mentions: [] }],
  ...over,
});

const noop = () => undefined;
const render = (item: CommentItem, opts: { readOnly?: boolean; saving?: boolean; replying?: boolean } = {}) =>
  renderToStaticMarkup(
    <CommentThread
      item={item}
      people={[]}
      saving={opts.saving ?? false}
      readOnly={opts.readOnly ?? false}
      replying={opts.replying ?? false}
      onReplyOpen={noop}
      onReplyClose={noop}
      onReply={noop}
      onResolve={noop}
    />,
  );

describe("CommentThread (W.143)", () => {
  it("shows the replies indented under the comment, with Reply and Resolve on the thread only", () => {
    const html = render(thread());
    expect(html).toContain('class="wb-activity-replies"');
    expect(html).toContain("Done.");
    expect(html.match(/>Reply</g)).toHaveLength(1);
    expect(html).toContain(">Resolve<");
  });

  it("highlights the person a comment tagged", () => {
    expect(render(thread())).toContain('<mark class="wb-mention">@Ben Okafor</mark>');
  });

  it("keeps a resolved thread in place, greyed, saying who resolved it, with Reopen", () => {
    const html = render(thread({ resolved: { at: "2026-09-24T12:00:00Z", by: "Ben Okafor" } }));
    expect(html).toContain("wb-activity-item--resolved");
    expect(html).toContain("Resolved by Ben Okafor");
    expect(html).toContain("@Ben Okafor can you check the spec?".slice(12));
    expect(html).toContain(">Reopen<");
  });

  it("shows threads and resolved lines on a read-only surface, but no Reply, Resolve or composer", () => {
    const html = render(thread({ resolved: { at: "2026-09-24T12:00:00Z", by: "Ben Okafor" } }), { readOnly: true, replying: true });
    expect(html).toContain("Resolved by Ben Okafor");
    expect(html).toContain("Done.");
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/<textarea/);
  });

  it("disables every control while a save is in flight", () => {
    const html = render(thread(), { saving: true, replying: true });
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain("disabled");
  });

  it("opens the reply box under the thread, with the picker hint", () => {
    const html = render(thread(), { replying: true });
    expect(html).toContain('aria-label="Reply"');
    expect(html).toContain("@ to mention");
  });
});
