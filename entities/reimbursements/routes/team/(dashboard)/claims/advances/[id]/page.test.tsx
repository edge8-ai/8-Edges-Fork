import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The owner's page, on the two things AD.6 added to it. Nobody tells the person asking
// that their own request waits, so an employer who may decide their own can only reach
// the decision from here. And an id that could not be an advance is not found, rather
// than a database error.
const atoms = vi.hoisted(() => ({ held: ["reimbursements.mine"] as string[] }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async () => ({ personId: "person-a", may: (q: string) => atoms.held.includes(q) }),
}));
vi.mock("@/kernel/identity/may-prop", () => ({ mayProp: () => ({ "reimbursements.mine": true }) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "person-a", teamMemberId: "member-a", displayName: "Avery" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../actions", () => ({ deleteOwnAdvance: async () => ({ ok: true }), moveOwnAdvance: async () => ({ ok: true }), openOwnAdvanceFile: async () => ({ ok: true, url: "" }), reportOwnReturn: async () => ({ ok: true }) }));
const read = vi.hoisted(() => ({ status: "submitted", asked: 0, why: null as string | null }));
vi.mock("@/entities/reimbursements/lib/my-advances", () => ({
  readMyAdvance: async () => {
    read.asked += 1;
    return {
      row: { id: ID_FOR_MOCK, refNo: 7, status: read.status, personId: "person-a", purpose: "Venue deposit", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", settleBy: null, submittedAt: "2026-11-03T02:00:00+00:00", decidedBy: null, balanceVnd: null },
      facts: { reinstatedWhy: read.why, status: read.status, amountVnd: 8_000_000, settleBy: null, spentVnd: null, balanceVnd: null, returnedVnd: 0, claimStatus: null, reason: null, returnReported: false, paidTo: null, paidOutOn: null, approver: "the approver" },
      files: [],
      events: [],
      owedVnd: 0,
      reached: { askedOn: "2026-11-03", approvedBy: null, sentOn: null },
    };
  },
}));
const ID_FOR_MOCK = "22222222-2222-4222-8222-222222222222";
const account = vi.hoisted(() => ({ asked: 0 }));
vi.mock("@/entities/reimbursements/lib/return-account", () => ({
  readReturnAccount: async () => {
    account.asked += 1;
    return { state: "none" };
  },
}));

import AdvancePage from "./page";

const render = async () => renderToStaticMarkup(await AdvancePage({ params: Promise.resolve({ id: ID_FOR_MOCK }) }));
const DECISION = `/team/finance/advances/${ID_FOR_MOCK}/decision`;

beforeEach(() => {
  read.why = null;
  atoms.held = ["reimbursements.mine"];
  read.status = "submitted";
  read.asked = 0;
  account.asked = 0;
});

describe("the way to the decision on your own advance", () => {
  it("is there for someone who approves and may decide their own, while it waits", async () => {
    atoms.held = ["reimbursements.mine", "reimbursements.approve", "reimbursements.decide-own"];
    expect(await render()).toContain(DECISION);
  });

  it("is not there for an approver without the exemption, who would only be refused", async () => {
    atoms.held = ["reimbursements.mine", "reimbursements.approve"];
    expect(await render()).not.toContain(DECISION);
  });

  it("is not there for someone with the exemption who does not approve", async () => {
    atoms.held = ["reimbursements.mine", "reimbursements.decide-own"];
    expect(await render()).not.toContain(DECISION);
  });

  it("is gone once nothing waits", async () => {
    atoms.held = ["reimbursements.mine", "reimbursements.approve", "reimbursements.decide-own"];
    read.status = "approved";
    expect(await render()).not.toContain(DECISION);
  });
});

describe("an id that could not be an advance", () => {
  it("answers not found without reading", async () => {
    await expect(AdvancePage({ params: Promise.resolve({ id: "not-a-uuid" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(read.asked).toBe(0);
  });
});

// AD.13: the company's account is read only for someone who owes it money.
describe("the company's account on the return panel", () => {
  it("is read and shown while money is owed", async () => {
    read.status = "to_return";
    expect(await render()).toContain("Ask Finance for the account.");
    expect(account.asked).toBe(1);
  });

  it("lets the owner cancel a put-back advance if the money never arrived", async () => {
    read.status = "approved";
    read.why = "It went at 09:40.";
    const html = await render();
    expect(html).toContain("Back on");
    expect(html).toContain("If the money never reached you");
    expect(html).toContain("I don&#x27;t need it any more");
  });

  // The review of AD.16's put-back: the badge stayed "Back on" through the payout and beyond.
  it("stops saying Back on once the transfer is recorded", async () => {
    read.status = "paid_out";
    read.why = "It went at 09:40.";
    expect(await render()).not.toContain("Back on");
  });

  it("is not read otherwise", async () => {
    read.status = "paid_out";
    expect(await render()).not.toContain("Bank and account");
    expect(account.asked).toBe(0);
  });
});
