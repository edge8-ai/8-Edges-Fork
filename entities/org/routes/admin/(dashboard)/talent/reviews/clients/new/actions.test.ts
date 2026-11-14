import { beforeEach, describe, expect, it, vi } from "vitest";

// CR.2.5: opening a cycle from the screen refuses a person without the
// reviews permission before anything else, parses its input next, and opens
// as the signed-in person, never as anyone the input names.
const h = vi.hoisted(() => ({
  allowed: { value: true },
  opened: vi.fn(async (_input: unknown, _by: unknown) => ({ ok: true as const, cycleId: "cyc", reused: false })),
}));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async () => {
    if (!h.allowed.value) throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    return { personId: "99999999-9999-4999-8999-999999999999", user: { email: "owner@example.com" } };
  },
}));
vi.mock("@/entities/org/lib/client-reviews/access", () => ({ teamMemberIdsOf: async () => ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] }));
vi.mock("@/entities/org/lib/client-reviews/proposal", () => ({ openCycleForClient: (input: unknown, by: unknown) => h.opened(input, by) }));

import { openCycleAction } from "./actions";

const input = {
  companyId: "11111111-1111-4111-8111-111111111111",
  frameworkId: "22222222-2222-4222-8222-222222222222",
  name: "November 2026",
  skipManagerPersonId: null,
  members: [{ teamMemberId: "55555555-5555-4555-8555-555555555555", clientManagerPersonId: null }],
};

beforeEach(() => {
  h.allowed.value = true;
  h.opened.mockClear();
});

describe("openCycleAction", () => {
  it("refuses a person without the reviews permission", async () => {
    h.allowed.value = false;
    await expect(openCycleAction(input)).rejects.toThrow();
    expect(h.opened).not.toHaveBeenCalled();
  });

  it("refuses a list with nobody ticked, in the schema's words", async () => {
    expect(await openCycleAction({ ...input, members: [] })).toEqual({ ok: false, error: "members: Tick at least one person to review." });
    expect(h.opened).not.toHaveBeenCalled();
  });

  it("opens as the signed-in person, with their team member id", async () => {
    expect(await openCycleAction(input)).toEqual({ ok: true, cycleId: "cyc", reused: false });
    expect(h.opened).toHaveBeenCalledWith(input, { personId: "99999999-9999-4999-8999-999999999999", ownTeamMemberIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
  });
});
