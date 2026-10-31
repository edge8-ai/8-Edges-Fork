import { fakeJsonMessage, fakeMessage } from "@/kernel/ai/testing/fake-message";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The validation-failure path at a site whose failure contract is
// `{ ok: false, error }` — the second of the three shapes A.4 had to preserve.
//
// This one also pins the message a bad shape produces, because that string is
// what an admin reads on the sprint-planning screen when the extraction fails.

const create = vi.fn();
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => ({ messages: { create } }) }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      const rows = table === "meetings"
        ? { data: { title: "Weekly planning", started_at: "2026-09-14T09:00:00Z" } }
        : { data: [{ transcript: "We discussed Acme's sprint.", started_at: "2026-09-14T09:00:00Z" }] };
      const builder: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown) => Promise.resolve({ ...rows, error: null }).then(res),
      };
      for (const op of ["select", "eq", "order", "maybeSingle"]) builder[op] = () => builder;
      return builder;
    },
  },
}));

const { extractSprintBrief } = await import("./sprint-extract");

beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("extractSprintBrief", () => {
  it("returns the draft when the reply matches the schema", async () => {
    create.mockResolvedValue(
      fakeJsonMessage({ goal: "  Ship the portal.  ", focus_improvement: null, going_well: null, meeting_summary: null }),
    );
    const res = await extractSprintBrief("m1", "Acme");
    expect(res).toEqual({
      ok: true,
      draft: { goal: "Ship the portal.", focus_improvement: null, going_well: null, meeting_summary: null },
    });
  });

  it("refuses a reply missing the fields it was asked for, naming them", async () => {
    // Before A.4 this was `JSON.parse(out.text) as SprintBriefDraft` — the
    // three absent fields would have become undefined on the draft and been
    // written to the sprint brief as blanks.
    create.mockResolvedValue(fakeJsonMessage({ goal: "Ship the portal." }));
    const res = await extractSprintBrief("m1", "Acme");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("focus_improvement");
  });

  it("refuses a reply that is not JSON, as invalid JSON rather than a shape failure", async () => {
    create.mockResolvedValue(fakeMessage({ text: "Sorry, no." }));
    const res = await extractSprintBrief("m1", "Acme");
    expect(res.ok === false && res.error).toContain("invalid JSON");
  });

  it("passes the site's own refusal message through when the model declines", async () => {
    create.mockResolvedValue(fakeMessage({ stopReason: "refusal" }));
    const res = await extractSprintBrief("m1", "Acme");
    expect(res).toEqual({ ok: false, error: "The model declined to read this transcript." });
  });
});
