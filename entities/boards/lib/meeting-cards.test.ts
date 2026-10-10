import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Z.13, the Workboard half of the meeting-to-actions chain (spec section 3,
// "The card filer"; section 12, tests 1, 9, 10 and 11). The board rule and the
// assignee rule are pure; the filer runs on the kernel fake, with crm's door
// faked so the card id is written back only through crm's writer.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/dates", () => ({ saigonToday: () => "2026-10-09" }));
const mode = vi.hoisted(() => ({ now: "live" as "live" | "shadow" }));
vi.mock("@/kernel/audit/run-context", () => ({ currentRunMode: () => mode.now }));
const crm = vi.hoisted(() => ({
  filed: [] as { itemId: string; taskId: string; note: string | null }[],
  parked: [] as { ids: string[]; note: string }[],
}));
vi.mock("@/entities/crm", () => ({
  meetingActionsToFile: vi.fn(async () => []),
  markMeetingActionFiled: async (itemId: string, taskId: string, note: string | null) => {
    crm.filed.push({ itemId, taskId, note });
    return { error: null };
  },
  markMeetingActionsNeedBoard: async (ids: string[], note: string) => {
    crm.parked.push({ ids, note });
    return { error: null };
  },
}));
const notified = vi.hoisted(() => [] as { boardId: string; assigneeId: string | null; title: string; note: string | null | undefined }[]);
vi.mock("./notify", () => ({
  notifyBoardAssignee: async (boardId: string, assigneeId: string | null, title: string, _by: string | null, note?: string | null) => {
    notified.push({ boardId, assigneeId, title, note });
  },
}));
vi.mock("./card-helpers", () => ({ endPosition: async () => 7, mergeCardMeta: () => ({ meta: { assigned_at: "2026-10-09T00:00:00.000Z" }, changed: true }) }));

const { assigneeFor, cardDescription, chooseBoard, fileItems } = await import("./meeting-cards");

const COMPANY = "22222222-2222-4222-8222-222222222222";
const board = (id: string, aiProgramId: string | null = null) => ({ id, name: `Board ${id}`, slug: `board-${id}`, aiProgramId, clientCompanyId: COMPANY });

const item = (n: number, ownerName: string | null = "Delivery Lead") => ({
  id: `88888888-8888-4888-8888-88888888888${n}`,
  meetingId: "11111111-1111-4111-8111-111111111111",
  position: n,
  title: `Action ${n}`,
  detail: null,
  evidence: "We will send you the checklist for the pilot data by Tuesday.",
  ownerName,
  dueDate: null,
  fileState: "to_file" as const,
  companyId: COMPANY,
  companyName: "Example Client",
  aiProgramId: null,
  meetingDate: "2026-10-08",
  meetingOwnerId: "33333333-3333-4333-8333-333333333333",
});

function scriptLanding() {
  script("board_columns", { data: [{ id: "col-done", is_done: true, is_not_doing: false }, { id: "col-todo", is_done: false, is_not_doing: false }] });
  script("sprints", { data: [{ id: "sprint-now", board_id: "b1", starts_on: "2026-10-06", ends_on: "2026-10-12" }] });
  script("board_members", { data: [{ person_id: "p-lead", people: { display_name: "Delivery Lead", preferred_name: null, full_name: null, first_name: null, last_name: null } }] });
}

beforeEach(() => {
  resetFake();
  mode.now = "live";
  crm.filed = [];
  crm.parked = [];
  notified.length = 0;
});

describe("the board rule (test 10)", () => {
  it("takes the meeting's AI Program board, else the company's only board, else no board", () => {
    expect(chooseBoard({ companyId: COMPANY, aiProgramId: "prog" }, [board("b1"), board("b2", "prog")]).board?.id).toBe("b2");
    expect(chooseBoard({ companyId: COMPANY, aiProgramId: null }, [board("b1")]).board?.id).toBe("b1");
    expect(chooseBoard({ companyId: COMPANY, aiProgramId: null }, [board("b1"), board("b2")])).toMatchObject({ board: null, why: expect.stringContaining("2 active boards") });
    expect(chooseBoard({ companyId: COMPANY, aiProgramId: null }, [])).toMatchObject({ board: null, why: expect.stringContaining("no active board") });
  });
});

describe("the assignee rule (decision 5)", () => {
  const members = [
    { personId: "p-lead", names: ["Delivery Lead"] },
    { personId: "p-owner", names: ["Account Owner"] },
  ];

  it("assigns the member named, exactly after folding; else the meeting's owner on the board; else nobody", () => {
    expect(assigneeFor("delivery  lead", members, "p-owner")).toEqual({ personId: "p-lead", note: null });
    expect(assigneeFor("Delivery", members, "p-owner")).toMatchObject({ personId: "p-owner", note: expect.stringContaining("meeting's owner") });
    expect(assigneeFor(null, members, "p-elsewhere")).toMatchObject({ personId: null, note: expect.stringContaining("unassigned") });
  });

  it("names the meeting and the line in the card's description", () => {
    expect(cardDescription(item(1))).toContain("From the Example Client meeting on");
    expect(cardDescription(item(1))).toContain('Said in the meeting: "We will send you the checklist');
  });
});

describe("filing (tests 1, 9 and 11)", () => {
  it("files one card per item on the board, writes it back through crm, and tells the assignee once", async () => {
    script("boards", { data: [{ id: "b1", name: "Delivery", slug: "delivery", ai_program_id: null, client_company_id: COMPANY }] });
    scriptLanding();
    script("tasks", { data: { id: "task-1" } });
    script("task_stage_log", { data: null });
    const out = await fileItems([item(1)]);
    expect(out).toMatchObject({ filed: 1, alreadyFiled: 0, failures: [] });
    const insert = calls.find((c) => c.table === "tasks" && c.ops[0] === "insert");
    expect(insert?.payloads[0]).toMatchObject({
      board_id: "b1",
      board_column_id: "col-todo",
      sprint_id: "sprint-now",
      assignee_id: "p-lead",
      priority: "p2",
      subject_type: "meeting_action_item",
      subject_id: item(1).id,
      metadata: { meeting_id: item(1).meetingId, origin: "meeting-actions" },
    });
    expect((insert?.payloads[0] as { human_tokens?: unknown }).human_tokens).toBeUndefined();
    expect(crm.filed).toEqual([{ itemId: item(1).id, taskId: "task-1", note: null }]);
    expect(notified).toEqual([{ boardId: "b1", assigneeId: "p-lead", title: "Action 1", note: expect.stringContaining("Example Client") }]);
  });

  it("reads a second insert's 23505 as already filed: the card id is read back and nobody is told again", async () => {
    script("boards", { data: [{ id: "b1", name: "Delivery", slug: "delivery", ai_program_id: null, client_company_id: COMPANY }] });
    scriptLanding();
    script("tasks", { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } as { message: string } }, { data: [{ id: "task-1" }] });
    const out = await fileItems([item(1)]);
    expect(out).toMatchObject({ filed: 0, alreadyFiled: 1, failures: [] });
    expect(crm.filed).toEqual([{ itemId: item(1).id, taskId: "task-1", note: null }]);
    expect(notified).toEqual([]);
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(false);
  });

  it("parks a meeting's items when the client has several boards", async () => {
    script("boards", { data: [{ id: "b1", name: "Delivery", slug: "delivery", ai_program_id: null, client_company_id: COMPANY }, { id: "b2", name: "Support", slug: "support", ai_program_id: null, client_company_id: COMPANY }] });
    const out = await fileItems([item(1), item(2)]);
    expect(out.needsBoard).toBe(2);
    expect(crm.parked).toEqual([{ ids: [item(1).id, item(2).id], note: expect.stringContaining("2 active boards") }]);
    expect(calls.some((c) => c.table === "tasks")).toBe(false);
  });

  it("files nothing and tells nobody in shadow (test 9)", async () => {
    mode.now = "shadow";
    script("boards", { data: [{ id: "b1", name: "Delivery", slug: "delivery", ai_program_id: null, client_company_id: COMPANY }] });
    const out = await fileItems([item(1), item(2)]);
    expect(out).toMatchObject({ filed: 0, wouldFile: 2, needsBoard: 0 });
    expect(calls.some((c) => c.table === "tasks" || c.table === "board_columns")).toBe(false);
    expect(crm.filed).toEqual([]);
    expect(notified).toEqual([]);
  });
});
