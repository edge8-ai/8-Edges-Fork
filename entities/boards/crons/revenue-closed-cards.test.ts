import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What the Revenue chat's daily post promises: the cards closed in the last day
// on the boards that report to the Revenue chat, and only those boards, each
// title linking to its card; nothing on a quiet day; and a run that goes red,
// rather than quietly posting nothing, when the cards could not be read or
// Lark would not take the post.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://os.example" }));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-09-24",
}));

// notify() is stubbed and records what the routine asked of it; failureOf stays
// real, so a failed notice fails the step the way it does in production (Z.7.1).
// When the router holds the post is the router's own test (router.test.ts).
let accepts = true;
const sent: { header: string; text: string; kind: string; dedupeKey: string }[] = [];
type CardMessage = { card: { header: { title: { content: string } }; elements: { text?: { content: string } }[] } };
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify: async (input: { kind: string; to: { chat: string }; message: CardMessage; dedupeKey: string }) => {
    expect(input.to).toEqual({ chat: "revenue" });
    sent.push({
      header: input.message.card.header.title.content,
      text: input.message.card.elements.map((e) => e.text?.content ?? "").join("\n"),
      kind: input.kind,
      dedupeKey: input.dedupeKey,
    });
    return accepts ? { status: "held", until: "2026-09-25T01:30:00.000Z" } : { status: "failed", error: "LARK_MARKETING_WEBHOOK_URL is not set" };
  },
}));

const { GET } = await import("./revenue-closed-cards");

const board = (id: string, chat: string | null) => ({
  id,
  name: `Board ${id}`,
  slug: `board-${id}`,
  description: null,
  client_company_id: "c1",
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: chat ? { weekly_sprints: chat } : {},
});

async function run() {
  const res = await GET(new Request("https://example.test/api/cron/revenue-closed-cards/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetFake();
  sent.length = 0;
  accepts = true;
  script("boards", { data: [board("r1", "revenue"), board("p1", "product"), board("x1", null)] });
  // No earlier run: the window is the last 24 hours (the R.22 cases below
  // script their own history).
  script("routine_runs", { data: [] });
});

describe("the Revenue chat's closed cards", () => {
  it("posts the day's closed cards on the Revenue boards, each linking to its card", async () => {
    script("tasks", { data: [{ id: "aaaaaaaa-1111", board_id: "r1", title: "Send the Q4 proposal" }, { id: "bbbbbbbb-2222", board_id: "r1", title: "Publish the webinar recap" }] });

    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ closed: 2, posted: true, notice: "held" });
    expect(sent).toHaveLength(1);
    // A quiet-hours kind, keyed by the window's start, so one window posts once.
    expect(sent[0].kind).toBe("revenue.closed-cards");
    expect(sent[0].dedupeKey).toBe(`boards:revenue-closed-cards:${body.since as string}`);
    expect(sent[0].header).toBe("Cards closed · Thu 24 Sep · 2 in the last day");
    expect(sent[0].text).toContain("**[Board r1](https://os.example/team/boards/board-r1)** · 2 closed");
    expect(sent[0].text).toMatch(/• \[Send the Q4 proposal\]\(https:\/\/os\.example\/team\/boards\/board-r1\?card=send-the-q4-proposal-[a-z0-9]+\)/);
    // Only the Revenue board's cards were asked for: never the product or unflagged board's.
    const read = calls.find((c) => c.table === "tasks");
    expect(read?.filters).toContainEqual(["in", "board_id", ["r1"]]);
  });

  it("posts nothing on a day nothing closed", async () => {
    script("tasks", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ closed: 0, posted: false });
    expect(sent).toEqual([]);
  });

  it("fails the run on a failed card read instead of reading it as a quiet day", async () => {
    script("tasks", { error: { message: "read failed" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("read failed");
    expect(sent).toEqual([]);
  });

  it("fails the run naming the webhook when Lark refuses the post", async () => {
    accepts = false;
    script("tasks", { data: [{ id: "cccccccc-3333", board_id: "r1", title: "Book the launch call" }] });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("Revenue chat at post");
    expect(body.error).toContain("LARK_MARKETING_WEBHOOK_URL");
    expect(body.failures).toEqual([expect.objectContaining({ subject: "Revenue chat", step: "post" })]);
    expect(body).toMatchObject({ posted: false, notice: "failed" });
  });

  it("does nothing when no board reports to the Revenue chat", async () => {
    resetFake();
    script("boards", { data: [board("p1", "product")] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", reason: "no board reports to the Revenue chat" });
    expect(sent).toEqual([]);
  });
});

// R.22: the window starts where the last good run ended, not a fixed 24 hours
// back, so a missed or late run no longer drops the cards closed while it was
// not running. The clock is pinned so each bound can be asserted exactly.
describe("the window the Revenue chat's post covers", () => {
  const NOW = "2026-09-24T11:00:00.000Z";
  const at = (hoursAgo: number) => new Date(Date.parse(NOW) - hoursAgo * 3_600_000).toISOString();
  const cardsRead = () => calls.find((c) => c.table === "tasks")?.filters ?? [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    resetFake();
    script("boards", { data: [board("r1", "revenue")] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the last ok run's until and records its own until as the read's upper bound", async () => {
    script("routine_runs", { data: [{ result: { since: at(96), until: at(72), closed: 3, posted: true } }] });
    script("tasks", { data: [{ id: "dddddddd-4444", board_id: "r1", title: "Close the pilot" }] });

    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ since: at(72), until: NOW, closed: 1, posted: true });
    expect(cardsRead()).toContainEqual(["gte", "completed_at", at(72)]);
    expect(cardsRead()).toContainEqual(["lt", "completed_at", NOW]);
    // Only this routine's successful runs decide where the window starts.
    const history = calls.find((c) => c.table === "routine_runs")?.filters ?? [];
    expect(history).toContainEqual(["eq", "routine_id", "/api/cron/revenue-closed-cards/"]);
    expect(history).toContainEqual(["eq", "status", "ok"]);
  });

  it("records until on a quiet day too, so the next run starts from it", async () => {
    script("routine_runs", { data: [{ result: { until: at(24) } }] });
    script("tasks", { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ since: at(24), until: NOW, closed: 0, posted: false });
  });

  it("looks back 24 hours when no earlier run recorded an until", async () => {
    script("routine_runs", { data: [{ result: { since: at(48), closed: 0, posted: false } }] });
    script("tasks", { data: [] });
    const { body } = await run();
    expect(body.since).toBe(at(24));
  });

  it("never looks back more than a week after a long outage", async () => {
    script("routine_runs", { data: [{ result: { until: at(24 * 30) } }] });
    script("tasks", { data: [] });
    const { body } = await run();
    expect(body.since).toBe(at(24 * 7));
    expect(cardsRead()).toContainEqual(["gte", "completed_at", at(24 * 7)]);
  });

  it("falls back to the last 24 hours, and still posts, when the run history cannot be read", async () => {
    script("routine_runs", { error: { message: "routine_runs unavailable" } });
    script("tasks", { data: [{ id: "eeeeeeee-5555", board_id: "r1", title: "Send the renewal" }] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ since: at(24), until: NOW, posted: true });
    expect(sent).toHaveLength(1);
  });
});
