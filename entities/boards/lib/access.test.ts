import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Every active contractor is on the Contractors board without a board_members
// row (Dave, 2026-10-10): a new contractor no longer waits to be added by hand,
// and the rule reaches no other board.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: vi.fn() }));

const { isBoardMember, memberBoardIds } = await import("./access");

beforeEach(resetFake);
afterEach(() => vi.clearAllMocks());

const CONTRACT = { employment_type: "contract", status: "active" };

describe("isBoardMember on the Contractors board", () => {
  it("lets in an active contractor with no board_members row", async () => {
    script("board_members", { data: null });
    script("boards", { data: { client_company_id: null, slug: "contractors" } });
    script("team_members", { data: CONTRACT });
    expect(await isBoardMember("board-c", "person-1", "tm-1")).toBe(true);
  });

  it("keeps out a full-time team member", async () => {
    script("board_members", { data: null });
    script("boards", { data: { client_company_id: null, slug: "contractors" } });
    script("team_members", { data: { employment_type: "full_time", status: "active" } });
    expect(await isBoardMember("board-c", "person-1", "tm-1")).toBe(false);
  });

  it("keeps out a contractor who has not started or has left", async () => {
    script("board_members", { data: null });
    script("boards", { data: { client_company_id: null, slug: "contractors" } });
    script("team_members", { data: { employment_type: "contract", status: "pre_start" } });
    expect(await isBoardMember("board-c", "person-1", "tm-1")).toBe(false);
  });

  it("gives a contractor no other non-client board", async () => {
    script("board_members", { data: null });
    script("boards", { data: { client_company_id: null, slug: "ops" } });
    expect(await isBoardMember("board-o", "person-1", "tm-1")).toBe(false);
  });
});

describe("memberBoardIds", () => {
  it("adds the Contractors board for an active contractor", async () => {
    script("board_members", { data: [{ board_id: "board-a" }] });
    script("staff_assignments", { data: [] });
    script("team_members", { data: CONTRACT });
    script("boards", { data: { id: "board-c" } });
    expect(await memberBoardIds("person-1", "tm-1")).toEqual(["board-a", "board-c"]);
  });

  it("adds nothing for a team member who is not a contractor", async () => {
    script("board_members", { data: [{ board_id: "board-a" }] });
    script("staff_assignments", { data: [] });
    script("team_members", { data: { employment_type: "full_time", status: "active" } });
    expect(await memberBoardIds("person-1", "tm-1")).toEqual(["board-a"]);
  });
});
