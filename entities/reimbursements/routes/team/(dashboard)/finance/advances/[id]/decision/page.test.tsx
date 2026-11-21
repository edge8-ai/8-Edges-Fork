import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The approver's page. What it must never do is offer a decision that the server would
// refuse, or hide one that is theirs to make. The read and the action are tested beside
// their own code; here the question is what each kind of viewer sees in each state.
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-d" as string | null, decidesOwn: false }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { personId: viewer.personId, user: { email: "approver@test" }, may: (q: string) => q === "reimbursements.approve" || (q === "reimbursements.decide-own" && viewer.decidesOwn) };
  },
}));
vi.mock("@/kernel/identity/may-prop", () => ({ mayProp: () => ({ "reimbursements.approve": true }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("./actions", () => ({ decideAdvance: async () => ({ ok: true }), openAdvanceFileToDecide: async () => ({ ok: true, url: "" }) }));
const read = vi.hoisted(() => ({ advance: null as unknown, asked: 0 }));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({
  readAdvanceForDecision: async () => {
    read.asked += 1;
    return read.advance;
  },
}));

const payers = vi.hoisted(() => ({ ownerIsOnlyOther: false }));
vi.mock("@/entities/reimbursements/lib/advance-payers", () => ({ ownerIsOnlyOtherPayer: async () => payers.ownerIsOnlyOther }));

import AdvanceDecisionPage from "./page";

const ID = "22222222-2222-4222-8222-222222222222";
const advance = (over: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  row: { id: ID, refNo: 7, status: "submitted", personId: "person-a", purpose: "Venue deposit", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", settleBy: null, submittedAt: "2026-11-03T02:00:00+00:00", decidedBy: null, balanceVnd: null, ...over },
  ownerName: "Avery Example",
  tripName: null,
  evidence: [{ id: "f1", filename: "quote.pdf", kind: "evidence", mimeType: "application/pdf", replaced: false, url: "https://signed/1" }],
  events: [],
  checks: [{ holds: true, text: "No other open advance." }, { holds: false, text: "No bank details on file, so Finance has nowhere to send it." }],
  ...more,
});

const render = async () => renderToStaticMarkup(await AdvanceDecisionPage({ params: Promise.resolve({ id: ID }) }));

beforeEach(() => {
  asked.length = 0;
  viewer.personId = "person-d";
  viewer.decidesOwn = false;
  read.advance = advance();
  read.asked = 0;
  payers.ownerIsOnlyOther = false;
});

// #2526: with two payers, the other one's own advance is recorded by its approver, and the
// email says so. The hint under Approve said nobody who approves may record it.
describe("who transfers it once approved", () => {
  it("says Finance does, and the approver cannot, in the ordinary case", async () => {
    const html = await render();
    expect(html).toContain("Approved, Finance transfers it.");
    expect(html).not.toContain("you transfer it yourself");
  });

  it("says the approver does, when the asker is the only other payer", async () => {
    payers.ownerIsOnlyOther = true;
    const html = await render();
    expect(html).toContain("Approved, you transfer it yourself, because Avery Example is the only other person who records transfers.");
    expect(html).not.toContain("cannot record its payout");
  });
});

describe("while it waits", () => {
  it("asks for the approver's permission, and says who asks for how much", async () => {
    const html = await render();
    expect(asked).toEqual(["reimbursements.approve"]);
    expect(html).toContain("Avery Example asks for ₫8,000,000");
    expect(html).toContain("ADV-0007");
  });

  it("offers the three moves", async () => {
    const html = await render();
    for (const word of [">Approve<", ">Send back<", ">Reject<"]) expect(html).toContain(word);
  });

  it("says what was checked, and says plainly what did not hold", async () => {
    const html = await render();
    expect(html).toContain("No other open advance.");
    expect(html).toContain("No bank details on file");
    expect(html).toMatch(/adv-tick is-no[^>]*>!/);
  });

  it("does not claim to have compared the quote with the amount, because nothing reads the quote", async () => {
    const html = await render();
    expect(html).not.toMatch(/they match|totals match/);
    expect(html).toContain("nothing here reads the quote for you");
  });

  it("warns when there is nothing attached", async () => {
    read.advance = advance({}, { evidence: [] });
    expect(await render()).toContain("No evidence is attached");
  });

  it("shows a photo inline and leaves a PDF to its button, and marks evidence set aside", async () => {
    read.advance = advance({}, {
      evidence: [
        { id: "f1", filename: "quote.png", kind: "evidence", mimeType: "image/png", replaced: false, url: "https://signed/photo" },
        { id: "f2", filename: "first.pdf", kind: "evidence", mimeType: "application/pdf", replaced: false, url: "https://signed/pdf" },
        { id: "f3", filename: "old.pdf", kind: "evidence", mimeType: "application/pdf", replaced: true, url: "https://signed/old" },
      ],
    });
    const html = await render();
    expect(html).toContain('src="https://signed/photo"');
    expect(html).not.toContain('src="https://signed/pdf"');
    expect(html).toContain("Open first.pdf");
    expect(html).toContain("Set aside by Avery Example");
  });
});

describe("their own advance", () => {
  it("offers no decision to an approver without the exemption, and says who decides", async () => {
    viewer.personId = "person-a";
    const html = await render();
    expect(html).not.toContain(">Approve<");
    expect(html).toContain("someone else decides it");
  });

  it("offers it to the employer, and says that is why", async () => {
    viewer.personId = "person-a";
    viewer.decidesOwn = true;
    const html = await render();
    expect(html).toContain(">Approve<");
    expect(html).toContain("You may decide it as the employer");
  });
});

describe("someone with no person record", () => {
  it("offers no decision and says why", async () => {
    viewer.personId = null;
    const html = await render();
    expect(html).not.toContain(">Approve<");
    expect(html).toContain("no person record");
  });
});

describe("once it no longer waits", () => {
  const event = (move: string) => ({ id: "e1", move, actorName: "Dana Example", reason: null, at: "2026-11-03T03:00:00Z" });

  it.each([
    ["approved", "approve", "Approved by Dana Example"],
    ["paid_out", "approve", "Approved by Dana Example"],
    ["sent_back", "send_back", "Sent back by Dana Example"],
    ["rejected", "reject", "Rejected by Dana Example"],
    ["cancelled", "cancel", "Avery Example cancelled this advance"],
    ["draft", "withdraw", "Avery Example withdrew this request"],
  ])("offers nothing on one that is %s, and says what happened", async (status, move, says) => {
    read.advance = advance({ status }, { events: [event(move)] });
    const html = await render();
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain("Checked for you");
    expect(html).toContain(says);
  });

  it("never tells the approver the money is with them", async () => {
    read.advance = advance({ status: "paid_out" }, { events: [event("approve")] });
    const html = await render();
    expect(html).not.toContain("with you");
    expect(html).toContain("Money with them");
  });
});

describe("what does not exist", () => {
  it("answers not found for an advance there is not", async () => {
    read.advance = null;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers not found for an id that could not be one, without reading", async () => {
    read.advance = advance();
    await expect(AdvanceDecisionPage({ params: Promise.resolve({ id: "not-a-uuid" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(read.asked).toBe(0);
  });
});
