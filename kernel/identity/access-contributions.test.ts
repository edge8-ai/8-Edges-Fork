import { afterEach, describe, expect, it } from "vitest";

import {
  impliedRoles,
  reachIds,
  registerAccessContributions,
  resetAccessContributions,
  type AccessSubject,
} from "@/kernel/identity/access-contributions";

// The facts the kernel may not read itself (who coaches whom, who owns an open
// requisition, who is assigned to which client) are registered by the entities
// that own them, through the composition root. These cases pin the two things
// that keep that safe: nothing registered is an error, never an empty answer,
// and a failed read refuses rather than answering "no".

afterEach(() => resetAccessContributions());

const ana: AccessSubject = { personId: "p-ana", teamMemberId: "tm-ana", isAdmin: false };

describe("access contributions", () => {
  it("refuses to answer before the composition root has registered anything", async () => {
    await expect(impliedRoles(ana)).rejects.toThrow(/not registered/);
    await expect(reachIds(ana, "team")).rejects.toThrow(/not registered/);
  });

  it("answers with no implied role and no reach once registered with none", async () => {
    registerAccessContributions([]);
    expect(await impliedRoles(ana)).toEqual([]);
    expect(await reachIds(ana, "clients")).toEqual([]);
  });

  it("gives each role whose fact holds, with the fact as its reason", async () => {
    registerAccessContributions([
      { impliers: [{ role: "coach", because: "coaches at least one person", holds: async () => true }] },
      { impliers: [{ role: "hiring-manager", because: "owns an open requisition", holds: async () => false }] },
    ]);
    expect(await impliedRoles(ana)).toEqual([{ role: "coach", because: "coaches at least one person" }]);
  });

  it("passes the subject to each fact, so a fact is about the person being resolved", async () => {
    registerAccessContributions([
      { impliers: [{ role: "coach", because: "coaches someone", holds: async (s) => s.teamMemberId === "tm-ana" }] },
    ]);
    expect(await impliedRoles(ana)).toHaveLength(1);
    expect(await impliedRoles({ ...ana, teamMemberId: "tm-bao" })).toHaveLength(0);
  });

  it("refuses when a fact cannot be read, rather than answering no", async () => {
    registerAccessContributions([
      { impliers: [{ role: "coach", because: "coaches someone", holds: async () => { throw new Error("coaching_profiles read failed"); } }] },
    ]);
    await expect(impliedRoles(ana)).rejects.toThrow(/coaching_profiles read failed/);
  });

  it("unions every provider's ids for a scope, without repeats, and only for that scope", async () => {
    registerAccessContributions([
      { reach: [{ scope: "team", ids: async () => ["p-coachee-1", "p-coachee-2"] }] },
      { reach: [{ scope: "team", ids: async () => ["p-coachee-2", "p-report"] }, { scope: "clients", ids: async () => ["c-acme"] }] },
    ]);
    expect((await reachIds(ana, "team")).sort()).toEqual(["p-coachee-1", "p-coachee-2", "p-report"]);
    expect(await reachIds(ana, "clients")).toEqual(["c-acme"]);
  });

  it("replaces what was registered rather than adding to it, since Next may run registration twice", async () => {
    registerAccessContributions([{ impliers: [{ role: "coach", because: "a", holds: async () => true }] }]);
    registerAccessContributions([{ impliers: [{ role: "hiring-manager", because: "b", holds: async () => true }] }]);
    expect((await impliedRoles(ana)).map((r) => r.role)).toEqual(["hiring-manager"]);
  });
});
