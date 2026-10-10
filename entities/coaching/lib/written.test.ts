import { describe, expect, it } from "vitest";
import { buildWrittenRecap, writtenOutcome } from "./written";

describe("writtenOutcome", () => {
  const answers = { moved: "Shipped it", stuck: null, talk: null };
  it("needs a booking, an answer and a reply", () => {
    expect(writtenOutcome({ status: "scheduled", answers, reply: "Good." })).toEqual({ ok: true });
    expect(writtenOutcome({ status: "held", answers, reply: "Good." }).ok).toBe(false);
    expect(writtenOutcome({ status: "skipped", answers, reply: "Good." }).ok).toBe(false);
    expect(writtenOutcome({ status: "scheduled", answers: null, reply: "Good." }).ok).toBe(false);
    expect(writtenOutcome({ status: "scheduled", answers: { moved: " ", stuck: null, talk: null }, reply: "x" }).ok).toBe(false);
    expect(writtenOutcome({ status: "scheduled", answers, reply: "  " }).ok).toBe(false);
  });
});

describe("buildWrittenRecap", () => {
  it("writes the member's words under their headings, then the reply, and skips empty headings", () => {
    const md = buildWrittenRecap({ moved: "Shipped it", stuck: null, talk: "Next quarter" }, "Well done.", "Dana");
    expect(md).toContain("_Held in writing._");
    expect(md).toContain("## What moved\n\nShipped it");
    expect(md).not.toContain("What was stuck");
    expect(md).toContain("## What I wanted to talk about\n\nNext quarter");
    expect(md).toContain("## Dana replied\n\nWell done.");
  });
});
