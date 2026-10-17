import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  anthropic,
  anthropicConfigured,
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
    vi.stubEnv("ANTHROPIC_PRIMARY_API_KEY", undefined);
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

  it("with a primary key, the client sends it and keeps ANTHROPIC_API_KEY as the fallback", () => {
    vi.stubEnv("ANTHROPIC_PRIMARY_API_KEY", "free-credits-key");
    const client = anthropic();
    expect(client.apiKey).toBe("free-credits-key");
    expect(client.middleware).toHaveLength(1);
  });

  it("without a primary key, ANTHROPIC_API_KEY alone is used, with no fallback", () => {
    const client = anthropic();
    expect(client.apiKey).toBe("test-key");
    expect(client.middleware).toHaveLength(0);
  });

  it("either key is enough to call Claude; a blank one counts as unset", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("ANTHROPIC_PRIMARY_API_KEY", "  ");
    expect(anthropicConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_PRIMARY_API_KEY", "free-credits-key");
    expect(anthropicConfigured()).toBe(true);
    const client = anthropicIfConfigured();
    expect(client?.apiKey).toBe("free-credits-key");
    expect(client?.middleware).toHaveLength(0);
  });
});
