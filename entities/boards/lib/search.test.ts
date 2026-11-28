import { beforeEach, describe, expect, it, vi } from "vitest";

// S.1, SR.2.2. Boards answers the global search with cards, through the
// database's ranked company_os.search_cards (its matching and order are proved
// against production in the SR.2.1 migration's proof). An admin finds any card
// on a live board: the function is asked for every board (null). A team member
// finds cards only on the boards their Workboard shows them (memberBoardIds),
// and a team member who is also an admin sees every board, as on
// /team/workboard. The function runs as service_role, so the board list is the
// only thing keeping a team member to their own boards: a non-admin is never
// asked with null. A subtask opens its parent's drawer, because the board's
// ?card= link names top-level cards. (SR.1.3's embed test is gone with the
// embed: the function returns the parent itself.)
const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) } }));
const memberBoardIds = vi.fn<(personId: string, teamMemberId: string) => Promise<string[]>>();
vi.mock("@/entities/boards/lib/access", () => ({ memberBoardIds: (p: string, t: string) => memberBoardIds(p, t) }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { ReadFailure } from "@/kernel/data/read";
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
const ID = "11111111-2222-3333-4444-555555555555";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  title: "S.1 Global search",
  parent_id: null,
  parent_title: null,
  board_slug: "eight-edges",
  board_name: "8 Edges",
  score: 30,
  ...over,
});
const answer = (data: unknown[]) => rpc.mockResolvedValue({ data, error: null });

beforeEach(() => {
  rpc.mockReset();
  memberBoardIds.mockReset();
});

describe("boards' search contribution", () => {
  it("offers cards on both surfaces, by the board page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["card", { admin: "/admin/boards/[slug]", team: "/team/boards/[slug]" }],
    ]);
  });

  it("asks the ranked search for every board for an admin, and opens a card in its board's drawer", async () => {
    answer([row()]);
    const hits = await cards.search(ADMIN, ["global", "search"], 5);
    expect(rpc).toHaveBeenCalledWith("search_cards", { terms: ["global", "search"], board_ids: null, lim: 5 });
    expect(hits).toEqual([
      { id: ID, title: "S.1 Global search", detail: "8 Edges", href: `/admin/boards/eight-edges?card=${cardSlug("S.1 Global search", ID)}` },
    ]);
    expect(memberBoardIds).not.toHaveBeenCalled();
  });

  it("keeps the database's order, best match first", async () => {
    answer([row({ id: "a", title: "Search", score: 100 }), row({ id: "b", title: "Research", score: 10 })]);
    expect((await cards.search(ADMIN, ["search"], 5)).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("opens a subtask in its parent's drawer and says whose subtask it is", async () => {
    const parentId = "99999999-2222-3333-4444-555555555555";
    answer([row({ title: "Palette", parent_id: parentId, parent_title: "S.1 Global search" })]);
    const [hit] = await cards.search(ADMIN, ["palette"], 5);
    expect(hit.title).toBe("Palette");
    expect(hit.detail).toBe("8 Edges · in S.1 Global search");
    expect(hit.href).toBe(`/admin/boards/eight-edges?card=${cardSlug("S.1 Global search", parentId)}`);
  });

  it("asks only for a team member's own boards, never for every board, and links to the team board", async () => {
    memberBoardIds.mockResolvedValue(["b1", "b2"]);
    answer([row()]);
    const [hit] = await cards.search(team(), ["search"], 5);
    expect(memberBoardIds).toHaveBeenCalledWith("p1", "tm1");
    expect(rpc).toHaveBeenCalledWith("search_cards", { terms: ["search"], board_ids: ["b1", "b2"], lim: 5 });
    expect(rpc.mock.calls.every(([, args]) => args.board_ids !== null)).toBe(true);
    expect(hit.href.startsWith("/team/boards/eight-edges?card=")).toBe(true);
  });

  it("raises when the member's boards cannot be read, so the palette shows cards as unsearchable, not empty", async () => {
    memberBoardIds.mockRejectedValue(new Error("[boards/access] board_members: db down"));
    await expect(cards.search(team(), ["search"], 5)).rejects.toThrow("db down");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("finds nothing, without searching, for a team member on no board", async () => {
    memberBoardIds.mockResolvedValue([]);
    expect(await cards.search(team(), ["search"], 5)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets a team member who is also an admin search every board, as their Workboard does", async () => {
    answer([row()]);
    await cards.search(team({ isAdmin: true }), ["search"], 5);
    expect(memberBoardIds).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("search_cards", { terms: ["search"], board_ids: null, lim: 5 });
  });

  it("raises a failed search instead of answering that no card matched", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(cards.search(ADMIN, ["search"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });
});
