import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  anthropic,
  anthropicIfConfigured,
  openRouterIfConfigured,
  resetAnthropicClient,
  anthropicTimeoutMs,
} from "@/kernel/ai/client";

describe("lib/ai/client", () => {
  beforeEach(() => {
    resetAnthropicClient();
    vi.stubEnv("ANTHROPIC_TIMEOUT_MS", undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetAnthropicClient();
  });

  it("anthropic() is a singleton", () => {
    expect(anthropic()).toBe(anthropic());
  });

  it("default timeout is 120s and retries are 2", () => {
    const client = anthropic();
    expect(client.timeout).toBe(120_000);
    expect(client.maxRetries).toBe(2);
  });

  it("ANTHROPIC_TIMEOUT_MS overrides the timeout; garbage falls back", () => {
    vi.stubEnv("ANTHROPIC_TIMEOUT_MS", "5000");
    expect(anthropicTimeoutMs()).toBe(5000);
    expect(anthropic().timeout).toBe(5000);
    vi.stubEnv("ANTHROPIC_TIMEOUT_MS", "soon");
    expect(anthropicTimeoutMs()).toBe(120_000);
  });

  it("the OpenRouter client is the same SDK on OpenRouter's base URL, and needs its own key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    expect(openRouterIfConfigured()).toBeNull();
    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");
    const client = openRouterIfConfigured();
    expect(client?.baseURL).toBe("https://openrouter.ai/api");
    expect(client?.apiKey).toBe("or-test-key");
    expect(anthropic().baseURL).not.toContain("openrouter");
  });

  it("anthropicIfConfigured returns null without a key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    expect(anthropicIfConfigured()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(anthropicIfConfigured()).toBeTruthy();
  });
});
