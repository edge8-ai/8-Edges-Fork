import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkStatusPage, SECTION_MAX_LINES } from "./check";
import { gatherFacts, STATUS_SECTIONS, type StatusFacts } from "./facts";
import { renderStatusPage } from "./render";
import { board, WEEK } from "./testing/fixtures";

// Z.12 review, finding 3: a busy board. Forty open cards must not ask for a
// draft the check's caps refuse, nor one cut off at max_tokens. The model is
// handed at most eight facts per section and told the limit, the call has room
// to answer, and a draft that keeps to what it was handed passes the check.

const sent = vi.hoisted(() => ({ body: null as null | Record<string, unknown> }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/ai/gateway", () => ({
  aiSite: (decl: { site: string }) => ({
    site: decl.site,
    model: "claude-test",
    clientIfConfigured: () => ({
      messages: {
        create: async (body: Record<string, unknown>) => {
          sent.body = body;
          return { content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: {} };
        },
      },
    }),
  }),
}));
vi.mock("@/kernel/ai/response", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/ai/response")>()),
  readStructuredOutput: () => ({ ok: false, error: "not read in this test" }),
}));

const { draftNarrative, draftPrompt, factsForModel } = await import("./draft");

function busyFacts(): StatusFacts {
  const b = board();
  const lanes = ["To do", "Doing", "Waiting on you"];
  for (let i = 0; i < 40; i++) {
    b.cards.push({ ...b.cards[3], id: `busy-${i}`, title: `Busy card ${i}`, laneId: lanes[i % 3], updated_at: `2026-10-${String(10 + (i % 6)).padStart(2, "0")}T00:00:00Z` });
  }
  for (let i = 0; i < 12; i++) b.cards.push({ ...b.cards[0], id: `done-${i}`, title: `Done card ${i}`, completed_at: "2026-10-15T00:00:00Z" });
  return gatherFacts({ company: "Acme Foods", week: WEEK, board: b, roadmap: [], documents: [] });
}

beforeEach(() => {
  sent.body = null;
});

describe("a draft on a busy board", () => {
  it("hands the model at most eight facts per section, newest first", () => {
    const facts = busyFacts();
    expect(facts.items.length).toBeGreaterThan(40);
    const handed = factsForModel(facts);
    for (const key of STATUS_SECTIONS) {
      const all = facts.items.filter((f) => f.section === key);
      const kept = handed.filter((f) => f.section === key);
      expect(kept.length).toBe(Math.min(all.length, SECTION_MAX_LINES));
      expect(kept).toEqual(all.slice(0, kept.length));
    }
    const prompt = draftPrompt(facts, null);
    const block = JSON.parse(prompt.slice(prompt.indexOf("```json") + 7, prompt.lastIndexOf("```"))) as { facts: unknown[] };
    expect(block.facts).toHaveLength(handed.length);
  });

  it("tells the model the limits and gives it room to answer", async () => {
    await draftNarrative(busyFacts(), null);
    expect(sent.body?.max_tokens).toBe(4000);
    expect(String(sent.body?.system)).toContain(`at most ${SECTION_MAX_LINES} lines`);
    expect(String(sent.body?.system)).toContain("most important first");
    expect(String(sent.body?.system)).toContain("at most 200 characters");
  });

  it("a draft that keeps to the facts it was handed passes the check", () => {
    const facts = busyFacts();
    const handed = factsForModel(facts);
    const pick = (key: (typeof STATUS_SECTIONS)[number]) => handed.filter((f) => f.section === key).map((f) => ({ factId: f.id, line: `${f.title} moved on.` }));
    const narrative = { summary: "A busy week. Much moved.", shipped: pick("shipped"), inProgress: pick("inProgress"), next: pick("next"), needsFromClient: pick("needsFromClient") };
    expect(checkStatusPage({ bodyHtml: renderStatusPage(facts, narrative), narrative, facts, otherClients: [] })).toEqual({ ok: true });
  });
});
