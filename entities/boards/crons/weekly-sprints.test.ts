import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What the Tuesday routine promises: a sprint opens on every board that asked
// for weekly sprints and on no other, dated Wednesday to Tuesday and named by
// the board's own count; a board whose week is already planned is left alone
// and said so; each chat hears about its own boards, and a chat that hears
// nothing fails the run by name. The scripted `sprints` order is the order the
// routine asks: the read, then one insert per board that needs a sprint.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/reads", () => ({
  selectCompanies: () => ({ in: async () => ({ data: [{ id: "c1", name: "Client One" }], error: null }) }),
}));
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://os.example" }));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-09-21", // a Monday
}));
// The draft is the model's; here it themes a board that has open cards and
// leaves one with none alone, which is what the real draft does without a key.
vi.mock("@/entities/boards/lib/sprint-draft", () => ({
  draftSprint: async (input: { open: unknown[]; board: string }) =>
    input.open.length ? { theme: "Ship It", goal: `Finish the ${input.board} cards.` } : { theme: null, goal: null },
}));

const accepts = { product: true, eo: true, ops: true, revenue: true };
const sent: { chat: string; text: string }[] = [];
const take = (chat: keyof typeof accepts) => async (message: { card: { elements: { text?: { content: string } }[] } }) => {
  sent.push({ chat, text: message.card.elements.map((e) => e.text?.content ?? "").join("\n") });
  return accepts[chat];
};
vi.mock("@/kernel/messaging/lark", () => ({ notifyProduct: take("product"), notifyEo: take("eo"), notifyOps: take("ops"), notifyMarketing: take("revenue") }));

const { GET } = await import("./weekly-sprints");

const board = (id: string, chat: string | null, client: string | null) => ({
  id,
  name: `Board ${id}`,
  slug: `board-${id}`,
  description: null,
  client_company_id: client,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: chat ? { weekly_sprints: chat } : {},
});
const card = (boardId: string) => ({ board_id: boardId, title: "Open card", priority: "p2" });
const sprint = (id: string, boardId: string, name: string, startsOn: string, endsOn: string) => ({
  id,
  board_id: boardId,
  name,
  goal: null,
  starts_on: startsOn,
  ends_on: endsOn,
  status: "active",
  sort_order: 0,
  meeting_id: null,
  focus_improvement: null,
  going_well: null,
  meeting_summary: null,
});

async function run() {
  const res = await GET(new Request("https://example.test/api/cron/weekly-sprints/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const inserted = () => calls.filter((c) => c.table === "sprints" && c.ops.includes("insert")).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  sent.length = 0;
  accepts.product = true;
  accepts.eo = true;
  accepts.ops = true;
  accepts.revenue = true;
  script("boards", { data: [board("b1", "product", "c1"), board("b2", "eo", null), board("b3", null, "c1")] });
});

describe("weekly sprints", () => {
  it("opens next week's sprint on each flagged board, by its own count, and tells each chat", async () => {
    script("sprints", { data: [sprint("s1", "b1", "Sprint 2 - Polish", "2026-09-16", "2026-09-22"), sprint("s2", "b2", "Y26 Sprint 36", "2026-09-09", "2026-09-15")] });
    script("tasks", { data: [{ board_id: "b1", title: "Fix login", priority: "p1" }] }, { data: [{ board_id: "b1", title: "Old card" }] });
    script("sprints", { data: { id: "new-1" } }, { data: { id: "new-2" } });

    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ planningDay: "2026-09-22", startsOn: "2026-09-23", endsOn: "2026-09-29", created: 2, covered: 0, posted: ["product", "eo"] });
    expect(inserted()).toEqual([
      { board_id: "b1", name: "Sprint 3 - Ship It", goal: "Finish the Board b1 cards.", starts_on: "2026-09-23", ends_on: "2026-09-29", status: "active", week: "2026-W39" },
      { board_id: "b2", name: "Y26 Sprint 37", goal: null, starts_on: "2026-09-23", ends_on: "2026-09-29", status: "active", week: "2026-W39" },
    ]);
    // The unflagged board b3 never reached the insert, and each chat heard of its own boards only.
    expect(sent.map((s) => s.chat)).toEqual(["product", "eo"]);
    expect(sent[0].text).toContain("Client One - [Board b1](https://os.example/team/boards/board-b1): **[Sprint 3 - Ship It](https://os.example/team/boards/board-b1/sprints/new-1)**");
    expect(sent[0].text).toContain("[Open sprint planning](https://os.example/team/sprint-planning)");
    expect(sent[0].text).toContain("Goal: Finish the Board b1 cards.");
    expect(sent[0].text).not.toContain("Board b2");
    expect(sent[1].text).toContain("Internal - [Board b2](https://os.example/team/boards/board-b2): **[Y26 Sprint 37](https://os.example/team/boards/board-b2/sprints/new-2)**");
    expect(sent[1].text).toContain("Wed 23 Sep to Tue 29 Sep");
  });

  it("leaves a board alone whose sprint already covers the week and says so in the notice", async () => {
    script("sprints", { data: [sprint("s1", "b1", "Sprint 2 - Two Weeks", "2026-09-16", "2026-09-30"), sprint("s2", "b2", "Y26 Sprint 36", "2026-09-09", "2026-09-15")] });
    script("tasks", { data: [] }, { data: [] });
    script("sprints", { data: { id: "new-2" } });

    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ created: 1, covered: 1 });
    expect(inserted().map((r) => r.board_id)).toEqual(["b2"]);
    expect(sent[0].text).toContain("Board b1](https://os.example/team/boards/board-b1): already planned as **Sprint 2 - Two Weeks**");
  });

  it("still opens the sprints, then fails the run naming the chat that did not take the notice", async () => {
    accepts.eo = false;
    script("sprints", { data: [] });
    script("tasks", { data: [card("b1"), card("b2")] });
    script("sprints", { data: { id: "new-1" } }, { data: { id: "new-2" } });

    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ created: 2, posted: ["product"] });
    expect(body.error).toBe("EO chat at notice: Lark did not accept the notice (LARK_EO_WEBHOOK_URL)");
    expect(body.failures).toEqual([{ subject: "EO chat", step: "notice", error: "Lark did not accept the notice (LARK_EO_WEBHOOK_URL)" }]);
    expect(inserted().map((r) => r.name)).toEqual(["Sprint 1 - Ship It", "Sprint 1 - Ship It"]);
  });

  it("reports a sprint that could not open and keeps going for the other boards", async () => {
    script("sprints", { data: [] });
    script("tasks", { data: [card("b1"), card("b2")] });
    script("sprints", { error: { message: "insert denied" } }, { data: { id: "new-2" } });

    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ created: 1, posted: ["product", "eo"] });
    expect(body.error).toBe("Board b1 at open sprint: insert denied");
    expect(body.failures).toEqual([{ subject: "Board b1", step: "open sprint", error: "insert denied" }]);
    expect(sent[0].text).toContain("no sprint opened (insert denied)");
  });

  it("skips a board with no sprint yet and no open card, and leaves it out of the notice", async () => {
    script("sprints", { data: [] });
    script("tasks", { data: [card("b1")] });
    script("sprints", { data: { id: "new-1" } });

    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ created: 1, empty: 1, posted: ["product"] });
    expect(inserted().map((r) => r.board_id)).toEqual(["b1"]);
    // The EO chat's only board was the empty one, so that chat hears nothing.
    expect(sent.map((s) => s.chat)).toEqual(["product"]);
  });

  it("does not take a failed card read for empty boards", async () => {
    script("sprints", { data: [] });
    script("tasks", { error: { message: "read failed" } });
    script("sprints", { data: { id: "new-1" } }, { data: { id: "new-2" } });

    const { body } = await run();
    expect(body).toMatchObject({ created: 2, empty: 0 });
  });

  it("tells the Revenue chat about a Revenue board, and names its webhook when Lark refuses", async () => {
    resetFake();
    accepts.revenue = false;
    script("boards", { data: [board("b4", "revenue", "c1")] });
    script("sprints", { data: [] });
    script("tasks", { data: [card("b4")] });
    script("sprints", { data: { id: "new-4" } });

    const { status, body } = await run();
    expect(sent.map((s) => s.chat)).toEqual(["revenue"]);
    expect(sent[0].text).toContain("[Board b4](https://os.example/team/boards/board-b4)");
    expect(status).toBe(500);
    expect(body.error).toContain("Revenue chat at notice");
    expect(body.error).toContain("LARK_MARKETING_WEBHOOK_URL");
  });

  it("does nothing when no board asked for weekly sprints", async () => {
    resetFake();
    script("boards", { data: [board("b3", null, "c1")] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", reason: "no board has weekly sprints switched on" });
    expect(sent).toEqual([]);
  });
});
