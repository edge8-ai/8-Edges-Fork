import { describe, expect, it } from "vitest";
import { actionDetail, buildSessionCard, dueDateOrNull, tldrOf } from "./zoom-ingest";

// The pure parts of the ingest: the card the coaching group sees and the two
// text shapers behind it. The Zoom and database calls are exercised live.

const SUMMARY = `## TL;DR
Three engineers shipped their seams. Minh is blocked on the tracker token.

## Decisions
- Ship the seam first.

## Blockers
- Minh: tracker token.
`;

describe("tldrOf", () => {
  it("returns the TL;DR section alone", () => {
    expect(tldrOf(SUMMARY)).toBe("Three engineers shipped their seams. Minh is blocked on the tracker token.");
  });

  it("falls back to the opening text when there is no TL;DR section", () => {
    expect(tldrOf("## Decisions\n- Ship it.")).toBe("## Decisions\n- Ship it.");
  });
});

describe("actionDetail", () => {
  it("keeps the owner as text and drops Unassigned", () => {
    expect(actionDetail("Open the PR", "Minh")).toBe("Open the PR. Owner: Minh");
    expect(actionDetail("", "Unassigned")).toBeNull();
    expect(actionDetail("", "Minh")).toBe("Owner: Minh");
  });
});

describe("dueDateOrNull", () => {
  it("passes a real date and turns anything else into null", () => {
    expect(dueDateOrNull("2026-09-30")).toBe("2026-09-30");
    expect(dueDateOrNull("")).toBeNull();
    expect(dueDateOrNull(undefined)).toBeNull();
    expect(dueDateOrNull("next Friday")).toBeNull();
  });
});

describe("buildSessionCard", () => {
  it("carries the date, participants, TL;DR, count and link", () => {
    const card = buildSessionCard({
      title: "Seams shipped",
      dateLabel: "2026-09-17",
      speakers: ["Alex Coach", "Minh Tran"],
      summaryMarkdown: SUMMARY,
      actionItemCount: 2,
      url: "https://example.test/team/coaching-sessions/abc",
    });
    const text = JSON.stringify(card);
    expect((card.header as { title: { content: string } }).title.content).toBe("Coaching session: Seams shipped");
    expect(text).toContain("**Date:** 2026-09-17");
    expect(text).toContain("Alex Coach, Minh Tran");
    expect(text).toContain("Three engineers shipped their seams.");
    expect(text).toContain("2 action items");
    expect(text).toContain("(https://example.test/team/coaching-sessions/abc)");
  });

  it("says the summary is pending when there is none, and omits the link without an origin", () => {
    const text = JSON.stringify(
      buildSessionCard({ title: "Session", dateLabel: null, speakers: [], summaryMarkdown: null, actionItemCount: 0, url: null }),
    );
    expect(text).toContain("The transcript is stored.");
    expect(text).toContain("not detected");
    expect(text).not.toContain("action item");
    expect(text).not.toContain("Read the full summary");
  });
});
