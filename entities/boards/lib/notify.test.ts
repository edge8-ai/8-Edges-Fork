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

const { notifyBoardAssignee } = await import("./notify");
const { sendLarkDm } = await import("@/kernel/messaging/lark-api");

function scriptBoardAndPerson() {
  script("boards", { data: { slug: "engineering", name: "Engineering" } });
  script("people", { data: { email: "ben@example.com" } });
}

beforeEach(() => {
  resetFake();
  cannotOpen.clear();
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
