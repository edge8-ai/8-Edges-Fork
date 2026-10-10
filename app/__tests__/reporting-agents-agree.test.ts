// U.2. The three reporting agents, run against one board on one day, tell one
// person the same numbers: the daily check-in (company-os), the morning board
// digest (boards) and the weekly individual summary (team). Each used to
// classify the cards itself, and the copies had drifted, so the check-in, the
// digest and the summary could disagree about how much work in progress the
// same person had. They now read the board through readBoardState and count by
// personBoardState; this runs each agent's real cron end to end, with only the
// board read, the database, the senders and the access checks faked, and
// compares what each one actually sends.
//
// It lives under app/ because it spans three entities, and only the
// composition root may reach all three (each through its crons/ mount).
// Collected by the root vitest.config.ts (`app/**/*.test.{ts,tsx}`).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkboardCard, WorkboardLane } from "@/entities/boards";

// One board state for the day, shared by all three agents.
const state = vi.hoisted(() => ({
  boards: [] as { id: string; name: string; slug: string; client_name: string | null }[],
  lanes: [] as WorkboardLane[],
  cards: [] as WorkboardCard[],
}));
vi.mock("@/entities/boards/lib/board-state-read", () => ({ readBoardState: async () => state }));

// Every table the three agents read themselves, answered the same way each time.
const tables = vi.hoisted(() => ({} as Record<string, unknown[]>));
vi.mock("@/kernel/data/supabase", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve),
    };
    for (const op of ["select", "eq", "neq", "is", "in", "not", "gte", "lte", "order", "limit", "range"]) b[op] = () => b;
    return b;
  }
  return { companyOs: { from: (t: string) => builder(t) }, supabase: { from: (t: string) => builder(t) } };
});
// The real outcome rule decides each response; only the bearer and the run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

// What each agent sent, captured.
const larkPosts = vi.hoisted(() => [] as unknown[]);
const dms = vi.hoisted(() => [] as string[]);
const mails = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/messaging/lark", () => {
  const post = async (message: unknown) => {
    larkPosts.push(message);
    return true;
  };
  return { notifyProduct: post, notifyEo: post, notifyOps: post };
});
vi.mock("@/kernel/messaging/lark-api", () => ({
  sendLarkDm: async (_email: string, text: string) => {
    dms.push(text);
    return true;
  },
  larkOpenIdByEmail: async () => "ou_test",
}));
vi.mock("@/kernel/messaging/dm-preference", () => ({ larkDmOptedOut: async () => false }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: async (m: { html: string }) => {
    mails.push(m.html);
    return true;
  },
}));

// The reader is a member of the delivery board only, so one of their cards is
// withheld from the digest's links; it must still count.
vi.mock("@/entities/boards/lib/access", () => ({ isBoardMember: async (boardId: string) => boardId === "b1" }));
vi.mock("@/kernel/identity/access-of-person", () => ({ holdsSurfaceAdmin: async () => false }));
vi.mock("@/kernel/identity/may-open", () => ({ recipientMayOpen: async () => () => true }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://os.example.test" }));
// The entity barrels these crons load build on unstable_cache and React's
// `cache` at module load; both are made inert, as check-in-run.test.ts does.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

// Tuesday 22 September 2026, 10:00 in Asia/Ho_Chi_Minh: a day all three run.
const NOW = new Date("2026-09-22T03:00:00Z");
const HOURS_AGO = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const LANES: WorkboardLane[] = [
  { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Waiting", name: "Waiting", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
  { id: "Not doing", name: "Not doing", isDone: false, isNotDoing: true, wipLimit: null },
];

function card(id: string, laneId: string, over: Partial<WorkboardCard> = {}): WorkboardCard {
  return {
    id,
    title: `Card ${id}`,
    status: "open",
    priority: "p2",
    due_date: null,
    assignee_id: "p1",
    board_id: "b1",
    laneId,
    completed_at: null,
    last_column_move_at: null,
    comments: [],
    blockers: [],
    subtasks: [],
    ...over,
  } as unknown as WorkboardCard;
}

const PERSON = {
  id: "m1",
  person_id: "p1",
  full_name: "Test Person",
  first_name: "Test",
  preferred_name: null,
  display_name: null,
  email: "test.person@example.test",
  status: "active",
  department_name: "Product Development",
  employment_type: "full_time",
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.boards = [
    { id: "b1", name: "Delivery", slug: "delivery", client_name: null },
    { id: "b2", name: "Former client", slug: "former-client", client_name: "Former Client Co" },
  ];
  state.lanes = LANES;
  state.cards = [
    card("todo-1", "To do"),
    card("todo-2", "To do", { priority: "p1" }),
    card("doing-1", "Doing", { last_column_move_at: HOURS_AGO(3) }),
    // On a board the reader is no longer a member of: withheld from the
    // digest's links, still the reader's work in progress.
    card("doing-2", "Doing", { board_id: "b2" }),
    card("waiting-1", "Waiting"),
    card("done-1", "Done", { status: "done", completed_at: HOURS_AGO(12), last_column_move_at: HOURS_AGO(12) }),
    card("dropped", "Not doing", { status: "not_doing" }),
    card("colleague", "Doing", { assignee_id: "p2" }),
  ];
  tables.routine_runs = [];
  tables.team_directory = [PERSON];
  tables.time_off = [];
  tables.ideas = [];
  tables.coaching_profiles = [];
  tables.coaching_one_on_ones = [];
  tables.team_members = [
    {
      id: "m1",
      person_id: "p1",
      people: { email: PERSON.email, full_name: PERSON.full_name, preferred_name: null, first_name: "Test", display_name: null },
    },
  ];
});
afterAll(() => vi.useRealTimers());

/** The bullets under one heading of the person's block in a check-in card. */
function checkInBullets(heading: "Doing" | "Done"): number {
  const contents = (larkPosts as { card: { elements: { text?: { content: string } }[] } }[]).flatMap((m) =>
    m.card.elements.map((e) => e.text?.content ?? ""),
  );
  const block = contents.find((c) => c.includes("**Test Person**"));
  if (!block) throw new Error("the check-in has no block for the person");
  const after = block.split(`**${heading}**\n`)[1] ?? "";
  const section = after.split("\n**")[0];
  return section.split("\n").filter((l) => l.startsWith("• ")).length;
}

const number = (text: string, pattern: RegExp): number => {
  const m = text.match(pattern);
  if (!m) throw new Error(`no ${pattern} in: ${text}`);
  return Number(m[1]);
};

describe("the reporting agents (U.2)", () => {
  it("tell one person the same numbers on one day", async () => {
    const { GET: checkIn } = await import("@/entities/company-os/crons/daily-check-in");
    const { GET: digest } = await import("@/entities/boards/crons/board-digest");
    const { GET: summary } = await import("@/entities/team/crons/individual-summary");

    const runs = await Promise.all([
      checkIn(new Request("https://os.example.test/api/cron/daily-check-in/")),
      digest(new Request("https://os.example.test/api/cron/board-digest/")),
      summary(new Request("https://os.example.test/api/cron/individual-summary/")),
    ]);
    expect(runs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(dms).toHaveLength(1);
    expect(mails).toHaveLength(1);

    const checkInDoing = checkInBullets("Doing");
    const checkInDone = checkInBullets("Done");
    const summaryDoing = number(dms[0], /Doing: (\d+)/);
    const summaryBacklog = number(dms[0], /Backlog: (\d+)/);
    const summaryCompleted = number(dms[0], /Completed this week: (\d+)/);
    const digestDoing = number(mails[0], /Doing \((\d+)\)/);
    const digestOpen = number(mails[0], /You have (\d+) open task/);

    // Work in progress: the same two cards in all three, the withheld one included.
    expect({ checkIn: checkInDoing, digest: digestDoing, summary: summaryDoing }).toEqual({ checkIn: 2, digest: 2, summary: 2 });
    // Open work: the digest's total is the summary's backlog plus doing; Done
    // and Not Doing are in neither.
    expect({ digest: digestOpen, summary: summaryBacklog + summaryDoing }).toEqual({ digest: 5, summary: 5 });
    // Finished work: one card, inside both the check-in's day and the summary's week.
    expect({ checkIn: checkInDone, summary: summaryCompleted }).toEqual({ checkIn: 1, summary: 1 });
  });
});
