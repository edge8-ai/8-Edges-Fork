import { beforeEach, describe, expect, it, vi } from "vitest";

// The weekly QuickBooks token keepalive (Y.22): a connected company whose refresh
// failed is a failure the run names; an unconnected company is a normal state.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const status = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/entities/company-os/lib/qbo", () => ({ getQboConnectionStatus: status, refreshQboTokens: refresh }));
// The router is stubbed at notify() only; failureOf stays real, so the test
// proves a refused warning becomes the run's failure (Z.7).
type Notified = { status: "sent" } | { status: "failed"; error: string };
const notify = vi.hoisted(() => vi.fn(async (): Promise<Notified> => ({ status: "sent" })));
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify,
}));

import { GET } from "./qbo-refresh";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/qbo-refresh/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const farFuture = new Date(Date.now() + 90 * 86_400_000).toISOString();

beforeEach(() => {
  status.mockReset();
  refresh.mockReset();
  notify.mockReset();
  notify.mockResolvedValue({ status: "sent" });
});

describe("the QuickBooks token refresh cron", () => {
  it("is an ok run when every connected company refreshed, and ignores one that is not connected", async () => {
    status.mockImplementation(async (entity: string) =>
      entity === "aio" ? { connected: false } : { connected: true, refreshTokenExpiresAt: farFuture },
    );
    refresh.mockResolvedValue({ ok: true });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", failures: [] } });
  });

  it("is an error that names the company whose refresh failed", async () => {
    status.mockResolvedValue({ connected: true, refreshTokenExpiresAt: farFuture });
    refresh.mockImplementation(async (entity: string) => (entity === "edge8" ? { ok: false, error: "invalid_grant" } : { ok: true }));
    expect(await run()).toMatchObject({ status: 500, body: { error: "edge8 at token refresh: invalid_grant" } });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toMatchObject([{ kind: "ops.alert", to: { chat: "ops" }, dedupeKey: expect.stringMatching(/^company-os:qbo-refresh-failed:edge8:\d{4}-\d{2}-\d{2}$/) }]);
  });

  it("fails the run when Lark refuses the near-expiry warning, which used to read ok", async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    status.mockImplementation(async (entity: string) =>
      entity === "aio" ? { connected: false } : { connected: true, refreshTokenExpiresAt: soon },
    );
    refresh.mockResolvedValue({ ok: true });
    notify.mockResolvedValue({ status: "failed", error: "code 19021 sign match fail" });
    expect(await run()).toMatchObject({ status: 500, body: { error: "edge8 at warn Operations: code 19021 sign match fail" } });
  });
});
