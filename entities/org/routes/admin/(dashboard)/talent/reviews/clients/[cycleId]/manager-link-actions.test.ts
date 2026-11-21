import { beforeEach, describe, expect, it, vi } from "vitest";

// CR.5.6: each of the owner's actions on a client manager's link refuses a
// person without the reviews permission before it reads anything, parses its
// input next, and only then works out who is acting and calls its command.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true as const, at: "2026-11-20T00:00:00Z" });
  return {
    allowed: { value: true },
    asked: [] as string[],
    teamMemberIdsOf: vi.fn(async () => ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    commands: { markManagerLinkCopied: vi.fn(ok), cancelManagerLink: vi.fn(ok), reissueManagerLink: vi.fn(ok) },
  };
});

vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    h.asked.push(p);
    // The real guard throws (a 403 or a redirect to sign in); it never returns a refusal.
    if (!h.allowed.value) throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    return { personId: "99999999-9999-4999-8999-999999999999", user: { email: "owner@example.com" } };
  },
}));
vi.mock("@/entities/org/lib/client-reviews/access", () => ({ teamMemberIdsOf: () => h.teamMemberIdsOf() }));
vi.mock("@/entities/org/lib/client-reviews/manager-link", () => h.commands);

import { cancelManagerLinkAction, managerLinkCopiedAction, reissueManagerLinkAction } from "./manager-link-actions";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ROSA = "44444444-4444-4444-8444-444444444444";
const input = { cycleId: CYCLE, clientManagerPersonId: ROSA };
const actions = [
  [managerLinkCopiedAction, h.commands.markManagerLinkCopied],
  [cancelManagerLinkAction, h.commands.cancelManagerLink],
  [reissueManagerLinkAction, h.commands.reissueManagerLink],
] as const;

beforeEach(() => {
  h.allowed.value = true;
  h.asked.length = 0;
  h.teamMemberIdsOf.mockClear();
  for (const c of Object.values(h.commands)) c.mockClear();
});

describe("the owner's manager-link actions", () => {
  it("refuse a person without the reviews permission before reading anything", async () => {
    h.allowed.value = false;
    for (const [action, command] of actions) {
      await expect(action(input)).rejects.toThrow(/403/);
      expect(command).not.toHaveBeenCalled();
    }
    expect(h.asked).toEqual(["org.reviews", "org.reviews", "org.reviews"]);
    expect(h.teamMemberIdsOf).not.toHaveBeenCalled();
  });

  it("refuse a hand-made request before working out who is acting", async () => {
    for (const [action, command] of actions) {
      expect(await action({ cycleId: CYCLE, clientManagerPersonId: "not-a-person" })).toEqual({ ok: false, error: "clientManagerPersonId: That client manager was not found. Reload the page." });
      expect(command).not.toHaveBeenCalled();
    }
    expect(h.teamMemberIdsOf).not.toHaveBeenCalled();
  });

  it("act as the signed-in person, with every team-member row of theirs so their own manager's link is refused", async () => {
    for (const [action, command] of actions) {
      expect(await action(input)).toMatchObject({ ok: true });
      expect(command).toHaveBeenCalledWith(CYCLE, ROSA, {
        personId: "99999999-9999-4999-8999-999999999999",
        email: "owner@example.com",
        ownTeamMemberIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      });
    }
  });
});
