import { describe, expect, it } from "vitest";
import { matchPost, type ContentCandidate } from "./match";

const candidates: ContentCandidate[] = [
  { id: "goal-tree", channel: "linkedin", publishDate: "2026-10-09", text: "Humans get alignment through conversation. AI gets alignment through context. The goal tree, four layers." },
  { id: "level-3", channel: "linkedin", publishDate: "2026-10-12", text: "Level 3 of AI is a commitment, not a tool. One database, designed workflows, a leader's attention." },
  { id: "level-3-fb", channel: "facebook", publishDate: "2026-10-12", text: "Level 3 of AI is a commitment, not a tool. One database, designed workflows, a leader's attention." },
];

describe("matchPost", () => {
  it("matches the post with the same channel, a day either side and most shared wording", () => {
    const post = { kind: "post" as const, postedOn: "2026-10-12", text: "Level 3 of AI is a commitment, NOT a tool. Read the full post: https://lnkd.in/x" };
    expect(matchPost("linkedin", post, candidates)).toBe("level-3");
    expect(matchPost("facebook", post, candidates)).toBe("level-3-fb");
  });

  it("allows a week of drift between the day a post went out and its calendar date", () => {
    const post = { kind: "post" as const, postedOn: "2026-10-16", text: "Humans get alignment through conversation. AI gets alignment through context." };
    expect(matchPost("linkedin", post, candidates)).toBe("goal-tree");
  });

  it("leaves a post unmatched when the date is further out or the wording differs", () => {
    expect(matchPost("linkedin", { kind: "post", postedOn: "2026-10-20", text: "Level 3 of AI is a commitment, not a tool." }, candidates)).toBeNull();
    expect(matchPost("linkedin", { kind: "post", postedOn: "2026-10-12", text: "Our team retreat in Melbourne was a blast." }, candidates)).toBeNull();
  });

  it("never matches a job post", () => {
    expect(matchPost("linkedin", { kind: "job", postedOn: "2026-10-12", text: "Level 3 of AI is a commitment, not a tool." }, candidates)).toBeNull();
  });
});
