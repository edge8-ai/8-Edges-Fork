import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.1. Boards answers the global search with cards. An admin finds any card on
// a live board. A team member finds cards only on the boards their Workboard
// shows them (memberBoardIds, the rule isBoardMember applies one board at a
// time), and a team member who is also an admin sees every board, as on
// /team/workboard. A subtask opens its parent's drawer, because the board's
// ?card= link names top-level cards.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const memberBoardIds = vi.fn<(personId: string, teamMemberId: string) => Promise<string[]>>();
vi.mock("@/entities/boards/lib/access", () => ({ memberBoardIds: (p: string, t: string) => memberBoardIds(p, t) }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { cardSlug } from "@/kernel/config/slug";
import { searchContributions } from "./search";

const [cards] = searchContributions;
const everything = { may: () => true };
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: everything };
const team = (over: Partial<TeamActor> = {}): SearchActor => ({
  surface: "team",
  team: { personId: "p1", teamMemberId: "tm1", isAdmin: false, permissions: [], ...over } as TeamActor,
  access: everything,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-2222-3333-4444-555555555555",
  title: "S.1 Global search",
  parent_task_id: null,
  parent: null,
  boards: { slug: "eight-edges", name: "8 Edges" },
  ...over,
});

beforeEach(() => {
  resetFake();
  memberBoardIds.mockReset();
});

describe("boards' search contribution", () => {
  it("offers cards on both surfaces, by the board page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["card", { admin: "/admin/boards/[slug]", team: "/team/boards/[slug]" }],
    ]);
  });

  it("opens a card in its board's drawer on the admin surface, every term matching the title", async () => {
    script("tasks", { data: [row()] });
    const hits = await cards.search(ADMIN, ["global", "search"], 5);
    const id = "11111111-2222-3333-4444-555555555555";
    expect(hits).toEqual([
      { id, title: "S.1 Global search", detail: "8 Edges", href: `/admin/boards/eight-edges?card=${cardSlug("S.1 Global search", id)}` },
    ]);
    const filters = calls[0].filters;
    expect(filters).toContainEqual(["or", "title.ilike.*global*"]);
    expect(filters).toContainEqual(["or", "title.ilike.*search*"]);
    expect(filters).toContainEqual(["is", "archived_at", null]);
    expect(filters).toContainEqual(["is", "boards.archived_at", null]);
    expect(filters.some((f) => f[0] === "in")).toBe(false);
    expect(memberBoardIds).not.toHaveBeenCalled();
  });

  it("opens a subtask in its parent's drawer and says whose subtask it is", async () => {
    const parentId = "99999999-2222-3333-4444-555555555555";
    script("tasks", { data: [row({ title: "Palette", parent_task_id: parentId, parent: { id: parentId, title: "S.1 Global search" } })] });
    const [hit] = await cards.search(ADMIN, ["palette"], 5);
    expect(hit.title).toBe("Palette");
    expect(hit.detail).toBe("8 Edges · in S.1 Global search");
    expect(hit.href).toBe(`/admin/boards/eight-edges?card=${cardSlug("S.1 Global search", parentId)}`);
  });

  it("scopes a team member to the boards their Workboard shows them, and links to the team board", async () => {
    memberBoardIds.mockResolvedValue(["b1", "b2"]);
    script("tasks", { data: [row()] });
    const [hit] = await cards.search(team(), ["search"], 5);
    expect(memberBoardIds).toHaveBeenCalledWith("p1", "tm1");
    expect(calls[0].filters).toContainEqual(["in", "board_id", ["b1", "b2"]]);
    expect(hit.href.startsWith("/team/boards/eight-edges?card=")).toBe(true);
  });

  it("raises when the member's boards cannot be read, so the palette shows cards as unsearchable, not empty", async () => {
    memberBoardIds.mockRejectedValue(new Error("[boards/access] board_members: db down"));
    await expect(cards.search(team(), ["search"], 5)).rejects.toThrow("db down");
    expect(calls).toHaveLength(0);
  });

  it("finds nothing, without reading cards, for a team member on no board", async () => {
    memberBoardIds.mockResolvedValue([]);
    expect(await cards.search(team(), ["search"], 5)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("lets a team member who is also an admin search every board, as their Workboard does", async () => {
    script("tasks", { data: [row()] });
    await cards.search(team({ isAdmin: true }), ["search"], 5);
    expect(memberBoardIds).not.toHaveBeenCalled();
    expect(calls[0].filters.some((f) => f[0] === "in")).toBe(false);
  });
});
