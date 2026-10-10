import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// Y.20. Each "subject: why" line the two sync passes collect becomes a failure,
// so a card or post that could not be written names itself and the run is an error.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const loadContentBoard = vi.hoisted(() => vi.fn());
const syncContentDays = vi.hoisted(() => vi.fn());
const syncAgentCards = vi.hoisted(() => vi.fn());
vi.mock("@/entities/campaigns/lib/revenue-board/board", () => ({ loadContentBoard }));
vi.mock("@/entities/campaigns/lib/revenue-board/sync-days", () => ({ syncContentDays }));
vi.mock("@/entities/campaigns/lib/revenue-board/sync-agents", () => ({ syncAgentCards }));

const { GET } = await import("./revenue-content-sync");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/revenue-content-sync/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  loadContentBoard.mockReset();
  loadContentBoard.mockResolvedValue({ ok: true, board: { id: "b1" } });
  syncContentDays.mockReset();
  syncContentDays.mockResolvedValue({ cardsCreated: 1, subtasksWritten: 2, moved: 0, tidied: 0, errors: [] });
  syncAgentCards.mockReset();
  syncAgentCards.mockResolvedValue({ created: 0, moved: 1, errors: [] });
});

describe("the revenue content sync", () => {
  it("is ok and keeps the passes' counters when nothing failed", async () => {
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", days: { cardsCreated: 1 }, agents: { moved: 1 }, failures: [] });
  });

  it("is skipped when no board is marked as the content board", async () => {
    loadContentBoard.mockResolvedValue({ ok: true, board: null });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", reason: "no board is marked as the content board" });
  });

  it("names the day and the campaign whose card could not be written", async () => {
    syncContentDays.mockResolvedValue({ cardsCreated: 0, subtasksWritten: 0, moved: 0, tidied: 0, errors: ["2026-10-09: insert denied"] });
    syncAgentCards.mockResolvedValue({ created: 0, moved: 0, errors: ["Autumn push: move refused"] });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("2026-10-09 at sync days: insert denied; Autumn push at sync agent cards: move refused");
  });

  it("stays a plain 500 when the board itself could not be loaded", async () => {
    loadContentBoard.mockResolvedValue({ ok: false, error: "settings unreadable" });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("settings unreadable");
  });
});
