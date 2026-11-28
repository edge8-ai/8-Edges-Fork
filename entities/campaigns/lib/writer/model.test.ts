import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { definePrompt } from "@/kernel/ai/prompts";

// Y.96: a writer step whose answer fails its own checks used to return the
// error and keep nothing, so the agent driver sent the same request five
// minutes later with no word of what failed. In October that threw away 20 USD
// of Fable answers, the same chart figure four times running. The SEO step
// already retried in-step with the failures named, and lost no run; this is
// that retry, shared, so each step's second request carries what to fix.

const create = vi.hoisted(() => vi.fn());
vi.mock("@/kernel/ai/gateway", async () => {
  // The budget arithmetic stays real: it is what decides whether a retry fits.
  const { callBudget } = await vi.importActual<typeof import("@/kernel/ai/call-record")>("@/kernel/ai/call-record");
  return {
    callBudget,
    aiSite: ({ site }: { site: string }) => ({ site, model: "claude-test", clientIfConfigured: () => ({ messages: { create } }) }),
  };
});
// The fake response carries the parsed answer, so the test reads what the
// model "said" without the JSON round trip readStructuredOutput owns.
vi.mock("@/kernel/ai/response", () => ({
  jsonSchemaFor: () => ({}),
  readStructuredOutput: (_site: string, _model: string, response: { data: unknown }) => ({ ok: true, data: response.data }),
}));

const { callCheckedWriterModel, stepCallBudgetMs } = await import("./model");

const PROMPT = definePrompt("writer-edit", {
  system: "System.",
  user: "{{body}}",
  parts: { retry: `\n\n# Your previous answer failed these checks; fix every one\n{{failures}}` },
});
const schema = z.object({ body: z.string() });
type Answer = z.infer<typeof schema>;

type Check = (a: Answer) => { ok: true; value: string } | { ok: false; failures: string[]; retry?: boolean };

/** A check that refuses any body containing "recruiter". */
const noRecruiter: Check = (a) =>
  a.body.includes("recruiter") ? { ok: false, failures: ["Uses hiring language (recruiter). Remove it."] } : { ok: true, value: a.body };

const call = (over: { check?: Check; afterMs?: number } = {}) =>
  callCheckedWriterModel({
    step: "edit",
    prompt: PROMPT,
    system: "System.",
    user: "The body.",
    schema,
    check: over.check ?? noRecruiter,
    label: "Edit",
    afterMs: over.afterMs,
  });

const answers = (...bodies: string[]) => {
  for (const body of bodies) create.mockResolvedValueOnce({ data: { body } });
};
const sentUser = (i: number) => (create.mock.calls[i][0] as { messages: { content: string }[] }).messages[0].content;
const sentTimeout = (i: number) => (create.mock.calls[i][1] as { timeout: number }).timeout;

beforeEach(() => {
  create.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("callCheckedWriterModel", () => {
  it("makes one call when the first answer passes", async () => {
    answers("A clean body.");
    expect(await call()).toEqual({ ok: true, data: "A clean body." });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once with every failed check named after the unchanged request", async () => {
    answers("Ask a recruiter.", "A clean body.");
    expect(await call()).toEqual({ ok: true, data: "A clean body." });
    expect(create).toHaveBeenCalledTimes(2);
    expect(sentUser(0)).toBe("The body.");
    expect(sentUser(1)).toBe(
      "The body.\n\n# Your previous answer failed these checks; fix every one\n- Uses hiring language (recruiter). Remove it.",
    );
  });

  it("stops after one retry and reports the second answer's failures under the step's label", async () => {
    answers("Ask a recruiter.", "Still a recruiter.");
    expect(await call()).toEqual({ ok: false, error: "Edit: Uses hiring language (recruiter). Remove it." });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failure the model cannot fix", async () => {
    answers("Planned style.");
    const planned: Check = () => ({ ok: false, failures: ["The linkedin style \"hook-story\" is the plan's."], retry: false });
    expect(await call({ check: planned })).toEqual({ ok: false, error: "Edit: The linkedin style \"hook-story\" is the plan's." });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives the retry only the time the step has left", async () => {
    create.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      return { data: { body: "Ask a recruiter." } };
    });
    answers("A clean body.");
    expect(await call({ afterMs: 30_000 })).toEqual({ ok: true, data: "A clean body." });
    // 280 s for the step's calls (300 s route less the gateway's 20 s), less
    // the 60 s the first call took and the 30 s the step needs afterwards.
    expect(sentTimeout(1)).toBe(190_000);
  });

  it("skips the retry when the first call left too little time, and keeps the failure", async () => {
    create.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 145_000);
      return { data: { body: "Ask a recruiter." } };
    });
    expect(await call()).toEqual({ ok: false, error: "Edit: Uses hiring language (recruiter). Remove it." });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("takes the step's budget from the gateway: 300 s route less its 20 s margin", () => {
    expect(stepCallBudgetMs()).toBe(280_000);
  });

  it("never retries when the caller keeps a whole call's budget back, as the draft step does for the plan", async () => {
    answers("Ask a recruiter.");
    expect(await call({ afterMs: stepCallBudgetMs() })).toEqual({ ok: false, error: "Edit: Uses hiring language (recruiter). Remove it." });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns a failed model call as it is, without retrying", async () => {
    create.mockRejectedValueOnce(new Error("overloaded"));
    expect(await call()).toEqual({ ok: false, error: "overloaded" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
