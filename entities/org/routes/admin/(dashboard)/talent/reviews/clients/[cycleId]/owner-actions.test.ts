import { beforeEach, describe, expect, it, vi } from "vitest";

// The CR.2 code review asked for this: each of the owner's actions refuses a
// person without the reviews permission before it reads anything, parses its
// input next, and only then works out who is acting and calls its command.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true as const });
  return {
    allowed: { value: true },
    asked: [] as string[],
    // Every team-member row of the acting person: two, as a second engagement is still them.
    teamMemberIdsOf: vi.fn(async () => ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]),
    commands: {
      unlockClientManagerPart: vi.fn(ok),
      reopenClientPart: vi.fn(ok),
      reissueClientManagerLink: vi.fn(ok),
      changeClientManager: vi.fn(ok),
      addCycleMember: vi.fn(ok),
      withdrawCycleMember: vi.fn(ok),
      closeClientCycle: vi.fn(ok),
    },
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
vi.mock("@/entities/org/lib/client-reviews/owner-actions", () => h.commands);

import {
  addMemberAction,
  changeClientManagerAction,
  closeCycleAction,
  reissueLinkAction,
  reopenPartAction,
  unlockPartAction,
  withdrawMemberAction,
} from "./owner-actions";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const CM = "44444444-4444-4444-8444-444444444444";
const member = { cycleId: CYCLE, teamMemberId: ANA };

const ACTIONS: Array<[string, () => Promise<unknown>, keyof typeof h.commands]> = [
  ["unlock", () => unlockPartAction(member), "unlockClientManagerPart"],
  ["reopen", () => reopenPartAction({ ...member, kind: "self" }), "reopenClientPart"],
  ["new link", () => reissueLinkAction(member), "reissueClientManagerLink"],
  ["change client manager", () => changeClientManagerAction({ ...member, clientManagerPersonId: CM }), "changeClientManager"],
  ["add", () => addMemberAction({ ...member, clientManagerPersonId: null }), "addCycleMember"],
  ["withdraw", () => withdrawMemberAction(member), "withdrawCycleMember"],
  ["close", () => closeCycleAction({ cycleId: CYCLE }), "closeClientCycle"],
];

beforeEach(() => {
  h.allowed.value = true;
  h.asked.length = 0;
  h.teamMemberIdsOf.mockClear();
  for (const c of Object.values(h.commands)) c.mockClear();
});

describe.each(ACTIONS)("the %s action", (_name, run, command) => {
  it("refuses a person without the reviews permission before anything else", async () => {
    h.allowed.value = false;
    await expect(run()).rejects.toThrow();
    expect(h.asked).toEqual(["org.reviews"]);
    expect(h.teamMemberIdsOf).not.toHaveBeenCalled();
    expect(h.commands[command]).not.toHaveBeenCalled();
  });

  it("acts as the signed-in person, with every team member row of theirs", async () => {
    expect(await run()).toEqual({ ok: true });
    // The actor is always the command's last argument.
    const args = h.commands[command].mock.calls[0] as unknown[];
    expect(args.at(-1)).toEqual({ personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com", ownTeamMemberIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] });
  });
});

describe("input that does not parse", () => {
  it("is refused with the schema's words, before the actor is read or a command runs", async () => {
    expect(await withdrawMemberAction({ cycleId: CYCLE, teamMemberId: "not-an-id" })).toEqual({
      ok: false,
      error: "teamMemberId: That review was not found. Reload the page.",
    });
    expect(h.teamMemberIdsOf).not.toHaveBeenCalled();
    expect(h.commands.withdrawCycleMember).not.toHaveBeenCalled();
  });
});
