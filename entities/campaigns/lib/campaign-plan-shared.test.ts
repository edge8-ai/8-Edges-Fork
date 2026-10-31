import { describe, expect, it } from "vitest";
import type { LedgerRow } from "./campaign-ledger-shared";
import { parseCampaignPlan, planErrors, planMdFrom, readerQuestionError, withPlanSection, type CampaignPlan } from "./campaign-plan-shared";

const plan: CampaignPlan = {
  angle: "A retreat pays off in the 90 days after it.",
  question: "How do I get the most out of an AI retreat?",
  keyword: "AI retreat",
  blogType: "listicle",
  heroImageStyle: "editorial-illustration",
  social: { linkedin: "data-point", facebook: "hook-story" },
};
const ctx = { brandName: "Edge8", recent: [] as LedgerRow[], blogTypes: ["listicle", "thesis"], imageStyles: ["editorial-illustration"], socialStyles: ["data-point", "hook-story"], socialChannels: ["linkedin", "facebook"] };

describe("the plan section", () => {
  it("round-trips through the SEO/GEO plan, and reads only its own section", () => {
    const doc = withPlanSection("## Search (SEO)\n\n**Primary keyword:** something else", planMdFrom(plan));
    expect(doc.startsWith("## Plan")).toBe(true);
    expect(parseCampaignPlan(doc)).toEqual(plan);
    expect(parseCampaignPlan("## Search (SEO)\n\n**Primary keyword:** x")).toBeNull();
  });
  it("replaces an existing plan and keeps everything else", () => {
    const first = withPlanSection("## FAQ\n1. Q: a", planMdFrom(plan));
    const second = withPlanSection(first, planMdFrom({ ...plan, blogType: "thesis" }));
    expect(parseCampaignPlan(second)?.blogType).toBe("thesis");
    expect(second.match(/## Plan/g)).toHaveLength(1);
    expect(second).toContain("## FAQ\n1. Q: a");
    expect(withPlanSection(second, null)).toBe("## FAQ\n1. Q: a");
  });
});

describe("planErrors", () => {
  it("accepts a plan that keeps every rule", () => {
    expect(planErrors(plan, ctx)).toEqual([]);
  });
  it("names each broken rule", () => {
    const bad = { ...plan, question: "Why does Edge8 run retreats?", blogType: "pop-art", social: { linkedin: "hot-take" } };
    const errors = planErrors(bad, ctx).join(" ");
    expect(errors).toMatch(/Blog type "pop-art" is not one of the brand's preferred/);
    expect(errors).toMatch(/linkedin style "hot-take" is not one of the brand's preferred/);
    expect(errors).toMatch(/No facebook style/);
    expect(errors).toMatch(/must start with How or What/);
    expect(errors).toMatch(/must contain the keyword "AI retreat"/);
    expect(errors).toMatch(/names Edge8/);
  });
});

describe("readerQuestionError", () => {
  it("refuses a brand-named question or one about what a source says", () => {
    expect(readerQuestionError(["How do I run better one-on-one meetings with AI?"], "Edge8")).toBeNull();
    expect(readerQuestionError(["How does meeting prep work at Edge8?"], "Edge8")).toMatch(/names Edge8/);
    expect(readerQuestionError(["What does the Stanford playbook say about pilots?"], "Edge8")).toMatch(/asks what a source says/);
  });
});
