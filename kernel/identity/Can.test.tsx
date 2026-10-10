import { beforeEach, describe, expect, it, vi } from "vitest";

// The hidden-control primitives (ADR 0014): <Can> on the server, the `may` prop
// for client components. Both answer from the access object, both fail closed.
let held: { permission: string; person?: string }[] = [];
let signedIn = true;
vi.mock("@/kernel/identity/access-request", () => ({
  getAccess: async () =>
    signedIn
      ? {
          may: (p: string, target?: { person?: string }) =>
            held.some((h) => h.permission === p && (!target?.person || !h.person || h.person === target.person)),
        }
      : null,
}));

import { Can } from "./Can";
import { mayProp } from "./may-prop";

beforeEach(() => {
  held = [];
  signedIn = true;
});

describe("<Can>", () => {
  it("renders its children for a holder of the atom", async () => {
    held = [{ permission: "marketing.campaigns.manage" }];
    expect(await Can({ permission: "marketing.campaigns.manage", children: "Publish" })).toBe("Publish");
  });

  it("renders the fallback, nothing by default, for someone without it", async () => {
    held = [{ permission: "marketing.campaigns.view" }];
    expect(await Can({ permission: "marketing.campaigns.manage", children: "Publish" })).toBeNull();
    expect(await Can({ permission: "marketing.campaigns.manage", children: "Publish", fallback: "Read only" })).toBe("Read only");
  });

  it("asks at the target's reach", async () => {
    held = [{ permission: "people.pay", person: "p-ana" }];
    expect(await Can({ permission: "people.pay", target: { person: "p-ana" }, children: "Salary" })).toBe("Salary");
    expect(await Can({ permission: "people.pay", target: { person: "p-bao" }, children: "Salary" })).toBeNull();
  });

  it("renders nothing for nobody signed in", async () => {
    signedIn = false;
    expect(await Can({ permission: "surface.admin", children: "Admin" })).toBeNull();
  });
});

describe("mayProp", () => {
  it("answers each named atom from the access object", () => {
    const access = { may: (p: string) => p === "a.view" };
    expect(mayProp(access, ["a.view", "a.manage"])).toEqual({ "a.view": true, "a.manage": false });
  });

  it("answers no to every atom when there is no access object", () => {
    expect(mayProp(null, ["a.view"])).toEqual({ "a.view": false });
  });
});
