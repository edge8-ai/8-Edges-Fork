import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetFakes } from "../lib/client-status/testing/fakes";

// Z.15.2, moved to the report table with Z.12 (spec §12 test 15), and since
// Z.12.1 without an approval: every active client has last Friday's report as a
// ready draft on its Weekly status page.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/audit/routine-runs", async () => (await import("../lib/client-status/testing/fakes")).routineRunsFake);
vi.mock("@/kernel/messaging/lark", async () => (await import("../lib/client-status/testing/fakes")).larkFake);
vi.mock("../lib/client-status/store", async () => (await import("../lib/client-status/testing/fakes")).storeFake);
vi.mock("../lib/active-clients", async () => (await import("../lib/client-status/testing/fakes")).activeClientsFake);

const { clientStatusReports, lastStatusWeek } = await import("./client-status-check");
const { storeFake } = await import("../lib/client-status/testing/fakes");

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-09T05:00:00Z");

beforeEach(() => {
  resetFakes();
  db.clients.set(A, { company: "Acme Foods", programIds: ["p-a"] });
});

describe("lastStatusWeek", () => {
  it("is this Friday's week two hours after the opener, last Friday's before", () => {
    expect(lastStatusWeek(new Date("2026-10-09T05:00:00Z"))).toBe("2026-W41");
    expect(lastStatusWeek(new Date("2026-10-09T04:30:00Z"))).toBe("2026-W40");
    expect(lastStatusWeek(new Date("2026-10-12T02:00:00Z"))).toBe("2026-W41");
  });
});

describe("Z.15.2", () => {
  it("passes a client whose report is a ready draft, with no approval anywhere", async () => {
    await storeFake.openReports([A], "2026-W41");
    Object.assign(db.reports[0], { step: "ready", version: "abcdefabcdef", bodyHtml: "<div></div>" });
    expect(await clientStatusReports().check(NOW)).toMatchObject({ ok: true, detail: expect.stringContaining("ready draft") });
  });

  it("fails a client with no report", async () => {
    db.clients.set(B, { company: "Northwind Retail", programIds: ["p-b"] });
    await storeFake.openReports([A], "2026-W41");
    Object.assign(db.reports[0], { step: "ready", version: "v", bodyHtml: "x" });
    const r = await clientStatusReports().check(NOW);
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining("Northwind Retail: no report") });
  });

  it("fails a report stopped without a plain report, and one still being written", async () => {
    await storeFake.openReports([A], "2026-W41");
    Object.assign(db.reports[0], { step: "stopped", error: "Stopped after 3 failed attempts" });
    expect(await clientStatusReports().check(NOW)).toMatchObject({ ok: false, detail: expect.stringContaining("stopped") });
    Object.assign(db.reports[0], { step: "check", error: null });
    expect(await clientStatusReports().check(NOW)).toMatchObject({ ok: false, detail: expect.stringContaining("still at check") });
  });
});
