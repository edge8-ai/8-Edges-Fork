import { beforeEach, describe, expect, it, vi } from "vitest";

// The weekly QuickBooks invoice mirror (Y.22): a company whose sync hit a real
// error is a failure the run names; a company that is simply not connected is not.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const sync = vi.hoisted(() => vi.fn());
vi.mock("@/entities/company-os/lib/qbo-invoice-sync", () => ({ syncQboInvoices: sync }));
// notify() is stubbed; failureOf stays real (Z.7).
type Notified = { status: "sent" } | { status: "failed"; error: string };
const notifyOps = vi.hoisted(() => vi.fn(async (): Promise<Notified> => ({ status: "sent" })));
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify: notifyOps,
}));

import { GET } from "./qbo-invoice-sync";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/qbo-invoice-sync/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  sync.mockReset();
  notifyOps.mockReset();
  notifyOps.mockResolvedValue({ status: "sent" });
});

describe("the QuickBooks invoice sync cron", () => {
  // Both companies; the sync itself refuses a company linked to the other's
  // books (qbo-invoice-sync.test.ts in lib), so the cron no longer leaves AIO out.
  it("syncs Edge8 and AIO", async () => {
    sync.mockImplementation(async (entity: string) => ({ ok: true, entity }));
    await run();
    expect(sync.mock.calls.map((c) => c[0])).toEqual(["edge8", "aio"]);
  });

  it("is an ok run when every company synced", async () => {
    sync.mockImplementation(async (entity: string) => ({ ok: true, entity }));
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", failures: [] } });
  });

  it("does not fail for a company that is not connected", async () => {
    sync.mockImplementation(async (entity: string) => ({ ok: false, entity, error: "QuickBooks is not connected" }));
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", failures: [] } });
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("is an error that names the company whose sync failed, and still warns Operations", async () => {
    sync.mockImplementation(async (entity: string) =>
      entity === "edge8" ? { ok: false, entity, error: "QBO 500" } : { ok: true, entity },
    );
    expect(await run()).toMatchObject({ status: 500, body: { error: "edge8 at invoice sync: QBO 500" } });
    expect(notifyOps).toHaveBeenCalledTimes(1);
  });

  it("names a warning Lark refused beside the sync failure", async () => {
    sync.mockImplementation(async (entity: string) =>
      entity === "edge8" ? { ok: false, entity, error: "QBO 500" } : { ok: true, entity },
    );
    notifyOps.mockResolvedValue({ status: "failed", error: "code 9499 bad request" });
    expect(await run()).toMatchObject({ status: 500, body: { error: "edge8 at invoice sync: QBO 500; edge8 at warn Operations: code 9499 bad request" } });
  });
});
