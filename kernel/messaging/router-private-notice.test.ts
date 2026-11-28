import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeNoticeSupabase, resetNoticeDb } from "./testing/notice-db";

// AK.5: an ask notice is private to the person it is for (ADR 0020), so its DM
// leaves no row on the CRM timeline, whether it goes at once or is held to the
// morning. Every other kind logs as before.
vi.mock("@/kernel/data/supabase", () => fakeNoticeSupabase());
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => "person-1" }));
const dm = vi.hoisted(() => vi.fn(async (_to: string, _message: unknown, _opts?: unknown) => ({ ok: true as const })));
vi.mock("./lark-api", () => ({ deliverLarkDm: dm }));

const { notify, deliverNotice } = await import("./router");

const WORKING = new Date("2026-10-14T03:00:00Z");
const to = { person: "ana@example.test" };

beforeEach(() => {
  resetNoticeDb();
  dm.mockClear();
});

describe("a private notice", () => {
  it("keeps an ask DM off the CRM timeline when it goes at once", async () => {
    await notify({ kind: "quests.ask", to, message: "hello", dedupeKey: "test:ask:1" }, WORKING);
    expect(dm).toHaveBeenCalledWith("ana@example.test", "hello", { category: undefined, crmLog: false });
  });

  it("keeps it off when the queue delivers it later, from the kind the row stored", async () => {
    await deliverNotice(to, "hello", undefined, "quests.ask");
    expect(dm).toHaveBeenCalledWith("ana@example.test", "hello", { category: undefined, crmLog: false });
  });

  it("logs every other kind as before", async () => {
    await notify({ kind: "boards.card-assigned", to, message: "hello", dedupeKey: "test:card:1" }, WORKING);
    expect(dm).toHaveBeenCalledWith("ana@example.test", "hello", { category: undefined });
    await deliverNotice(to, "hello");
    expect(dm).toHaveBeenLastCalledWith("ana@example.test", "hello", { category: undefined });
  });
});
