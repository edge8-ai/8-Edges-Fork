import { fakeJsonMessage, fakeMessage } from "@/kernel/ai/testing/fake-message";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The validation-failure path at a site whose failure contract is `null`.
//
// "Same never-throws contract as the other lib/ai helpers: returns null on any
// failure" — the module's own header. A shape the model got wrong is a failure,
// and this file pins that A.4 kept the contract.
//
// Worth saying plainly: this is the site where validation changes nothing a
// caller can see. `typeof parsed.takeaway === "string"` downstream already
// turned a missing or mistyped field into "" and then into null, so removing
// the safeParse from readStructuredOutput leaves these two cases green —
// checked, by doing it. What the conversion adds here is WHERE the refusal
// happens and that it is greppable: an `ai-schema-violation` line naming the
// site, instead of a silent empty string.
//
// The two sites where validation is load-bearing are pinned by mutation:
// crm/lib/sprint-extract.test.ts and hiring/lib/interview-panelist-validation.test.ts.

const create = vi.fn();
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => ({ messages: { create } }) }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));

const { generateBroadcastTakeaway } = await import("./broadcast-takeaway");
import type { BroadcastTakeawayInput } from "./broadcast-takeaway";

const INPUT: BroadcastTakeawayInput = {
  name: "September digest",
  subject: "September numbers",
  sent: 100,
  delivered: 98,
  opened: 40,
  clicked: 9,
  unsubscribed: 1,
  topTopics: [{ topic: "hiring", people: 6 }],
};

beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateBroadcastTakeaway", () => {
  it("returns the takeaway when the reply matches the schema", () => {
    create.mockResolvedValue(fakeJsonMessage({ takeaway: "  Opens beat the last three sends.  " }));
    return expect(generateBroadcastTakeaway(INPUT)).resolves.toBe("Opens beat the last three sends.");
  });

  it("returns null when the model omits the field it was asked for", async () => {
    create.mockResolvedValue(fakeJsonMessage({ summary: "wrong key" }));
    expect(await generateBroadcastTakeaway(INPUT)).toBeNull();
  });

  it("returns null when the field is the wrong type", async () => {
    create.mockResolvedValue(fakeJsonMessage({ takeaway: 42 }));
    expect(await generateBroadcastTakeaway(INPUT)).toBeNull();
  });

  it("returns null when the reply is not JSON at all", async () => {
    create.mockResolvedValue(fakeMessage({ text: "I'd rather not." }));
    expect(await generateBroadcastTakeaway(INPUT)).toBeNull();
  });
});
