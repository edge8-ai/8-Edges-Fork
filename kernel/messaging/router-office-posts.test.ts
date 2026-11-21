import { afterEach, describe, expect, it, vi } from "vitest";

// Which notices still reach an office chat (the Lark notifications plan,
// 2026-11-18): a kind marked officePost goes out kept, any other chat notice
// goes without keep (so kernel/messaging/lark.ts holds it), and a system alert
// goes to the watchers by direct message instead of a chat.
const calls = vi.hoisted(() => ({ chat: [] as unknown[][], alert: [] as unknown[] }));
vi.mock("./lark", () => ({
  LARK_CHATS: {},
  postToChat: async (...args: unknown[]) => {
    calls.chat.push(args);
    return { ok: true };
  },
}));
vi.mock("./system-alert", () => ({
  alertSystem: async (message: unknown) => {
    calls.alert.push(message);
    return { ok: true };
  },
}));
vi.mock("./lark-api", () => ({ deliverLarkDm: async () => ({ ok: true }) }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

import { deliverNotice } from "./router";

describe("deliverNotice to an office chat", () => {
  afterEach(() => {
    calls.chat = [];
    calls.alert = [];
  });

  it("sends a morning list kept", async () => {
    await deliverNotice({ chat: "revenue" }, "list", undefined, "office.morning-list");
    expect(calls.chat).toEqual([["revenue", "list", { keep: true }]]);
  });

  it("sends any other chat notice without keep, so it is held", async () => {
    await deliverNotice({ chat: "revenue" }, "pulse", "marketing", "revenue.weekly-pulse");
    expect(calls.chat).toEqual([["revenue", "pulse", { category: "marketing" }]]);
  });

  it("sends a system alert to the watchers, never the chat", async () => {
    await deliverNotice({ chat: "ops" }, "Sync failed", undefined, "ops.alert");
    expect(calls.chat).toEqual([]);
    expect(calls.alert).toEqual(["Sync failed"]);
  });
});
