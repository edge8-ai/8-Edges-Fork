import { beforeEach, describe, expect, it, vi } from "vitest";

const holders = vi.hoisted(() => ({ ids: [] as string[], fails: false }));
vi.mock("@/kernel/identity/people-holding", () => ({
  peopleHolding: async () => {
    if (holders.fails) throw new Error("down");
    return holders.ids;
  },
}));

import { ownerIsOnlyOtherPayer, payoutRefusalFor, reinstateRefusalFor } from "./advance-payers";

const advance = { personId: "owner", decidedBy: "approver" };

beforeEach(() => {
  holders.fails = false;
  holders.ids = ["approver", "owner"];
});

describe("ownerIsOnlyOtherPayer", () => {
  it("is true when the owner is the one payer left", async () => {
    expect(await ownerIsOnlyOtherPayer("owner", "approver")).toBe(true);
  });

  it("is false when someone else could record it, or the owner is no payer at all", async () => {
    holders.ids = ["approver", "owner", "third"];
    expect(await ownerIsOnlyOtherPayer("owner", "approver")).toBe(false);
    holders.ids = ["approver", "third"];
    expect(await ownerIsOnlyOtherPayer("owner", "approver")).toBe(false);
    holders.ids = ["approver"];
    expect(await ownerIsOnlyOtherPayer("owner", "approver")).toBe(false);
  });

  it("answers no when the read fails, so the stricter rule stands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holders.fails = true;
    expect(await ownerIsOnlyOtherPayer("owner", "approver")).toBe(false);
  });
});

describe("reinstateRefusalFor", () => {
  it("follows the payout's rules, in the words of putting it back", async () => {
    holders.ids = ["approver", "owner", "third"];
    expect(await reinstateRefusalFor(advance, { personId: "approver" })).toMatch(/puts it back/);
    expect(await reinstateRefusalFor(advance, { personId: "owner" })).toMatch(/your own advance.*puts it back/);
    expect(await reinstateRefusalFor(advance, { personId: "third" })).toBeNull();
    expect(await reinstateRefusalFor(advance, { personId: null })).toMatch(/person/);
  });
});

describe("payoutRefusalFor", () => {
  it("lets the approver record it when nobody else could", async () => {
    expect(await payoutRefusalFor(advance, { personId: "approver" })).toBeNull();
  });

  it("keeps the approver out when a third payer exists", async () => {
    holders.ids = ["approver", "owner", "third"];
    expect(await payoutRefusalFor(advance, { personId: "approver" })).toMatch(/someone else/);
  });

  it("never lets anyone record their own money, even someone who approved their own", async () => {
    expect(await payoutRefusalFor(advance, { personId: "owner" })).toMatch(/your own advance/);
    holders.ids = ["owner", "other"];
    expect(await payoutRefusalFor({ personId: "owner", decidedBy: "owner" }, { personId: "owner" })).toMatch(/your own advance/);
  });

  it("still needs a person", async () => {
    expect(await payoutRefusalFor(advance, { personId: null })).toMatch(/person/);
  });

  it("does not ask who else can pay when nothing refused it", async () => {
    holders.fails = true;
    expect(await payoutRefusalFor(advance, { personId: "third" })).toBeNull();
  });
});
