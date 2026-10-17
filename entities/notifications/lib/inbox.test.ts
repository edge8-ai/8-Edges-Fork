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
import { inboxFor, markAllRead, markDone, prefsFor, setMuted, undoDone } from "./inbox";

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
    expect(inbox.happened.map((i) => i.id)).toEqual(["n1"]);
    expect(inbox.happened[0].href).toBe("/team/boards/a");
  });

  it("hides a row whose link the viewer may not open, and keeps the rest", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", {
      data: [row("n1"), row("n2", { team_href: "/team/revenue/deals/d1" })],
    });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.happened.map((i) => i.id)).toEqual(["n1"]);
  });

  it("hides a row whose link no page declares", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1", { team_href: "/team/somewhere/undeclared" })] });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.happened).toEqual([]);
  });

  it("keeps a row that links nowhere on this surface", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1", { team_href: null, admin_href: "/admin/revenue/deals/d1" })] });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.happened.map((i) => i.id)).toEqual(["n1"]);
    expect(inbox.happened[0].href).toBeNull();
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
    expect(inbox.happened.map((i) => i.id)).toEqual(["n1"]);
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

// TH.2: "Needs you" is a to-do list. Read is not done.
describe("needs and happened (TH.2)", () => {
  it("keeps a request on Needs you after it is read, until it is done", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", { data: [row("n1", { kind: "card.assigned" }), row("n2", { kind: "card.mentioned" })] });
    script("notification_reads", { data: [{ notification_id: "n1", read_at: new Date().toISOString(), done_at: null }] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.needs.map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(inbox.happened).toEqual([]);
  });

  it("moves a done request to what happened", async () => {
    recipients.set("rowan", ["surface.team"]);
    const at = new Date().toISOString();
    script("notifications", { data: [row("n1", { kind: "card.assigned", subject: "card:11111111-2222-3333-4444-555555555555" })] });
    script("notification_reads", { data: [{ notification_id: "n1", read_at: at, done_at: at }] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.needs).toEqual([]);
    expect(inbox.happened.map((i) => [i.id, i.doneAt, i.subject])).toEqual([["n1", at, "card:11111111-2222-3333-4444-555555555555"]]);
  });

  it("leaves a request done more than thirty days ago out", async () => {
    recipients.set("rowan", ["surface.team"]);
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    script("notifications", { data: [row("n1", { kind: "card.due_tomorrow" })] });
    script("notification_reads", { data: [{ notification_id: "n1", read_at: old, done_at: old }] });
    const inbox = await inboxFor("rowan", "team");
    expect(inbox.needs).toEqual([]);
    expect(inbox.happened).toEqual([]);
  });
});

describe("markDone and undoDone (TH.2)", () => {
  it("marks only the person's own rows done, which reads them too", async () => {
    script("notifications", { data: [{ id: "n1" }] });
    script("notification_reads", { error: null });
    await markDone("rowan", ["n1", "someone-elses"]);
    const upsert = calls.find((c) => c.table === "notification_reads" && c.ops.includes("upsert"));
    const rows = upsert?.payloads.flat() as { notification_id: string; person_id: string; done_at: string }[];
    expect(rows.map((r) => [r.notification_id, r.person_id])).toEqual([["n1", "rowan"]]);
    expect(rows[0].done_at).toBeTruthy();
  });

  it("undo clears done on the person's own rows", async () => {
    script("notification_reads", { error: null });
    await undoDone("rowan", ["n1"]);
    const update = calls.find((c) => c.table === "notification_reads" && c.ops.includes("update"));
    expect(update?.payloads.flat()).toEqual([{ done_at: null }]);
  });
});

describe("always-on kinds (TH.2)", () => {
  it("lists assignments and @mentions as always on, and never muted", async () => {
    script("notification_prefs", { data: [{ kind: "card.assigned", muted: true }, { kind: "card.commented", muted: true }] });
    const prefs = await prefsFor("rowan");
    const byKind = new Map(prefs.map((p) => [p.kind, p]));
    expect(byKind.get("card.assigned")).toMatchObject({ alwaysOn: true, muted: false });
    expect(byKind.get("card.mentioned")).toMatchObject({ alwaysOn: true, muted: false });
    expect(byKind.get("card.commented")).toMatchObject({ alwaysOn: false, muted: true });
  });

  it("refuses to mute an always-on kind", async () => {
    await expect(setMuted("rowan", "card.mentioned", true)).rejects.toThrow(/always reach/);
  });
});

describe("who acted (TH.2.8)", () => {
  it("names the person behind a row with their photo, and no one behind a row nobody raised", async () => {
    recipients.set("rowan", ["surface.team"]);
    script("notifications", {
      data: [
        row("n1", { actor: { display_name: "Derek Nguyen", preferred_name: null, full_name: null, email: "d@example.com", avatar_url: "https://img.example/d.jpg" } }),
        row("n2", { actor: null }),
      ],
    });
    script("notification_reads", { data: [] });
    const inbox = await inboxFor("rowan", "team", new Date("2026-10-06T01:00:00Z"));
    expect(inbox.happened.map((i) => i.actor)).toEqual([{ name: "Derek Nguyen", avatarUrl: "https://img.example/d.jpg" }, null]);
  });
});

