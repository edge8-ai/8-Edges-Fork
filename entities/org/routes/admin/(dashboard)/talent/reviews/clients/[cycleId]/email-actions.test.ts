import { beforeEach, describe, expect, it, vi } from "vitest";

// CR.5.4: each "Email the members" action refuses a person without the
// reviews permission before it reads anything, parses its input next, and
// only then calls its command as the signed-in person.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true as const, outcome: "saved" as const });
  return {
    allowed: { value: true },
    personId: { value: "99999999-9999-4999-8999-999999999999" as string | null },
    asked: [] as string[],
    commands: { chooseMemberEmail: vi.fn(ok), clearMemberEmail: vi.fn(ok), markMemberEmailSent: vi.fn(ok) },
  };
});

vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    h.asked.push(p);
    // The real guard throws (a 403 or a redirect to sign in); it never returns a refusal.
    if (!h.allowed.value) throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    return { personId: h.personId.value, user: { email: "owner@example.com" } };
  },
}));
vi.mock("@/entities/org/lib/client-reviews/member-email", () => h.commands);

import { chooseMemberEmailAction, clearMemberEmailAction, markMemberEmailSentAction } from "./email-actions";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const NONE = { mode: null, scheduledAt: null };
const BY = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com" };

const ACTIONS: Array<[string, () => Promise<unknown>, keyof typeof h.commands]> = [
  ["choose", () => chooseMemberEmailAction({ cycleId: CYCLE, expected: NONE, pick: { how: "scheduled", date: "2026-11-18", time: null } }), "chooseMemberEmail"],
  ["don't send it", () => clearMemberEmailAction({ cycleId: CYCLE, expected: { mode: "scheduled", scheduledAt: "2026-11-18T14:00:00+00:00" } }), "clearMemberEmail"],
  ["mark as sent", () => markMemberEmailSentAction({ cycleId: CYCLE }), "markMemberEmailSent"],
];

beforeEach(() => {
  h.allowed.value = true;
  h.personId.value = BY.personId;
  h.asked.length = 0;
  for (const c of Object.values(h.commands)) c.mockClear();
});

describe.each(ACTIONS)("the %s action", (_name, run, command) => {
  it("refuses a person without the reviews permission before anything else", async () => {
    h.allowed.value = false;
    await expect(run()).rejects.toThrow();
    expect(h.asked).toEqual(["org.reviews"]);
    expect(h.commands[command]).not.toHaveBeenCalled();
  });

  it("acts as the signed-in person", async () => {
    expect(await run()).toEqual({ ok: true, outcome: "saved" });
    expect((h.commands[command].mock.calls[0] as unknown[]).at(-1)).toEqual(BY);
  });

  it("refuses a sign-in with no person record, which could not be recorded", async () => {
    h.personId.value = null;
    expect(await run()).toMatchObject({ ok: false });
    expect(h.commands[command]).not.toHaveBeenCalled();
  });
});

describe("input that does not parse", () => {
  it("is refused with the schema's words, before a command runs", async () => {
    expect(await chooseMemberEmailAction({ cycleId: "not-an-id", expected: NONE, pick: { how: "now" } })).toEqual({ ok: false, error: "cycleId: That cycle was not found. Reload the page." });
    expect(await chooseMemberEmailAction({ cycleId: CYCLE, expected: NONE, pick: { how: "scheduled", date: "2026-11-18", time: "9am" } })).toEqual({ ok: false, error: "pick.time: Pick a time, or leave it blank." });
    expect(h.commands.chooseMemberEmail).not.toHaveBeenCalled();
  });

  it("passes the pick and the plan the page showed to the command", async () => {
    await chooseMemberEmailAction({ cycleId: CYCLE, expected: NONE, pick: { how: "now" } });
    expect(h.commands.chooseMemberEmail).toHaveBeenCalledWith(CYCLE, { how: "now" }, NONE, BY);
  });
});
