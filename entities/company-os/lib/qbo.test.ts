import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What the weekly keepalive says about a QuickBooks refresh (Y.93).
//
// Refresh tokens rotate on every refresh, so the write that stores the new pair
// is a compare-and-set on the refresh token this run used. Before Y.93 the
// keepalive never asked how many rows that write matched: a race lost to
// another lambda read "ok" although this run's tokens were thrown away, and an
// invalid_grant caused by that same race read as a dead connection. These
// tests pin the three outcomes against the kernel fake, which answers each
// qbo_connection query in call order and keeps the write's filters.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/entities/finance", () => ({
  selectQboConnection: (columns: string) => builderFor("qbo_connection").select(columns),
  updateQboConnection: (patch: unknown) => builderFor("qbo_connection").update(patch),
  upsertQboConnection: (row: unknown) => builderFor("qbo_connection").upsert(row),
}));

import { refreshQboTokens } from "./qbo";

const stored = (refreshToken: string) => ({
  id: "edge8",
  realm_id: "realm-1",
  environment: "production",
  connected_by: "ops@example.com",
  access_token: `at-for-${refreshToken}`,
  refresh_token: refreshToken,
  access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
  refresh_token_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  updated_at: "2026-10-06T05:00:00.000Z",
});

const fetchMock = vi.fn();
const intuitAnswers = (status: number, body: Record<string, unknown>) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const rotated = { access_token: "at-new", refresh_token: "rt-new", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 };

const writes = () => calls.filter((c) => c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("refreshQboTokens", () => {
  it("stores the rotated pair against the refresh token it used, and reports ok", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: [{ id: "edge8" }] });
    intuitAnswers(200, rotated);

    expect(await refreshQboTokens("edge8")).toEqual({ ok: true });

    const sent = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("rt-old");
    const [write] = writes();
    expect(write.payloads[0]).toMatchObject({ access_token: "at-new", refresh_token: "rt-new" });
    expect(write.filters).toEqual([["eq", "id", "edge8"], ["eq", "refresh_token", "rt-old"]]);
    // Without the returning select a matched-nothing update is indistinguishable from a stored one.
    expect(write.ops).toContain("select");
  });

  it("says another refresh won when its write matched no row and the stored token moved on", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: [] }, { data: stored("rt-winner") });
    intuitAnswers(200, rotated);

    const result = await refreshQboTokens("edge8");
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.note).toMatch(/another refresh rotated the token first \(token persist matched no row\)/);
  });

  it("reports a failure when its write matched no row and nobody else rotated", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: [] }, { data: stored("rt-old") });
    intuitAnswers(200, rotated);

    expect(await refreshQboTokens("edge8")).toEqual({ ok: false, error: "token persist matched no row" });
  });

  it("does not call invalid_grant a failure when another refresh already rotated the token", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: stored("rt-winner") });
    intuitAnswers(400, { error: "invalid_grant" });

    const result = await refreshQboTokens("edge8");
    expect(result).toMatchObject({ ok: true, note: expect.stringContaining("invalid_grant") });
    expect(writes()).toHaveLength(0);
  });

  it("reports invalid_grant when the stored token is still the one Intuit refused", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: stored("rt-old") });
    intuitAnswers(400, { error: "invalid_grant" });

    expect(await refreshQboTokens("edge8")).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("names a failed read instead of reporting the company as not connected", async () => {
    script("qbo_connection", { error: { message: "connection reset" } });

    expect(await refreshQboTokens("edge8")).toEqual({ ok: false, error: "connection read failed: connection reset" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the failure when the re-read after a lost race fails too", async () => {
    script("qbo_connection", { data: stored("rt-old") }, { data: [] }, { error: { message: "timeout" } });
    intuitAnswers(200, rotated);

    expect(await refreshQboTokens("edge8")).toEqual({
      ok: false,
      error: "token persist matched no row; re-read failed: timeout",
    });
  });
});
