import { beforeEach, describe, expect, it, vi } from "vitest";

// A.22: portal status used to leave this module as two pieces — a read that
// returns the set of auth ids that have signed in, and a pure mapper from an id
// plus that set to a status. All four callers wired the same two steps together,
// and one of them hand-rolled the "this person has no auth account, so do not
// call the admin API" case. These cover the one question that replaced them.

const listUsers = vi.fn();
vi.mock("@/kernel/data/supabase", () => ({
  supabase: { auth: { admin: { listUsers: (...a: unknown[]) => listUsers(...a) } } },
}));

const { portalStatusesFor } = await import("./portal-status");

const user = (id: string, signedIn: boolean) => ({ id, last_sign_in_at: signedIn ? "2026-09-01T00:00:00Z" : null });

beforeEach(() => {
  listUsers.mockReset();
  listUsers.mockResolvedValue({
    data: { users: [user("auth-signed", true), user("auth-invited", false)] },
    error: null,
  });
});

describe("portalStatusesFor", () => {
  it("calls somebody who has signed in active, and somebody who has not invited", async () => {
    const statusOf = await portalStatusesFor(["auth-signed", "auth-invited"]);
    expect(statusOf("auth-signed")).toBe("active");
    expect(statusOf("auth-invited")).toBe("invited");
  });

  it("calls a person with no auth account none, however the id arrives", async () => {
    const statusOf = await portalStatusesFor([null, undefined, ""]);
    expect(statusOf(null)).toBe("none");
    expect(statusOf(undefined)).toBe("none");
    expect(statusOf("")).toBe("none");
  });

  it("never asks the auth service when nobody in the list has an account", async () => {
    // The optimisation one call site used to hand-roll with a ternary and a
    // Promise.resolve(new Set()). Listing users is a service-role round trip.
    await portalStatusesFor([null, undefined]);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("asks once for the whole list, not once per person", async () => {
    await portalStatusesFor(["auth-signed", "auth-invited", null]);
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("treats an id the auth service never mentions as invited, not active", async () => {
    // A linked account the listing does not return has not been seen signing in,
    // and the safe reading of that is "invited".
    const statusOf = await portalStatusesFor(["auth-unknown"]);
    expect(statusOf("auth-unknown")).toBe("invited");
  });

  it("answers a mixed list, which is what every call site actually holds", async () => {
    // A roster is never all-linked or all-unlinked; one lookup has to be right
    // about both kinds at once.
    const statusOf = await portalStatusesFor(["auth-signed", null, "auth-invited", undefined]);
    expect([statusOf("auth-signed"), statusOf(null), statusOf("auth-invited"), statusOf(undefined)]).toEqual([
      "active",
      "none",
      "invited",
      "none",
    ]);
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("gives every caller the same answer for the same person", async () => {
    // The whole point: four call sites, one composition.
    const a = await portalStatusesFor(["auth-signed"]);
    const b = await portalStatusesFor(["auth-signed", "auth-invited"]);
    expect(a("auth-signed")).toBe(b("auth-signed"));
  });
});
