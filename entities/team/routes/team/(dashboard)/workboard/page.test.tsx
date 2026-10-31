import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceViewer } from "@/kernel/shell/faces";
import type { WorkboardCard, WorkboardData } from "@/entities/boards";

// The team Workboard's worn borders (LD.8; spec "Faces and borders"). The page
// collects every assignee the board draws and asks the kernel's faces seam once
// per render, for the reader, however many cards there are; each card's face
// then wears its assignee's tier and nothing else about them: no division, no
// star, no point. Invented people and boards: the public fork receives tests too.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
// The page opens on the reader's own cards (W.166); `?assignee=all` is the
// whole board, the forty cards a teammate sees once they clear that filter.
let search = "assignee=all";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/team/workboard",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ roles: [], may: () => true }) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "me", isAdmin: false }) }));
vi.mock("@/entities/portal", () => ({ reportContractorHours: async () => ({ ok: true }) }));

const asks: { ids: readonly string[]; viewer: FaceViewer }[] = [];
let wearing = new Map<string, string>();
vi.mock("@/kernel/shell/faces", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/shell/faces")>()),
  wornTiersFor: async (ids: readonly string[], viewer: FaceViewer) => {
    asks.push({ ids, viewer });
    return new Map([...wearing].filter(([id]) => ids.includes(id)));
  },
}));

// Forty cards across four people, as the ticket asks: ten each, all open in
// "Doing", so every one of them is drawn on the page's first view.
const PEOPLE = [
  { id: "wearer", name: "Kim Wearer" },
  { id: "plain", name: "Pat Plain" },
  { id: "builder", name: "Bo Builder" },
  { id: "me", name: "Me Reader" },
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
const FORTY = Array.from({ length: 40 }, (_, n) => card(n));
const lane = (name: string, isDone = false, isNotDoing = false) => ({ id: name, name, isDone, isNotDoing, wipLimit: null });
const data = {
  boards: [{ id: "b1", name: "Kettle Works", slug: "kettle", client_name: "Kettle Works", client_color: 1, program_name: null, columns: [], laneColumn: { Doing: "col-doing" } }],
  lanes: [lane("To do"), lane("Doing"), lane("Done", true), lane("Not doing", false, true)],
  cards: FORTY,
  members: [], people: PEOPLE.map((p) => ({ id: p.id, name: p.name })), clientContacts: [], clients: [], sprints: [], epics: [],
  backlogItems: [], backlogGroups: [], archivedCards: [],
} as unknown as WorkboardData;
vi.mock("@/entities/team/lib/boards", () => ({ getTeamWorkboard: async () => data }));

const { default: TeamWorkboardPage } = await import("./page");
const render = async () => renderToStaticMarkup(await TeamWorkboardPage({ badgeDrops: null }));

beforeEach(() => {
  asks.length = 0;
  search = "assignee=all";
  // The seam answers the border each person wears: Bo wears only a Builder
  // medal, which never sits beside a face, so ladders leaves him out.
  wearing = new Map([["wearer", "gold"]]);
});

describe("the team Workboard's worn borders", () => {
  it("asks the faces seam once per render with forty cards, for the reader, with every assignee it draws", async () => {
    await render();
    expect(asks).toHaveLength(1);
    expect(asks[0].viewer).toEqual({ personId: "me" });
    expect([...asks[0].ids].sort()).toEqual(["builder", "me", "plain", "wearer"]);
    await render();
    expect(asks).toHaveLength(2);
  });

  it("puts the Gold border on every card of the wearer and on nobody else's", async () => {
    const html = await render();
    // Ten of the forty cards are the wearer's, each with its face framed.
    expect(html.match(/admin-face-frame frame-gold/g)).toHaveLength(10);
    // Nobody else wears a border.
    expect(html).not.toMatch(/frame-(?!gold)[a-z]+/);
    // Every one of the forty faces is drawn, so the thirty plain ones are plain by choice, not by absence.
    expect(html.match(/class="wb-face-avatar[ "]/g)).toHaveLength(40);
  });

  it("asks once on the reader's own view too, which draws their cards alone", async () => {
    search = "";
    const html = await render();
    expect(asks).toHaveLength(1);
    expect(html.match(/class="wb-face-avatar[ "]/g)).toHaveLength(10);
    expect(html).not.toContain("admin-face-frame");
  });

  it("says the tier alone: no division, no star, no point, and no Builder tier", async () => {
    const html = await render();
    expect(html).not.toMatch(/division|★|\bpoints?\b|\bGold\b|[Ll]egend|[Aa]rchon|\bIV\b|\bIII\b/);
  });

  it("draws plain faces when the seam answers nothing, as it does for a viewer whose game style is off", async () => {
    wearing = new Map();
    const html = await render();
    expect(html.match(/class="wb-face-avatar[ "]/g)).toHaveLength(40);
    expect(html).not.toContain("admin-face-frame");
    expect(html).not.toContain("admin-face--framed");
  });
});
