import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PnlLine } from "@/entities/finance";

const { fetchQboPnl, pnlLinesSince, mirrorPnlLines } = vi.hoisted(() => ({
  fetchQboPnl: vi.fn(),
  pnlLinesSince: vi.fn(),
  mirrorPnlLines: vi.fn(),
}));
vi.mock("@/entities/company-os/lib/qbo-pnl", () => ({ fetchQboPnl }));
vi.mock("@/entities/finance", () => ({ pnlLinesSince, mirrorPnlLines }));
vi.mock("@/kernel/config/dates", () => ({ saigonToday: () => "2026-02-15" }));

import { syncQboPnl } from "./qbo-pnl-sync";

const line = (month: string, externalId: string, amountCents: number): PnlLine => ({
  month,
  section: "expense",
  externalId,
  parentExternalId: null,
  accountName: `Account ${externalId}`,
  position: Number(externalId),
  amountCents,
});

beforeEach(() => {
  vi.clearAllMocks();
  mirrorPnlLines.mockResolvedValue({ ok: true });
});

describe("syncQboPnl", () => {
  it("writes every line of the report, keyed for the upsert", async () => {
    fetchQboPnl.mockResolvedValue({ ok: true, currency: "USD", lines: [line("2026-01-01", "1", 100), line("2026-02-01", "1", 200)] });
    pnlLinesSince.mockResolvedValue([]);
    const r = await syncQboPnl("edge8");
    expect(r).toMatchObject({ ok: true, months: 2, accounts: 1, upserted: 2, zeroed: 0 });
    expect(fetchQboPnl).toHaveBeenCalledWith("edge8", "2024-01-01", "2026-02-15");
    expect(mirrorPnlLines.mock.calls[0][0][0]).toMatchObject({ entity: "edge8", month: "2026-01-01", external_id: "1", amount_cents: 100, currency: "USD", source: "quickbooks" });
  });

  it("zeroes an account the report dropped, only in the months the report covers", async () => {
    fetchQboPnl.mockResolvedValue({ ok: true, currency: "USD", lines: [line("2026-01-01", "1", 100), line("2026-02-01", "1", 200)] });
    pnlLinesSince.mockResolvedValue([line("2026-01-01", "2", 500), line("2026-02-01", "2", 0), line("2025-12-01", "2", 700)]);
    const r = await syncQboPnl("edge8");
    expect(r.zeroed).toBe(1);
    const zeroed = mirrorPnlLines.mock.calls[0][0].filter((row: { external_id: string }) => row.external_id === "2");
    expect(zeroed).toEqual([expect.objectContaining({ month: "2026-01-01", amount_cents: 0 })]);
  });

  it("writes nothing when QuickBooks or the stored read fails", async () => {
    fetchQboPnl.mockResolvedValue({ ok: false, error: "QBO 401" });
    expect(await syncQboPnl("edge8")).toMatchObject({ ok: false, error: "QBO 401" });
    fetchQboPnl.mockResolvedValue({ ok: true, currency: "USD", lines: [] });
    pnlLinesSince.mockRejectedValue(new Error("read failed"));
    expect(await syncQboPnl("edge8")).toMatchObject({ ok: false, error: "read failed" });
    expect(mirrorPnlLines).not.toHaveBeenCalled();
  });
});
