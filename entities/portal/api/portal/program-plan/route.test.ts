import { beforeEach, describe, expect, it, vi } from "vitest";

// The client's name is written into the model's system prompt. It is the
// actor's given name, never actorDisplayName's email fallback; with no given
// name the sentence is left out (S.16.26).

let actor: { greeting: string | null; displayName: string } | null = null;
const systems: string[] = [];
vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor }) }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
vi.mock("@/kernel/ai/response", () => ({ logAiUsage: vi.fn() }));
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({
    messages: {
      stream: (args: { system: { text: string }[] }) => {
        systems.push(args.system[0].text);
        return { on: () => undefined, finalMessage: async () => Promise.reject(new Error("stop after the prompt")) };
      },
    },
  }),
}));

import { POST } from "./route";

async function ask() {
  const req = new Request("https://edge8.test/api/portal/program-plan", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "Plan my program" }] }),
  });
  const res = await POST(req as never);
  await res.text();
  return systems[0];
}

beforeEach(() => {
  systems.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the program-plan prompt", () => {
  it("names the client by their given name", async () => {
    actor = { greeting: "Lan", displayName: "Trần Thị Lan" };
    expect(await ask()).toContain("The user's name is Lan.");
  });

  it("never names them by their email, and says nothing when there is no given name", async () => {
    actor = { greeting: null, displayName: "lan@client.test" };
    const system = await ask();
    expect(system).not.toContain("lan@client.test");
    expect(system).not.toContain("The user's name is");
  });
});
