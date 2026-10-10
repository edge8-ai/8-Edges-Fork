import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkboardCard, WorkboardLane } from "@/entities/boards/lib/workboard";

// The morning digest reads the board the way every reporting agent does
// (U.2): readBoardState for the cards, personBoardState for which of them are
// open. A card sitting in a done column is done and is not mailed as open
// work, and the red "(overdue)" follows the board's one rule (A.29.1). The
// email is sectioned by column and ordered by priority, a card withheld for
// access is named in the reader's own email, and the digest is a weekday mail.

// The board read is the shared reader's, faked here as the state it returns.
const state = vi.hoisted(() => ({
  lanes: [] as WorkboardLane[],
  cards: [] as WorkboardCard[],
  boards: [] as { id: string; name: string; slug: string }[],
}));
const readBoardState = vi.hoisted(() => vi.fn(async () => state));
vi.mock("@/entities/boards/lib/board-state-read", () => ({ readBoardState }));

// The only table the cron reads itself: which assignees are active team members.
const responses: Record<string, { data: unknown; error: null }> = {};
function builder(table: string) {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve),
  };
  for (const op of ["select", "eq", "neq", "is", "in", "not", "order", "limit"]) b[op] = () => b;
  return b;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builder(t) } }));
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const isBoardMember = vi.hoisted(() => vi.fn(async (_boardId: string, _personId: string, _tm: string) => true));
vi.mock("@/entities/boards/lib/access", () => ({ isBoardMember }));
vi.mock("@/kernel/identity/access-of-person", () => ({ holdsSurfaceAdmin: vi.fn(async () => false) }));
// Who may open which page (AC.15): each test says what each recipient may open.
const opens = vi.hoisted(() => new Map<string, (href: string) => boolean>());
const recipientMayOpen = vi.hoisted(() => vi.fn(async (personId: string) => opens.get(personId) ?? (() => false)));
vi.mock("@/kernel/identity/may-open", () => ({ recipientMayOpen }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://os.example" }));
// A Wednesday by default; a test moves it to the weekend.
const today = vi.hoisted(() => ({ value: "2026-09-23" }));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => today.value,
}));
const mails: { to: string; subject: string; html: string }[] = [];
const mailAccepted = vi.hoisted(() => ({ value: true }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: vi.fn(async (m: { to: string; subject: string; html: string }) => {
    mails.push(m);
    return mailAccepted.value;
  }),
}));

const { GET } = await import("./board-digest");

const LANES: WorkboardLane[] = [
  { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Waiting", name: "Waiting", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
];

function card(
  id: string,
  title: string,
  over: { due_date?: string | null; laneId?: string; priority?: string; board_id?: string } = {},
): WorkboardCard {
  return {
    id,
    title,
    status: "open",
    priority: "p2",
    due_date: null,
    assignee_id: "p1",
    board_id: "b1",
    laneId: "To do",
    completed_at: null,
    last_column_move_at: null,
    ...over,
  } as unknown as WorkboardCard;
}

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/board-digest/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  mails.length = 0;
  mailAccepted.value = true;
  today.value = "2026-09-23";
  state.lanes = LANES;
  state.cards = [];
  state.boards = [
    { id: "b1", name: "Delivery", slug: "delivery" },
    { id: "b2", name: "Closed client", slug: "closed-client" },
  ];
  responses.team_members = {
    data: [
      {
        id: "tm1",
        person_id: "p1",
        people: { email: "ana@example.com", full_name: "Ana Example", preferred_name: null, first_name: "Ana", display_name: null },
      },
    ],
    error: null,
  };
  opens.clear();
  opens.set("p1", (href) => href.startsWith("/team/"));
  recipientMayOpen.mockClear();
  readBoardState.mockClear();
  isBoardMember.mockReset();
  isBoardMember.mockImplementation(async () => true);
});

describe("the board digest (A.29.1, U.2)", () => {
  it("leaves out a card sitting in a done column, and marks overdue by the board's rule", async () => {
    state.cards = [
      card("late", "Late card", { due_date: "2026-09-22" }),
      card("today", "Due today card", { due_date: "2026-09-23" }),
      // Its row still says open; the lane says done, and the lane wins (W.111).
      card("finished", "Finished card", { due_date: "2026-09-01", laneId: "Done" }),
    ];
    const { body } = await run();
    expect(body).toMatchObject({ recipients: 1, emailed: 1, withheldForAccess: 0 });

    const html = mails[0].html;
    expect(html).toContain("Late card");
    expect(html).toContain("Due today card");
    expect(html).not.toContain("Finished card");
    expect(html).toContain("2 open tasks");
    expect(mails[0].subject).toBe("Your Edge8 boards: 2 open tasks");
    // Only yesterday's card is overdue; the one due today is not, yet.
    expect(html.split("(overdue)").length - 1).toBe(1);
    expect(html.indexOf("(overdue)")).toBeLessThan(html.indexOf("Due today card"));
  });

  it("sections the email by column in board order, and orders each section by priority, then due date", async () => {
    state.cards = [
      card("w", "Waiting card", { laneId: "Waiting", priority: "p1" }),
      card("t3", "Low todo", { laneId: "To do", priority: "p3", due_date: "2026-09-01" }),
      card("t1", "Urgent todo", { laneId: "To do", priority: "p1" }),
      card("t2b", "Later normal todo", { laneId: "To do", priority: "p2", due_date: "2026-10-02" }),
      card("t2a", "Sooner normal todo", { laneId: "To do", priority: "p2", due_date: "2026-09-30" }),
      card("d", "Doing card", { laneId: "Doing" }),
    ];
    await run();
    const html = mails[0].html;
    const at = (text: string) => html.indexOf(text);
    // Sections in the board's column order, each headed with its count.
    expect(at("To do (4)")).toBeGreaterThan(-1);
    expect(at("To do (4)")).toBeLessThan(at("Doing (1)"));
    expect(at("Doing (1)")).toBeLessThan(at("Waiting (1)"));
    expect(html).not.toContain("Done (");
    // Inside a section: priority first, then the sooner due date.
    expect(at("Urgent todo")).toBeLessThan(at("Sooner normal todo"));
    expect(at("Sooner normal todo")).toBeLessThan(at("Later normal todo"));
    expect(at("Later normal todo")).toBeLessThan(at("Low todo"));
    expect(at("Low todo")).toBeLessThan(at("Doing card"));
    expect(html).toContain("P1 · Delivery");
  });

  it("names a card withheld for access in the reader's own email, without a link, and resolves access once (AC.15)", async () => {
    state.cards = [card("a", "Open card"), card("b", "Card on a board they left", { board_id: "b2" })];
    isBoardMember.mockImplementation(async (boardId: string) => boardId === "b1");
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ recipients: 1, emailed: 1, withheldForAccess: 1 });
    const html = mails[0].html;
    // Both are the reader's open work, so both are counted, in their column.
    expect(html).toContain("2 open tasks");
    expect(html).toContain("To do (2)");
    expect(html).toContain("Card on a board they left");
    expect(html).toContain("on a board you can no longer open");
    expect(html).toContain("One card is assigned to you on a board you can no longer open");
    // Neither its link nor its board's name reaches the email.
    expect(html).not.toContain("/team/boards/closed-client");
    expect(html).not.toContain("Closed client");
    expect(html).toContain("/team/boards/delivery");
    expect(recipientMayOpen).toHaveBeenCalledTimes(1);
  });

  it("mails a reader whose every card is withheld, rather than leaving them unaware of their own cards", async () => {
    state.cards = [card("a", "First card"), card("b", "Second card")];
    opens.set("p1", () => false);
    const { body } = await run();
    expect(body).toMatchObject({ recipients: 1, emailed: 1, withheldForAccess: 2 });
    expect(mails[0].html).toContain("2 cards are assigned to you");
    expect(mails[0].html).not.toContain("/team/boards/");
    expect(mails[0].html).not.toContain("Open the Workboard");
  });

  // Y.20. A digest the mail provider refused used to count as one fewer
  // emailed and nothing more; now the run is an error that names who went without.
  it("makes the run an error naming the recipient whose digest was not sent", async () => {
    state.cards = [card("a", "First card")];
    mailAccepted.value = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ recipients: 1, emailed: 0 });
    expect(body.error).toBe("person p1 at email: the digest email was not sent");
    // The run log and the Ops alert carry an id, never an address (review of #1973).
    expect(String(body.error)).not.toContain("ana@example.com");
  });

  it("is a partial send, and so a failed run, when one reader of two goes without", async () => {
    state.cards = [card("a", "First card"), { ...card("b", "Second card"), assignee_id: "p2" } as WorkboardCard];
    responses.team_members.data = [
      ...(responses.team_members.data as unknown[]),
      { id: "tm2", person_id: "p2", people: { email: "bo@example.com", full_name: "Bo Example", preferred_name: null, first_name: "Bo", display_name: null } },
    ];
    opens.set("p2", (href) => href.startsWith("/team/"));
    // The provider refuses the first digest and takes the second.
    const { sendTransactionalEmail } = await import("@/kernel/messaging/email");
    vi.mocked(sendTransactionalEmail).mockImplementationOnce(async () => false);
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ recipients: 2, emailed: 1 });
    expect(String(body.error)).toMatch(/^person p[12] at email/);
  });

  it("mails nobody at the weekend, and does not read the board", async () => {
    today.value = "2026-09-26";
    state.cards = [card("a", "First card")];
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", reason: "weekend" });
    expect(mails).toEqual([]);
    expect(readBoardState).not.toHaveBeenCalled();
  });
});
