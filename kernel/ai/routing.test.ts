import { describe, it, expect } from "vitest";
import { AiRouteRefused, checkOtherProvider, dataClassOf, isClaudeModel, isFp4Host, providerFieldFor, routeFor, routeForRequest } from "@/kernel/ai/routing";

describe("kernel/ai/routing", () => {
  it("a Claude model goes to api.anthropic.com whatever the class", () => {
    for (const cls of ["S", "C", "B", "A"] as const) {
      expect(routeFor("any-site", cls, "claude-sonnet-5")).toEqual({ provider: "anthropic", providerPrefs: null });
    }
  });

  it("class S refuses a model that is not Claude", () => {
    expect(() => routeFor("resume-screen", "S", "deepseek/deepseek-v4-pro")).toThrow(AiRouteRefused);
  });

  it("an undeclared or unknown class is treated as S", () => {
    expect(dataClassOf(undefined)).toBe("S");
    expect(dataClassOf(null)).toBe("S");
    expect(dataClassOf("s")).toBe("S");
    expect(dataClassOf("Z")).toBe("S");
    expect(dataClassOf("B")).toBe("B");
    expect(() => routeFor("new-site", undefined, "deepseek/deepseek-v4-pro")).toThrow(AiRouteRefused);
    expect(() => routeFor("new-site", "nonsense", "deepseek/deepseek-v4-pro")).toThrow(AiRouteRefused);
  });

  it("class C reaches OpenRouter with data collection denied, and no longer needs zero retention", () => {
    const route = routeFor("meeting-summary", "C", "deepseek/deepseek-v4-pro");
    expect(route).toEqual({
      provider: "openrouter",
      providerPrefs: { data_collection: "deny", require_parameters: true },
    });
    expect(route.providerPrefs).not.toHaveProperty("zdr");
  });

  it("Fable, which Anthropic keeps for 30 days, is refused for classes S and C", () => {
    for (const cls of ["S", "C"] as const) {
      expect(() => routeFor("writer-personal-draft", cls, "claude-fable-5-1")).toThrow(AiRouteRefused);
      expect(() => routeFor("writer-personal-draft", cls, " claude-fable-5 ")).toThrow(AiRouteRefused);
    }
    expect(() => routeFor("new-site", undefined, "claude-fable-5-1")).toThrow(AiRouteRefused);
  });

  it("Fable stays allowed for classes B and A, direct to Anthropic", () => {
    for (const cls of ["B", "A"] as const) {
      expect(routeFor("writer-edit", cls, "claude-fable-5-1")).toEqual({ provider: "anthropic", providerPrefs: null });
    }
  });

  it("the Fable refusal names the site, the class and the retention", () => {
    expect(() => routeFor("writer-letter-gather", "C", "claude-fable-5-1")).toThrow(
      /writer-letter-gather \(class C\).*claude-fable-5-1.*30 days/,
    );
  });

  it("classes B and A reach OpenRouter with parameters required", () => {
    for (const cls of ["B", "A"] as const) {
      expect(routeFor("idea-trends", cls, "qwen/qwen3.8-flash")).toEqual({
        provider: "openrouter",
        providerPrefs: { require_parameters: true },
      });
    }
  });

  it("Claude never goes through OpenRouter, even spelled as an OpenRouter slug", () => {
    for (const cls of ["S", "C", "B", "A"] as const) {
      expect(() => routeFor("idea-trends", cls, "anthropic/claude-haiku-4.5")).toThrow(AiRouteRefused);
    }
  });

  describe("providerFieldFor: a route can pin a host, never loosen its class", () => {
    const pin = { order: ["deepinfra/fp8"], allow_fallbacks: false };

    it("keeps the request's host order on an OpenRouter route, beside the class's guards", () => {
      const route = routeFor("meeting-summary", "C", "deepseek/deepseek-v4-pro");
      expect(providerFieldFor(route, pin)).toEqual({
        order: ["deepinfra/fp8"],
        allow_fallbacks: false,
        data_collection: "deny",
        require_parameters: true,
      });
    });

    it("the class's guards win over anything the request says about the same keys", () => {
      const route = routeFor("meeting-summary", "C", "deepseek/deepseek-v4-pro");
      const field = providerFieldFor(route, { ...pin, data_collection: "allow", require_parameters: false });
      expect(field).toMatchObject({ data_collection: "deny", require_parameters: true, order: ["deepinfra/fp8"] });
    });

    it("a request with no provider field gets the class's guards alone", () => {
      const route = routeFor("idea-trends", "B", "qwen/qwen3.8-flash");
      expect(providerFieldFor(route, undefined)).toEqual({ require_parameters: true });
      expect(providerFieldFor(route, "deepinfra")).toEqual({ require_parameters: true });
      expect(providerFieldFor(route, ["deepinfra"])).toEqual({ require_parameters: true });
    });

    it("an Anthropic route sends no provider field at all, whatever the request carried", () => {
      const route = routeFor("idea-trends", "B", "claude-sonnet-5");
      expect(providerFieldFor(route, pin)).toBeNull();
    });
  });

  it("a blank model is refused", () => {
    expect(() => routeFor("idea-trends", "B", "  ")).toThrow(AiRouteRefused);
  });

  it("isClaudeModel reads the Anthropic API spelling only", () => {
    expect(isClaudeModel("claude-haiku-4-5")).toBe(true);
    expect(isClaudeModel("claude-fable-5-1")).toBe(true);
    expect(isClaudeModel("anthropic/claude-haiku-4.5")).toBe(false);
    expect(isClaudeModel("gemini-2.5-flash-image")).toBe(false);
    expect(isClaudeModel("test-model")).toBe(false);
  });

  it("a provider's own API outside Anthropic and OpenRouter carries classes B and A only", () => {
    expect(() => checkOtherProvider("brand-image", "A", "google")).not.toThrow();
    expect(() => checkOtherProvider("brand-image", "B", "google")).not.toThrow();
    expect(() => checkOtherProvider("brand-image", "C", "google")).toThrow(AiRouteRefused);
    expect(() => checkOtherProvider("brand-image", "S", "google")).toThrow(AiRouteRefused);
    expect(() => checkOtherProvider("brand-image", undefined, "google")).toThrow(AiRouteRefused);
  });

  it("the refusal names the site, the class and the model", () => {
    try {
      routeFor("resume-screen", "S", "deepseek/deepseek-v4-pro");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AiRouteRefused);
      expect((e as Error).message).toContain("resume-screen");
      expect((e as Error).message).toContain("class S");
      expect((e as Error).message).toContain("deepseek/deepseek-v4-pro");
    }
  });

  describe("a request's models[] fallback list (Y.78)", () => {
    const OPEN = "deepseek/deepseek-v4-pro";
    it("passes when every entry routes like the primary model", () => {
      expect(routeForRequest("idea-trends", "B", OPEN, ["z-ai/glm-5.3", "qwen/qwen3.8"])).toEqual(routeFor("idea-trends", "B", OPEN));
      expect(routeForRequest("idea-trends", "B", OPEN, undefined)).toEqual(routeFor("idea-trends", "B", OPEN));
    });
    it("refuses Claude reached through OpenRouter as a fallback", () => {
      expect(() => routeForRequest("idea-trends", "B", OPEN, ["claude-sonnet-5"])).toThrow(/does not route like/);
      expect(() => routeForRequest("idea-trends", "B", OPEN, ["anthropic/claude-sonnet-5"])).toThrow(AiRouteRefused);
    });
    it("refuses an entry the class does not allow: Fable on class C, an open model on class S", () => {
      expect(() => routeForRequest("meeting-summary", "C", OPEN, ["claude-fable-5-1"])).toThrow(AiRouteRefused);
      expect(() => routeForRequest("resume-screen", "S", "claude-sonnet-5", [OPEN])).toThrow(AiRouteRefused);
    });
    it("refuses any list on a Claude request, even an empty one", () => {
      expect(() => routeForRequest("idea-trends", "B", "claude-sonnet-5", [])).toThrow(/carries no models\[\] fallback list/);
    });
    it("refuses a list that is not of model ids", () => {
      expect(() => routeForRequest("idea-trends", "B", OPEN, "z-ai/glm-5.3")).toThrow(/must be a list of model ids/);
      expect(() => routeForRequest("idea-trends", "B", OPEN, [42])).toThrow(/must be a list of model ids/);
    });
  });

  describe("fp4 is refused everywhere (Y.79)", () => {
    const route = routeFor("idea-trends", "B", "deepseek/deepseek-v4-pro");
    it("names an fp4 endpoint by its tag", () => {
      expect(isFp4Host("deepinfra/fp4")).toBe(true);
      expect(isFp4Host("xiaomi/fp8")).toBe(false);
    });
    it("refuses a pin naming fp4 in its order, its only list or its quantizations", () => {
      for (const pin of [{ order: ["deepinfra/fp4"] }, { only: ["together/FP4"] }, { quantizations: ["fp8", "fp4"] }]) {
        expect(() => providerFieldFor(route, pin)).toThrow(/fp4 endpoint/);
      }
    });
    it("passes an fp8 pin with the class's guards on top", () => {
      expect(providerFieldFor(route, { order: ["xiaomi/fp8"], allow_fallbacks: false })).toEqual({
        order: ["xiaomi/fp8"],
        allow_fallbacks: false,
        require_parameters: true,
      });
    });
  });
});
