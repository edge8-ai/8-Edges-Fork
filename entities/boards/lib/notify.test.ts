import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The assignment DM links to the board, and a link goes only to someone who may
// open that page (AC.15, ADR 0013). Best-effort: nothing here may fail an assignment.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/messaging/lark-api", () => ({ sendLarkDm: vi.fn(async () => true) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://site.example" }));
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: vi.fn(async (personId: string) => (href: string | null | undefined) => Boolean(href) && !cannotOpen.has(personId)),
}));

const published = vi.hoisted(() => [] as [string, Record<string, unknown>][]);
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: Record<string, unknown>) => void published.push([name, payload])) }));

const { notifyBoardAssignee } = await import("./notify");
const { sendLarkDm } = await import("@/kernel/messaging/lark-api");

function scriptBoardAndPerson() {
  script("boards", { data: { slug: "engineering", name: "Engineering" } });
  script("people", { data: { email: "ben@example.com" } });
}

beforeEach(() => {
  resetFake();
  cannotOpen.clear();
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("notifyBoardAssignee (AC.15)", () => {
  it("DMs the assignee a link to the board when they may open it", async () => {
    scriptBoardAndPerson();
    await notifyBoardAssignee("board-1", "p2", "Write the spec", "p1");
    expect(vi.mocked(sendLarkDm)).toHaveBeenCalledTimes(1);
    const [email, text] = vi.mocked(sendLarkDm).mock.calls[0];
    expect(email).toBe("ben@example.com");
    expect(text).toContain("https://site.example/team/boards/engineering");
  });

  it("sends nothing to an assignee who may not open the board", async () => {
    scriptBoardAndPerson();
    cannotOpen.add("p2");
    await notifyBoardAssignee("board-1", "p2", "Write the spec", "p1");
    expect(vi.mocked(sendLarkDm)).not.toHaveBeenCalled();
  });

  it("never notifies someone who assigned the card to themselves", async () => {
    await notifyBoardAssignee("board-1", "p1", "Write the spec", "p1");
    expect(vi.mocked(sendLarkDm)).not.toHaveBeenCalled();
  });
});

// TH.2: the assignment is also a fact on the bus, so the inbox can keep it.
describe("notifyBoardAssignee states the assignment (TH.2)", () => {
  it("publishes board.card.assigned with the card, the handover note and who handed it over", async () => {
    scriptBoardAndPerson();
    await notifyBoardAssignee("board-1", "p2", "Write the spec", "p1", "  The brief is linked.  ", { taskId: "t-1", actorName: "Derek" });
    expect(published).toEqual([
      ["board.card.assigned", { taskId: "t-1", boardSlug: "engineering", title: "Write the spec", note: "The brief is linked.", actorName: "Derek", assigneeId: "p2", actorPersonId: "p1" }],
    ]);
  });

  it("states it even when the person has no address for a DM, and never for a self-assignment", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    script("people", { data: { email: null } });
    await notifyBoardAssignee("board-1", "p2", "Write the spec", "p1", null, { taskId: "t-1" });
    await notifyBoardAssignee("board-1", "p1", "Write the spec", "p1", null, { taskId: "t-1" });
    expect(published.map(([name, p]) => [name, p.assigneeId])).toEqual([["board.card.assigned", "p2"]]);
    expect(vi.mocked(sendLarkDm)).not.toHaveBeenCalled();
  });
});
