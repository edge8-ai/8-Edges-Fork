import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceViewer } from "@/kernel/shell/faces";
import type { MyWeekBoard, MyWeekCard, MyWeekRead } from "@/entities/boards/lib/my-week-read";
import type { BoardColumnRow, SprintRow } from "@/entities/boards/lib/types";
import { WEEKLY_SPRINTS_KEY } from "@/entities/boards/lib/sprint-cadence";
import { sprintStartOf } from "@/entities/boards/lib/my-week";
import { saigonToday } from "@/kernel/config/dates";

// My Week and the worn borders (LD.8). My Week is a self-view of the reader's
// own cards and draws no person's face, so there is nothing to wear a border
// on: the page asks the kernel's faces seam for nobody, and a reader who wears
// Gold sees no border, and no division, star or point, anywhere on it. Should a
// face ever be drawn here, it asks once for every face, as the board and Spark
// do, and this test is the place that says so. Invented boards: the public fork
// receives tests too.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ roles: [], may: () => true }) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "me", isAdmin: false }) }));

const asks: { ids: readonly string[]; viewer: FaceViewer }[] = [];
const WEARING = new Map<string, string>([["me", "gold"]]);
vi.mock("@/kernel/shell/faces", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/shell/faces")>()),
  wornTiersFor: async (ids: readonly string[], viewer: FaceViewer) => {
    asks.push({ ids, viewer });
    return new Map([...WEARING].filter(([id]) => ids.includes(id)));
  },
}));

const col = (id: string, position: number, over: Partial<BoardColumnRow> = {}) =>
  ({ id, board_id: "b1", name: id, position, is_done: false, wip_limit: null, is_not_doing: false, ...over }) as BoardColumnRow;
const BOARD = {
  id: "b1", name: "Kettle Works", slug: "kettle", description: null, client_company_id: null, ai_program_id: null, owner_id: null,
  status: "active", sort_order: 0, metadata: { [WEEKLY_SPRINTS_KEY]: "product" }, client_name: null,
  columns: [col("todo", 0), col("doing", 1), col("done", 2, { is_done: true })],
} as MyWeekBoard;
// This sprint, whatever day the suite runs, so the cards are drawn in it.
const SPRINT = { id: "s-now", board_id: "b1", name: "Now", starts_on: sprintStartOf(saigonToday()), status: "active", week: null } as unknown as SprintRow;
const card = (n: number, over: Partial<MyWeekCard> = {}): MyWeekCard => ({
  id: `c${n}`, title: `Kettle task ${n}`, board_id: "b1", board_column_id: "todo", sprint_id: "s-now", status: "open", priority: "p2",
  due_date: null, human_tokens: 1, completed_at: null, assignee_id: "me", metadata: {}, ...over,
});
const read: MyWeekRead = {
  boards: [BOARD],
  sprints: [SPRINT],
  cards: [card(1), card(2, { board_column_id: "doing" }), card(3, { board_column_id: "done", status: "done", completed_at: new Date().toISOString() })],
  blockers: [],
};
vi.mock("@/entities/boards/lib/my-week-read", () => ({ readMyWeek: async () => read }));

const { default: MyWeekPage } = await import("./page");

beforeEach(() => {
  asks.length = 0;
});

describe("My Week for a reader who wears a border", () => {
  it("draws no border, because it draws no face, and asks the faces seam for nobody", async () => {
    const html = renderToStaticMarkup(await MyWeekPage({}));
    expect(html).toContain("Kettle task 1");
    expect(html).not.toContain("admin-face-frame");
    expect(html).not.toContain("admin-face--framed");
    expect(html).not.toMatch(/\bframe-[a-z]+/);
    expect(asks).toHaveLength(0);
  });

  it("shows no division, no star and no point", async () => {
    const html = renderToStaticMarkup(await MyWeekPage({}));
    // (The sprint ring's key is the class admin-myweek-ring-legend, which is not a tier.)
    expect(html).not.toMatch(/division|★|\bpoints?\b|\bGold\b|(?<!-)[Ll]egend|\bIV\b|\bIII\b/);
  });
});
