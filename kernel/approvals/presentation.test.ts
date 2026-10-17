import { describe, expect, it } from "vitest";
import { APPROVAL_SUBJECTS, isApprovalSubject, type ApprovalSubject } from "./vocabulary";
import { approvalFacts, askerFor, ctaFor, decideHrefs, tierChip, tierOf } from "./presentation";

// Z.2.1. Every subject says how it is shown: its tier, its chip, where it is
// decided and what its link says. A subject decided nowhere a list can link to,
// or whose metadata lacks the id its page needs, gets no link, never a guess.
const ID = "3f1c2a90-7d4e-4b8a-9c0f-1e2d3c4b5a69";
const DEAL = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const at = (subjectType: ApprovalSubject, metadata: Record<string, unknown> = {}, subjectId = ID) => ({ subjectType, subjectId, metadata });

describe("the vocabulary", () => {
  it("has the two agents' draft words (Y.16, Y.17)", () => {
    expect(APPROVAL_SUBJECTS.campaign_publish).toBe("Writer draft: publish");
    expect(APPROVAL_SUBJECTS.letter_send).toBe("Letter: send");
  });
});

describe("tiers", () => {
  it("puts what is public, to many people or a commitment at Tier 2, one outside party at Tier 1, the rest internal", () => {
    const byTier = (t: number) => (Object.keys(APPROVAL_SUBJECTS) as ApprovalSubject[]).filter((s) => tierOf(s) === t).sort();
    expect(byTier(2)).toEqual(["agreement_client_signature", "agreement_edge8_signature", "campaign_publish", "contractor_estimate", "contractor_work", "hiring_hire", "hiring_requisition", "letter_send", "proposal_publish"]);
    expect(byTier(1)).toEqual(["hiring_message", "hiring_reject", "meeting_followup"]);
    expect(byTier(0)).toEqual(["assistant_action", "hiring_shortlist", "reimbursement_approval", "reimbursement_check", "time_off"]);
  });

  it("words the chip with what the decision reaches", () => {
    expect(tierChip(at("campaign_publish"))).toBe("Tier 2 · public");
    expect(tierChip(at("letter_send", { recipients: 412 }))).toBe("Tier 2 · 412 recipients");
    expect(tierChip(at("letter_send"))).toBe("Tier 2 · many people");
    expect(tierChip(at("agreement_edge8_signature"))).toBe("Tier 2 · commitment");
    expect(tierChip(at("reimbursement_check"))).toBe("Internal");
  });
});

describe("the weekly client status (Z.12.1)", () => {
  it("is no approval subject: the account owner shares the draft, so nothing waits on anyone", () => {
    expect(Object.keys(APPROVAL_SUBJECTS)).not.toContain("client_status_report");
    expect(Object.keys(APPROVAL_SUBJECTS)).not.toContain("client_status_page");
    expect(isApprovalSubject("client_status_report")).toBe(false);
    expect(isApprovalSubject("client_status_page")).toBe(false);
  });
});

describe("decideHrefs", () => {
  it("names where each subject is decided, the list's own surface first", () => {
    expect(decideHrefs(at("reimbursement_check"), "team")).toEqual([`/team/finance/claims/${ID}`, `/admin/finance/reimbursements/${ID}`]);
    expect(decideHrefs(at("reimbursement_check"), "admin")).toEqual([`/admin/finance/reimbursements/${ID}`, `/team/finance/claims/${ID}`]);
    expect(decideHrefs(at("reimbursement_approval"), "team")).toEqual([`/admin/finance/reimbursements/${ID}`, "/admin/finance/reimbursements/to-approve"]);
    expect(decideHrefs(at("time_off"), "team")).toEqual(["/admin/operations/time-off/requests"]);
    expect(decideHrefs(at("contractor_estimate"), "admin")).toEqual(["/admin/operations/contractor-requests"]);
    expect(decideHrefs(at("contractor_work"), "admin")).toEqual(["/admin/operations/contractor-requests"]);
    expect(decideHrefs(at("agreement_edge8_signature", { dealId: DEAL }), "team")).toEqual([`/team/revenue/deals/${DEAL}`, `/admin/revenue/deals/${DEAL}`]);
    expect(decideHrefs(at("agreement_client_signature"), "team")).toEqual([`/portal/agreements/${ID}`]);
    expect(decideHrefs(at("campaign_publish"), "team")).toEqual([`/team/revenue/marketing/campaigns/${ID}`, `/admin/revenue/marketing/campaigns/${ID}`]);
    expect(decideHrefs(at("letter_send"), "admin")).toEqual([`/admin/revenue/marketing/broadcasts/${ID}`, `/team/revenue/marketing/broadcasts/${ID}`]);
  });

  it("links nowhere for a subject decided where no list can link, or one missing the id its page needs", () => {
    expect(decideHrefs(at("assistant_action"), "admin")).toEqual([]);
    expect(decideHrefs(at("agreement_edge8_signature"), "admin")).toEqual([]);
    expect(decideHrefs(at("campaign_publish", {}, ""), "team")).toEqual([]);
  });

  it("refuses an id that would change the path's shape rather than splice it in", () => {
    expect(decideHrefs(at("letter_send", {}, "../../admin/settings"), "team")).toEqual([]);
    expect(decideHrefs(at("agreement_edge8_signature", { dealId: "x?y=1" }), "admin")).toEqual([]);
    expect(decideHrefs(at("reimbursement_approval", {}, "a/b"), "admin")).toEqual(["/admin/finance/reimbursements/to-approve"]);
  });

  it("sends each hiring subject to the page it is decided on (Z.9)", () => {
    expect(tierChip(at("hiring_requisition", { reach: "public" }))).toBe("Tier 2 · public");
    expect(tierChip(at("hiring_requisition"))).toBe("Tier 2 · commitment");
    expect(tierChip(at("hiring_hire"))).toBe("Tier 2 · commitment");
    expect(tierChip(at("hiring_reject"))).toBe("Tier 1 · one candidate");
    expect(tierChip(at("hiring_message"))).toBe("Tier 1 · one candidate");
    expect(tierChip(at("hiring_shortlist"))).toBe("Internal");
    expect(decideHrefs(at("hiring_requisition"), "team")).toEqual([`/admin/talent/jobs/${ID}`]);
    expect(decideHrefs(at("hiring_shortlist", { requisitionId: DEAL }), "admin")).toEqual([`/admin/talent/jobs/${DEAL}#shortlist`]);
    expect(decideHrefs(at("hiring_shortlist"), "admin")).toEqual([]);
    expect(decideHrefs(at("hiring_message", { applicationId: DEAL }), "admin")).toEqual([`/admin/talent/applications/${DEAL}`]);
    expect(decideHrefs(at("hiring_hire"), "team")).toEqual([`/admin/talent/applications/${ID}`]);
    expect(decideHrefs(at("hiring_reject"), "admin")).toEqual([`/admin/talent/applications/${ID}`]);
    expect(askerFor("hiring_message")).toBe("The hiring chain");
    expect(askerFor("hiring_hire")).toBeNull();
  });

  it("gives every subject with a page a link word, and every routine-opened one an asker", () => {
    for (const s of Object.keys(APPROVAL_SUBJECTS) as ApprovalSubject[]) expect(ctaFor(s)).not.toBe("");
    expect(askerFor("campaign_publish")).toBe("The writer agent");
    expect(askerFor("letter_send")).toBe("The letter agent");
    expect(askerFor("time_off")).toBeNull();
  });
});

describe("approvalFacts", () => {
  it("reads the facts an agent draft carries, and says what happens if nobody decides", () => {
    const facts = approvalFacts(at("letter_send", { version: "7be09d4", recipients: 412, sendWindow: "Mon 08:00", run: "letter · ready" }));
    expect(facts).toEqual([
      { label: "Version you would approve", value: "7be09d4 (an edit needs a new approval)" },
      { label: "Recipients", value: "412" },
      { label: "Send window", value: "Mon 08:00" },
      { label: "Run", value: "letter · ready" },
      { label: "If nobody decides", value: "It waits. Nothing here is approved on a timeout." },
    ]);
  });

  it("leaves out a fact the metadata does not carry, and takes a flow's own escalation rule when it states one", () => {
    expect(approvalFacts(at("campaign_publish", { ifNobodyDecides: "The backup is asked at the next morning brief." }))).toEqual([
      { label: "If nobody decides", value: "The backup is asked at the next morning brief." },
    ]);
  });

  it("reads a hiring shortlist's round and lanes, and says nothing leaves on it", () => {
    const facts = approvalFacts(at("hiring_shortlist", { round: 2, advance: 3, decline: 1, hold: 2 }));
    expect(facts).toContainEqual({ label: "Round", value: "2" });
    expect(facts).toContainEqual({ label: "Lanes", value: "3 to advance, 1 to decline, 2 held" });
    expect(facts).toContainEqual({ label: "Nothing leaves", value: "Each invitation and decline it leads to is its own approval" });
  });

  it("reads an agreement's client and value", () => {
    const facts = approvalFacts(at("agreement_edge8_signature", { companyName: "Example Co", fee: { cents: 1250000, currency: "usd" } }));
    expect(facts).toContainEqual({ label: "Signs for", value: "Edge8" });
    expect(facts).toContainEqual({ label: "Client", value: "Example Co" });
    expect(facts).toContainEqual({ label: "Value", value: "$12,500" });
  });
});

// Z.10. A proposal the chain drafted is a Tier 2 commitment, decided on the
// review page (team first on the team list, admin first on the admin list),
// and its row names the client, the value and the call.
describe("proposal_publish", () => {
  it("is a Tier 2 commitment the proposal chain asks for", () => {
    expect(APPROVAL_SUBJECTS.proposal_publish).toBe("Proposal: publish");
    expect(tierChip(at("proposal_publish"))).toBe("Tier 2 · commitment");
    expect(askerFor("proposal_publish")).toBe("The proposal chain");
    expect(ctaFor("proposal_publish")).toBe("Review the proposal");
  });

  it("links to the review page on both surfaces", () => {
    expect(decideHrefs(at("proposal_publish"), "team")).toEqual([`/team/revenue/proposals/${ID}`, `/admin/revenue/proposals/${ID}`]);
    expect(decideHrefs(at("proposal_publish"), "admin")).toEqual([`/admin/revenue/proposals/${ID}`, `/team/revenue/proposals/${ID}`]);
    expect(decideHrefs(at("proposal_publish", {}, "../x"), "team")).toEqual([]);
  });

  it("shows Client, Value and Call", () => {
    const facts = approvalFacts(at("proposal_publish", { companyName: "Example Co", amountCents: 240000, currency: "usd", meetingTitle: "Discovery call" }));
    expect(facts).toContainEqual({ label: "Client", value: "Example Co" });
    expect(facts).toContainEqual({ label: "Value", value: "$2,400" });
    expect(facts).toContainEqual({ label: "Call", value: "Discovery call" });
  });
});

// Z.13: the meeting follow-up is one email to the people at one client, so Tier
// 1 however many of them it names, decided on the meeting's page, which comes
// from the meeting id the run stored rather than the run's own row id.
describe("meeting_followup", () => {
  const MEETING = "5c4b3a29-1d0e-4f9a-8b7c-6d5e4f3a2b1c";

  it("chips Tier 1 with how many people at the one client", () => {
    expect(tierOf("meeting_followup")).toBe(1);
    expect(tierChip(at("meeting_followup", { recipients: 3 }))).toBe("Tier 1 · 3 people at one client");
    expect(tierChip(at("meeting_followup", { recipients: 1 }))).toBe("Tier 1 · one person at one client");
    expect(tierChip(at("meeting_followup"))).toBe("Tier 1 · one client");
  });

  it("links the meeting page from metadata.meetingId, the list's own surface first", () => {
    expect(decideHrefs(at("meeting_followup", { meetingId: MEETING }), "team")).toEqual([`/team/revenue/meetings/${MEETING}`, `/admin/revenue/meetings/${MEETING}`]);
    expect(decideHrefs(at("meeting_followup", { meetingId: MEETING }), "admin")).toEqual([`/admin/revenue/meetings/${MEETING}`, `/team/revenue/meetings/${MEETING}`]);
    expect(ctaFor("meeting_followup")).toBe("Read the follow-up");
    expect(askerFor("meeting_followup")).toBe("The meeting follow-up chain");
  });

  it("gives no link for a missing or malformed meeting id, never one built from the run's own id", () => {
    expect(decideHrefs(at("meeting_followup"), "team")).toEqual([]);
    expect(decideHrefs(at("meeting_followup", { meetingId: "../../admin/settings" }), "team")).toEqual([]);
    expect(decideHrefs(at("meeting_followup", { meetingId: 42 }), "admin")).toEqual([]);
  });

  it("reads the client, the meeting date and the cards filed, and says the draft expires unsent", () => {
    const facts = approvalFacts(
      at("meeting_followup", { version: "a1b2c3d4e5f6", recipients: 2, companyName: "Example Co", meetingDate: "8 Oct 2026", cardsFiled: 4, ifNobodyDecides: "It expires unsent after 7 days." }),
    );
    expect(facts).toContainEqual({ label: "Client", value: "Example Co" });
    expect(facts).toContainEqual({ label: "Meeting date", value: "8 Oct 2026" });
    expect(facts).toContainEqual({ label: "Cards filed", value: "4" });
    expect(facts).toContainEqual({ label: "Recipients", value: "2" });
    expect(facts.at(-1)).toEqual({ label: "If nobody decides", value: "It expires unsent after 7 days." });
  });
});
