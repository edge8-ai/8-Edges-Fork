import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { cardSlug } from "@/kernel/config/slug";

// W.143: a mention is a Lark DM to the person tagged, with a link that opens
// the card — and to nobody else. Best-effort: nothing here may fail a comment.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/messaging/lark-api", () => ({ sendLarkDm: vi.fn(async () => true) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://site.example" }));
// AC.15: who may open the board is asked of the kernel, resolved per person.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: vi.fn(async (personId: string) => (href: string | null | undefined) => Boolean(href) && !cannotOpen.has(personId)),
}));

const { notifyMentioned } = await import("./mention-notify");
const { sendLarkDm } = await import("@/kernel/messaging/lark-api");

const CARD = "abcdef12-0000-4000-8000-000000000000";
const base = { boardId: "board-1", cardId: CARD, cardTitle: "Write the spec", byLabel: "Ada Rivers", body: "@Ben Okafor can you check?" };

beforeEach(() => {
  resetFake();
  cannotOpen.clear();
});
afterEach(() => vi.clearAllMocks());

describe("notifyMentioned (W.143)", () => {
  it("DMs each person tagged with who tagged them, what they said and a link to the card", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    await notifyMentioned({ ...base, targets: [{ id: "p2", email: "ben@example.com" }] });
    expect(vi.mocked(sendLarkDm)).toHaveBeenCalledTimes(1);
    const [email, text] = vi.mocked(sendLarkDm).mock.calls[0];
    expect(email).toBe("ben@example.com");
    expect(text).toContain('Ada Rivers mentioned you on "Write the spec" on the Engineering board.');
    expect(text).toContain("@Ben Okafor can you check?");
    expect(text).toContain(`https://site.example/team/boards/engineering?card=${cardSlug("Write the spec", CARD)}`);
  });

  it("messages only the people it is given, and skips one with no address", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    await notifyMentioned({ ...base, targets: [{ id: "p2", email: "ben@example.com" }, { id: "p3", email: null }] });
    expect(vi.mocked(sendLarkDm).mock.calls.map((c) => c[0])).toEqual(["ben@example.com"]);
  });

  it("does not DM a tagged person who may not open the board, and still DMs the one who may (AC.15)", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    cannotOpen.add("p2");
    await notifyMentioned({
      ...base,
      targets: [
        { id: "p2", email: "ben@example.com" },
        { id: "p3", email: "cy@example.com" },
      ],
    });
    expect(vi.mocked(sendLarkDm).mock.calls.map((c) => c[0])).toEqual(["cy@example.com"]);
  });

  it("reads nothing and sends nothing when nobody was tagged", async () => {
    await notifyMentioned({ ...base, targets: [] });
    expect(calls).toEqual([]);
    expect(vi.mocked(sendLarkDm)).not.toHaveBeenCalled();
  });

  it("sends no link-less message when the board cannot be read", async () => {
    script("boards", { error: { message: "timeout" } });
    await notifyMentioned({ ...base, targets: [{ id: "p2", email: "ben@example.com" }] });
    expect(vi.mocked(sendLarkDm)).not.toHaveBeenCalled();
  });

  it("never throws when Lark does", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    vi.mocked(sendLarkDm).mockRejectedValueOnce(new Error("lark down"));
    await expect(notifyMentioned({ ...base, targets: [{ id: "p2", email: "ben@example.com" }] })).resolves.toBeUndefined();
  });

  it("shortens a long comment to an excerpt; the card holds the rest", async () => {
    script("boards", { data: { slug: "engineering", name: "Engineering" } });
    await notifyMentioned({ ...base, body: "x".repeat(400), targets: [{ id: "p2", email: "ben@example.com" }] });
    const text = vi.mocked(sendLarkDm).mock.calls[0][1];
    expect(text).toContain(`${"x".repeat(280)}…`);
    expect(text).not.toContain("x".repeat(281));
  });
});
