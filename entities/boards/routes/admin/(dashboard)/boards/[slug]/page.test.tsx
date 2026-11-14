import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceViewer } from "@/kernel/shell/faces";
import type { BoardDetail } from "@/entities/boards/lib/data";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";

// The admin surface draws no border (LD.8; spec "Faces and borders", ADR 0021
// "Who reads what"): the same board a teammate sees with a wearer's Gold border
// on /team shows plain faces under /admin/boards. The page never asks the
// kernel's faces seam, so even a seam that would answer Gold for the member
// cannot dress a face here. Invented people and boards: the public fork
// receives tests too.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/admin/boards/kettle",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ roles: [], may: () => true, user: null }) }));

const asks: { ids: readonly string[]; viewer: FaceViewer }[] = [];
const WEARING = new Map<string, string>([["wearer", "gold"]]);
vi.mock("@/kernel/shell/faces", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/shell/faces")>()),
  wornTiersFor: async (ids: readonly string[], viewer: FaceViewer) => {
    asks.push({ ids, viewer });
    return new Map([...WEARING].filter(([id]) => ids.includes(id)));
  },
}));

const PEOPLE = [
  { id: "wearer", name: "Kim Wearer" },
  { id: "plain", name: "Pat Plain" },
];
const card = (n: number): WorkboardCard => {
  const who = PEOPLE[n % PEOPLE.length];
  return {
    id: `c${n}`, title: `Kettle task ${n}`, description: null, board_id: "b1", board_column_id: "col-doing", sprint_id: null, epic_id: null,
    position: n, assignee_id: who.id, created_by: null, status: "open", priority: "p2", due_date: null, human_tokens: 1, completed_at: null,
    internal: false, subject_type: null, subject_id: null, parent_task_id: null, metadata: {}, archived_at: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", assignee_name: who.name, subject_label: null, agent: false,
    subtasks: [], blockers: [], comments: [], blocks: 0, last_moved_at: "2026-10-01T00:00:00Z", laneId: "Doing",
  } as unknown as WorkboardCard;
};
const lane = (name: string, isDone = false, isNotDoing = false) => ({ id: name, name, isDone, isNotDoing, wipLimit: null });
const board = { id: "b1", name: "Kettle Works", slug: "kettle", client_name: "Kettle Works", client_color: 1, program_name: null, columns: [], laneColumn: { Doing: "col-doing" } };
const detail = {
  board,
  columns: [],
  boards: [board],
  lanes: [lane("To do"), lane("Doing"), lane("Done", true), lane("Not doing", false, true)],
  cards: Array.from({ length: 40 }, (_, n) => card(n)),
  members: [], people: PEOPLE, clientContacts: [], clients: [], sprints: [], epics: [],
  backlogItems: [], backlogGroups: [], archivedCards: [],
} as unknown as BoardDetail;
vi.mock("@/entities/boards/lib/data", async (importActual) => ({
  ...(await importActual<typeof import("@/entities/boards/lib/data")>()),
  getBoardBySlug: async () => detail,
  listBoardManageOptions: async () => ({ team: [], clients: [], programs: [] }),
}));

const { default: BoardDetailPage } = await import("./page");
const render = async () => renderToStaticMarkup(await BoardDetailPage({ params: Promise.resolve({ slug: "kettle" }) }));

beforeEach(() => {
  asks.length = 0;
});

describe("the admin board's faces", () => {
  it("draws every assignee's face plain, the wearer's included, and never asks for a border", async () => {
    const html = await render();
    expect(html.match(/class="wb-face-avatar[ "]/g)).toHaveLength(40);
    expect(html).not.toContain("admin-face-frame");
    expect(html).not.toContain("admin-face--framed");
    expect(html).not.toMatch(/\bframe-[a-z]+/);
    expect(asks).toHaveLength(0);
  });

  it("shows no division, no star and no point for a wearing member", async () => {
    const html = await render();
    expect(html).not.toMatch(/division|★|\bpoints?\b|\bGold\b|[Ll]egend|\bIV\b|\bIII\b/);
  });
});
