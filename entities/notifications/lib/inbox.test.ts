import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AC.15, ADR 0013. The inbox is asked again when it is read: a row whose link
// the viewer may not open is not shown, a row whose link no page declares is
// not shown (closed by default), and a row that links nowhere stays.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const recipients = vi.hoisted(() => new Map<string, string[]>());
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => {
    const held = recipients.get(personId);
    return held ? { roles: [], permissions: () => held, may: (p: string) => held.includes(p) } : null;
  }),
}));

import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { inboxFor, markAllRead } from "./inbox";

registerPermissionRegistry({
  atoms: {},
  routes: {
    "/team/boards/[slug]": "surface.team",
    "/team/revenue/deals/[id]": "crm.pipeline",
    "/admin/revenue/deals/[id]": "crm.pipeline",
  },
  actions: {},
  implies: {},
  roles: {},
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: "card.completed",
  title: `Row ${id}`,
  body: null,
  admin_href: null,
  team_href: "/team/boards/a",
  created_at: "2026-10-06T00:00:00Z",
  ...over,
});

beforeEach(() => {
  resetFake();
  recipients.clear();
});

describe("inboxFor (AC.15)", () => {
  it("shows a row whose link the viewer may open", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1")] });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.unread.map((i) => i.id)).toEqual(["n1"]);
    expect(inbox.unread[0].href).toBe("/team/boards/a");
  });

  it("hides a row whose link the viewer may not open, and keeps the rest", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", {
      data: [row("n1"), row("n2", { team_href: "/team/revenue/deals/d1" })],
    });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.unread.map((i) => i.id)).toEqual(["n1"]);
  });

  it("hides a row whose link no page declares", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1", { team_href: "/team/somewhere/undeclared" })] });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.unread).toEqual([]);
  });

  it("keeps a row that links nowhere on this surface", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1", { team_href: null, admin_href: "/admin/revenue/deals/d1" })] });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.unread.map((i) => i.id)).toEqual(["n1"]);
    expect(inbox.unread[0].href).toBeNull();
  });

  it("filters the read rows the same way", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1"), row("n2", { team_href: "/team/revenue/deals/d1" })] });
    script("notification_reads", {
      data: [
        { notification_id: "n1", read_at: new Date().toISOString() },
        { notification_id: "n2", read_at: new Date().toISOString() },
      ],
    });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.read.map((i) => i.id)).toEqual(["n1"]);
  });
});

describe("markAllRead (AC.15)", () => {
  it("marks the rows the page hides as read too, so they do not keep a count up", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1"), row("n2", { team_href: "/team/revenue/deals/d1" })] });
    script("notification_reads", { data: [] });
    script("notifications", { data: [{ id: "n1" }, { id: "n2" }] });
    script("notification_reads", { error: null });
    await markAllRead("rowan");
    const upsert = calls.find((c) => c.table === "notification_reads" && c.ops.includes("upsert"));
    expect(upsert?.payloads.flat().map((p) => (p as { notification_id: string }).notification_id)).toEqual(["n1", "n2"]);
  });
});
