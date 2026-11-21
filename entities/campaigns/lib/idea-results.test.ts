import { describe, expect, it } from "vitest";
import { rankIdeas, type IdeaSignal } from "./idea-results";

// Ideas worth building on (MK.1): ranked by what they produced, marked Build
// on it, Quiet or not measured. Campaign names are invented.
const idea = (o: Partial<IdeaSignal> & { id: string }): IdeaSignal => ({ name: `Idea ${o.id}`, pillar: "Data first", delivered: 0, opened: 0, clicked: 0, engagement: 0, socialMeasured: false, ...o });

describe("rankIdeas", () => {
  it("ranks by value won, then deals, then inquiries, then email clicks", () => {
    const { ideas } = rankIdeas(
      [idea({ id: "clicks", delivered: 100, opened: 40, clicked: 9 }), idea({ id: "inquiry" }), idea({ id: "won" }), idea({ id: "deal" })],
      new Map([
        ["inquiry", { inquiries: 2, deals: 0, won: 0, wonUsd: 0 }],
        ["won", { inquiries: 1, deals: 1, won: 1, wonUsd: 30000 }],
        ["deal", { inquiries: 0, deals: 1, won: 0, wonUsd: 0 }],
      ]),
    );
    expect(ideas.map((i) => i.id)).toEqual(["won", "deal", "inquiry", "clicks"]);
    expect(ideas[0].line).toBe("1 inquiry · 1 deal, $30,000 won");
  });

  it("marks an idea that pulled, or whose opens stand out, as worth building on; measured with nothing as quiet; the rest unmeasured", () => {
    const { ideas } = rankIdeas(
      [
        idea({ id: "pulled" }),
        idea({ id: "opens", delivered: 100, opened: 70 }),
        idea({ id: "avg1", delivered: 100, opened: 40 }),
        idea({ id: "avg2", delivered: 100, opened: 42 }),
        idea({ id: "social", socialMeasured: true }),
        idea({ id: "nothing" }),
      ],
      new Map([["pulled", { inquiries: 1, deals: 0, won: 0, wonUsd: 0 }]]),
    );
    const verdict = Object.fromEntries(ideas.map((i) => [i.id, i.verdict]));
    expect(verdict).toEqual({ pulled: "build", opens: "build", avg1: "quiet", avg2: "quiet", social: "quiet", nothing: "unmeasured" });
    expect(ideas.find((i) => i.id === "nothing")?.line).toBe("Nothing measured yet");
  });

  it("scores pillars by inquiries and deals per idea", () => {
    const { pillars } = rankIdeas(
      [idea({ id: "a", pillar: "Data first" }), idea({ id: "b", pillar: "Data first" }), idea({ id: "c", pillar: "Lead with AI" }), idea({ id: "d", pillar: null })],
      new Map([
        ["a", { inquiries: 2, deals: 1, won: 0, wonUsd: 0 }],
        ["c", { inquiries: 1, deals: 0, won: 0, wonUsd: 0 }],
      ]),
    );
    expect(pillars).toEqual([
      { pillar: "Data first", ideas: 2, pulled: 3, perIdea: 1.5 },
      { pillar: "Lead with AI", ideas: 1, pulled: 1, perIdea: 1 },
    ]);
  });
});
