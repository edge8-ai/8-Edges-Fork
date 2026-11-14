import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The nightly key-result sync (Y.22): a key result that could not be read,
// written or logged is a failure the run names, and so is a change notice
// Lark did not take. The result rows stay in the body as before.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
// notify() is stubbed; failureOf stays real (Z.7).
type Notified = { status: "queued"; until: string } | { status: "failed"; error: string };
const notifyOps = vi.hoisted(() => vi.fn(async (_input: unknown): Promise<Notified> => ({ status: "queued", until: "2026-10-12T01:30:00.000Z" })));
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify: notifyOps,
}));
vi.mock("@/entities/company-os", () => ({
  loadAgentManagement: () => ({ vercel: [{ cron: "0 0 * * *" }], routines: [1, 2, 3], macMini: [] }),
}));

import { GET } from "./kr-agent-sync";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/kr-agent-sync/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  resetFake();
  notifyOps.mockReset();
  notifyOps.mockResolvedValue({ status: "queued", until: "2026-10-12T01:30:00.000Z" });
});

describe("the key result sync cron", () => {
  it("is an ok run when the value was written and logged, and tells Operations it moved", async () => {
    script("key_results", { data: { id: "kr", current_value: 2 } }, { error: null });
    script("kr_logs", { error: null });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", updated: 1, failed: 0, moved: 1, failures: [] } });
    expect(notifyOps).toHaveBeenCalledTimes(1);
    // News that can wait: the Operations chat's morning digest, not a 06:00 post (Z.7).
    expect(notifyOps.mock.calls[0][0]).toMatchObject({ kind: "ops.digest", to: { chat: "ops" } });
  });

  it("is an error that names the key result when it cannot be found", async () => {
    script("key_results", { data: null });
    expect(await run()).toMatchObject({ status: 500, body: { error: "workflows built at find key result: key result not found", failed: 1 } });
  });

  it("is an error that names the key result when the write is refused", async () => {
    script("key_results", { data: { id: "kr", current_value: 2 } }, { error: { message: "write refused" } });
    expect(await run()).toMatchObject({ status: 500, body: { error: "workflows built at update key result: write refused" } });
  });

  it("is an error that names the key result when its log row is not written", async () => {
    script("key_results", { data: { id: "kr", current_value: 2 } }, { error: null });
    script("kr_logs", { error: { message: "log refused" } });
    expect(await run()).toMatchObject({ status: 500, body: { error: "workflows built at write kr_logs row: log refused" } });
  });

  it("is an error that names the change notice when Lark did not take it", async () => {
    notifyOps.mockResolvedValue({ status: "failed", error: "Lark did not accept the notice (LARK_OPS_WEBHOOK_URL)" });
    script("key_results", { data: { id: "kr", current_value: 2 } }, { error: null });
    script("kr_logs", { error: null });
    expect(await run()).toMatchObject({ status: 500, body: { error: "key result change notice at tell Operations: Lark did not accept the notice (LARK_OPS_WEBHOOK_URL)" } });
  });
});
