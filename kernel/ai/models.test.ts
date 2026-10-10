import { describe, it, expect } from "vitest";
import { TIERS, SITE_ENV, SITE_MODELS, envNameFor, fallbackFor, fallbackSiteOf, hostEnvNameFor, hostFor, modelFor, siteModelFor, siteOverrideNames } from "@/kernel/ai/models";

describe("lib/ai/models", () => {
  it("tiers pin one spelling per model", () => {
    expect(TIERS.fast).toBe("claude-sonnet-5");
    expect(TIERS.standard).toBe("claude-sonnet-5");
    expect(TIERS.deep).toBe("claude-opus-5-5");
    expect(TIERS.frontier).toBe("claude-fable-5-1");
  });

  it("modelFor falls back to the tier default", () => {
    expect(modelFor("resume-extract", "fast", {})).toBe("claude-sonnet-5");
    expect(modelFor("resume-screen", "standard", {})).toBe("claude-sonnet-5");
  });

  it("the seven legacy env override names still work, plus the new interview one", () => {
    const cases: [string, string][] = [
      ["admin-chat", "CHATBOT_MODEL"],
      ["team-chat", "CHATBOT_MODEL"],
      ["program-plan", "CHATBOT_MODEL"],
      ["publish-editor", "WRITER_CLAUDE_MODEL"],
      ["brand-writer", "WRITER_CLAUDE_MODEL"],
      ["campaign-seo", "WRITER_CLAUDE_MODEL"],
      ["entry-copy", "WRITER_CLAUDE_MODEL"],
      ["admin-idea-plan", "IDEAS_CLAUDE_MODEL"],
      ["idea-trends", "IDEAS_CLAUDE_MODEL"],
      ["meeting-summary", "MEETINGS_CLAUDE_MODEL"],
      ["review-summary", "REVIEW_CLAUDE_MODEL"],
      ["coaching-text", "COACHING_CLAUDE_MODEL"],
      ["coaching-summary", "COACHING_CLAUDE_MODEL"],
      ["roadmap-assist", "ROADMAP_ASSIST_MODEL"],
      ["interview-panelist", "INTERVIEW_CLAUDE_MODEL"],
    ];
    for (const [site, envName] of cases) {
      expect(SITE_ENV[site], site).toBe(envName);
      expect(modelFor(site, "standard", { [envName]: "custom-model" }), site).toBe("custom-model");
    }
  });

  it("AI_MODEL_<SITE> is derived from the logAiUsage site name", () => {
    expect(envNameFor("interview-panelist")).toBe("AI_MODEL_INTERVIEW_PANELIST");
    expect(envNameFor("htt-summarize")).toBe("AI_MODEL_HTT_SUMMARIZE");
    expect(modelFor("sprint-extract", "fast", { AI_MODEL_SPRINT_EXTRACT: "x" })).toBe("x");
  });

  it("AI_MODEL_<SITE> beats the legacy shared name; blanks are ignored", () => {
    const env = { CHATBOT_MODEL: "shared", AI_MODEL_ADMIN_CHAT: "specific" };
    expect(modelFor("admin-chat", "standard", env)).toBe("specific");
    expect(modelFor("team-chat", "standard", env)).toBe("shared");
    expect(modelFor("team-chat", "standard", { CHATBOT_MODEL: "  " })).toBe("claude-sonnet-5");
  });

  it("a site's host is AI_HOST_<SITE>, beside its model, and blank means none (Y.79)", () => {
    expect(hostEnvNameFor("meeting-summary")).toBe("AI_HOST_MEETING_SUMMARY");
    expect(hostFor("meeting-summary", { AI_HOST_MEETING_SUMMARY: " deepinfra/fp8 " })).toBe("deepinfra/fp8");
    expect(hostFor("meeting-summary", { AI_HOST_MEETING_SUMMARY: "  " })).toBeNull();
    expect(hostFor("meeting-summary", {})).toBeNull();
  });

  it("roadmap-assist defaults to Qwen on the eval's host, with Sonnet 5 after 12 s (Y.67.3)", () => {
    expect(modelFor("roadmap-assist", "fast", {})).toBe("qwen/qwen3.8-flash");
    expect(hostFor("roadmap-assist", {}, "qwen/qwen3.8-flash")).toBe("alibaba");
    expect(fallbackFor("roadmap-assist", "qwen/qwen3.8-flash")).toEqual({ model: "claude-sonnet-5", afterMs: 12_000 });
    expect(fallbackSiteOf("roadmap-assist")).toBe("roadmap-assist:fallback");
    // An override still wins, and an override onto another model leaves the eval's host behind.
    expect(modelFor("roadmap-assist", "fast", { AI_MODEL_ROADMAP_ASSIST: "claude-sonnet-5" })).toBe("claude-sonnet-5");
    expect(hostFor("roadmap-assist", {}, "deepseek/deepseek-v4.1-flash")).toBeNull();
    expect(hostFor("roadmap-assist", { AI_HOST_ROADMAP_ASSIST: "deepinfra/fp8" }, "deepseek/deepseek-v4.1-flash")).toBe("deepinfra/fp8");
    // On the fallback's own model there is nothing to fall back to.
    expect(fallbackFor("roadmap-assist", "claude-sonnet-5")).toBeNull();
    expect(fallbackFor("meeting-summary", "claude-sonnet-5")).toBeNull();
    // Every eval-chosen host is the host an eval may run: never fp4.
    for (const [site, choice] of Object.entries(SITE_MODELS)) expect(choice.host ?? "", site).not.toMatch(/fp4/i);
  });

  it("a step sharing a model resolves its own override first, then the shared chain (Y.71.1)", () => {
    expect(siteModelFor("writer-edit", "brand-writer", "frontier", {})).toBe(TIERS.frontier);
    expect(siteModelFor("writer-edit", "brand-writer", "frontier", { WRITER_CLAUDE_MODEL: "claude-opus-5-5" })).toBe("claude-opus-5-5");
    expect(siteModelFor("writer-edit", "brand-writer", "frontier", { WRITER_CLAUDE_MODEL: "claude-opus-5-5", AI_MODEL_WRITER_EDIT: "x/y" })).toBe("x/y");
    expect(siteModelFor("writer-seo", "brand-writer", "frontier", { AI_MODEL_WRITER_EDIT: "x/y" })).toBe(TIERS.frontier);
    // Without a shared name it is modelFor itself.
    expect(siteModelFor("team-chat", undefined, "standard", { CHATBOT_MODEL: "claude-opus-5-5" })).toBe("claude-opus-5-5");
    expect(siteOverrideNames("writer-edit", "brand-writer")).toEqual(["AI_MODEL_WRITER_EDIT", "AI_MODEL_BRAND_WRITER", "WRITER_CLAUDE_MODEL"]);
    expect(siteOverrideNames("team-chat", undefined)).toEqual(["AI_MODEL_TEAM_CHAT", "CHATBOT_MODEL"]);
  });
});
