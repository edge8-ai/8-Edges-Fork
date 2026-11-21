import { describe, expect, it } from "vitest";
import { costOf, priceFor, PRICES_READ_ON } from "./prices";

// Y.76: every ai_calls row carries a cost. These pin the arithmetic: list
// price per million tokens, cached tokens priced apart, micro-dollar rounding.

describe("costOf", () => {
  it("prices a Sonnet 5 call: input, output, cache read and cache write each at their own rate", () => {
    const usage = { input_tokens: 1_000, output_tokens: 2_000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 4_000 };
    // 1000*2 + 2000*10 + 10000*0.2 + 4000*2.5 = 2000 + 20000 + 2000 + 10000 = 34000 micro-dollars
    expect(costOf("claude-sonnet-5", usage)).toBe(0.034);
  });

  it("prices an OpenRouter model by its slug", () => {
    expect(costOf("deepseek/deepseek-v4.1-flash", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(1.0283);
  });

  it("is null without usage (a failed call) and for a model the table does not know", () => {
    expect(costOf("claude-sonnet-5", null)).toBeNull();
    expect(costOf("some/unknown-model", { input_tokens: 10, output_tokens: 10 })).toBeNull();
  });

  it("knows every model a tier resolves to today", async () => {
    const { TIERS } = await import("./models");
    for (const model of Object.values(TIERS)) expect(priceFor(model), model).not.toBeNull();
  });

  it("says when its prices were read", () => {
    expect(PRICES_READ_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
