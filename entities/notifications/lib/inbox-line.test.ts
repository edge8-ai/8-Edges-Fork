import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { inboxLine } from "./inbox";

// W.169.4. The one-line teaser another page carries: counted, not listed, and
// tolerant — a failure hides the line instead of breaking the page it sits on.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// AC.15: the sentence names only a row the viewer may open.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: vi.fn(async () => (href: string | null | undefined) => Boolean(href) && !cannotOpen.has(href as string)),
}));

beforeEach(() => {
  resetFake();
  cannotOpen.clear();
});

describe("inboxLine", () => {
  it("counts unread as the person's rows minus the ones they read, and names the newest unread", async () => {
    script(
      "notifications",
      { count: 5 },
      {
        data: [
          { id: "n3", title: "Newest, already read", team_href: "/team/boards/a" },
          { id: "n2", title: "“Deck” was finished", team_href: "/team/boards/a" },
        ],
      },
    );
    script("notification_reads", { count: 3 }, { data: [{ notification_id: "n3" }] });
    expect(await inboxLine("p1")).toEqual({ unread: 2, latest: "“Deck” was finished" });
    expect(calls.find((c) => c.table === "notifications")?.filters).toContainEqual(["eq", "person_id", "p1"]);
    expect(calls.find((c) => c.table === "notification_reads")?.filters).toContainEqual(["eq", "person_id", "p1"]);
  });

  it("does not name a row whose page the viewer may not open, but names the next one (AC.15)", async () => {
    script(
      "notifications",
      { count: 2 },
      {
        data: [
          { id: "n2", title: "Hidden deal", team_href: "/team/revenue/deals/d1" },
          { id: "n1", title: "A card you can open", team_href: "/team/boards/a" },
        ],
      },
    );
    script("notification_reads", { count: 0 }, { data: [] });
    cannotOpen.add("/team/revenue/deals/d1");
    expect(await inboxLine("p1")).toEqual({ unread: 2, latest: "A card you can open" });
  });

  it("reads no rows when nothing is unread", async () => {
    script("notifications", { count: 2 });
    script("notification_reads", { count: 2 });
    expect(await inboxLine("p1")).toEqual({ unread: 0, latest: null });
    expect(calls).toHaveLength(2);
  });

  it("answers null when a count fails, so the line hides rather than the page breaking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    script("notifications", { error: { message: "timeout" } });
    script("notification_reads", { count: 0 });
    expect(await inboxLine("p1")).toBeNull();
  });
});
