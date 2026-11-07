import { describe, expect, it } from "vitest";
import { companyDomain, draftProblems, evidenceHolds, foldEvidence, followupHtml, linkedHosts, matchRecipients, suppliedName, tickScope, wantsFollowupEmail } from "./checks";

// Z.13, the chain's deterministic checks (spec section 5): nothing the model
// returns is trusted on its word.

const READY = { companyId: "c", archivedAt: null, summary: "s", aiStatus: "ready", lifecycleStage: "customer", meetingType: "General", createdAt: "2026-10-09T03:00:00.000Z" };

describe("tickScope (decisions 2 and 3)", () => {
  it("opens a customer's General or Team Ceremony meeting whose summary is ready or written outside the app", () => {
    expect(tickScope(READY)).toEqual({ open: true });
    expect(tickScope({ ...READY, aiStatus: null })).toEqual({ open: true });
    expect(tickScope({ ...READY, meetingType: "Team Ceremony" })).toEqual({ open: true });
  });

  it("leaves Sales, leads, unready summaries, archived and older meetings alone", () => {
    expect(tickScope({ ...READY, meetingType: "Sales" }).open).toBe(false);
    expect(tickScope({ ...READY, lifecycleStage: "opportunity" }).open).toBe(false);
    expect(tickScope({ ...READY, aiStatus: "pending" }).open).toBe(false);
    expect(tickScope({ ...READY, aiStatus: "failed" }).open).toBe(false);
    expect(tickScope({ ...READY, summary: "  " }).open).toBe(false);
    expect(tickScope({ ...READY, archivedAt: "2026-10-09T05:00:00Z" }).open).toBe(false);
    expect(tickScope({ ...READY, companyId: null }).open).toBe(false);
    expect(tickScope({ ...READY, createdAt: "2026-10-08T23:59:59.000Z" }).open).toBe(false);
  });

  it("sends a follow-up email for every type but a Team Ceremony", () => {
    expect(wantsFollowupEmail("General")).toBe(true);
    expect(wantsFollowupEmail(null)).toBe(true);
    expect(wantsFollowupEmail("Team Ceremony")).toBe(false);
  });
});

describe("evidence (test 6)", () => {
  const transcript = foldEvidence("Delivery Lead: We will send you the checklist   for the pilot data by Tuesday.\nClient: Great, thanks.");

  it("holds a quote that is in the transcript, whatever its case, spacing or quote marks", () => {
    expect(evidenceHolds("we will send you the checklist for the pilot data by Tuesday", transcript)).toBe(true);
    expect(evidenceHolds("“We will send you the checklist for the pilot data by Tuesday.”", transcript)).toBe(true);
  });

  it("refuses a quote nobody said, and one too short to mean anything", () => {
    expect(evidenceHolds("Please wire the deposit to the new account today.", transcript)).toBe(false);
    expect(evidenceHolds("thanks", transcript)).toBe(false);
    expect(evidenceHolds(null, transcript)).toBe(false);
  });
});

describe("names", () => {
  it("takes an owner only from the supplied lists, exactly after folding", () => {
    expect(suppliedName("delivery  LEAD", ["Delivery Lead", "Account Owner"])).toBe("Delivery Lead");
    expect(suppliedName("Đức Lead", ["Duc Lead"])).toBe("Duc Lead");
    expect(suppliedName("Deliver Lead", ["Delivery Lead"])).toBeNull();
    expect(suppliedName("the attacker", ["Delivery Lead"])).toBeNull();
  });

  it("matches recipients only among the company's contacts, by an attendee's exact folded name (test 7)", () => {
    const contacts = [
      { personId: "a", names: ["Client Contact One"] },
      { personId: "b", names: ["Client Contact Two", "C. Two"] },
      { personId: "c", names: ["Client Contact Three"] },
    ];
    expect(matchRecipients(["client contact one", "C. Two", "someone@elsewhere.test", "Client Contact"], contacts)).toEqual(["a", "b"]);
  });
});

describe("the draft (test 7)", () => {
  const ok = { subject: "Follow-up: rollout review", bodyMd: "Hi all,\n\n- Send the checklist.\n\nSee https://app.agency.example.test/x and www.example-client.test/plan." };

  it("passes plain prose with links to the client's domain and Edge8's", () => {
    expect(draftProblems(ok, companyDomain("https://www.example-client.test/"), "agency.example.test")).toEqual([]);
    expect(companyDomain("example-client.test")).toBe("example-client.test");
    expect(companyDomain(null)).toBeNull();
  });

  it("refuses an email address and a foreign link", () => {
    expect(draftProblems({ ...ok, bodyMd: "Write to someone@elsewhere.test" }, "example-client.test")[0]).toContain("email address");
    expect(draftProblems({ ...ok, bodyMd: "See https://elsewhere.test/pay" }, "example-client.test")[0]).toContain("elsewhere.test");
    expect(draftProblems({ ...ok, bodyMd: "See https://example-client.test.elsewhere.test" }, "example-client.test")).toHaveLength(1);
    expect(draftProblems({ subject: " ", bodyMd: "" }, null)).toHaveLength(2);
  });

  it("renders the approved Markdown escaped, as paragraphs and lists", () => {
    expect(followupHtml("Hi <team>,\n\nWhat Edge8 will do\n- One\n- Two & three")).toBe("<p>Hi &lt;team&gt;,</p>\n<p>What Edge8 will do</p><ul><li>One</li><li>Two &amp; three</li></ul>");
  });
});

describe("links in any form (review 3)", () => {
  it("finds a scheme, a protocol-relative link, www., and a bare host with a path or a common ending", () => {
    expect(linkedHosts("See https://a.example.test/x, //b.example.test/y, www.c.example.test and acme-billing.io/invoice, or pay at acme-billing.io.").sort()).toEqual(
      ["a.example.test", "acme-billing.io", "b.example.test", "c.example.test"].sort(),
    );
  });

  it("takes no word.word in prose for a link, and no address for one", () => {
    expect(linkedHosts("We moved to Node.js and v2.5; write to a.person@acme-billing.io.")).toEqual([]);
  });

  it("refuses a bare host or a protocol-relative link outside the allowed domains", () => {
    const allowed = (bodyMd: string) => draftProblems({ subject: "Follow-up", bodyMd }, "example-client.test", "agency.example.test");
    expect(allowed("Pay at acme-billing.io/invoice")).toHaveLength(1);
    expect(allowed("Pay at acme-billing.io")).toHaveLength(1);
    expect(allowed("See //acme-billing.io/x")).toHaveLength(1);
    expect(allowed("See portal.example-client.test/plan and agency.example.test/notes")).toEqual([]);
  });

  it("holds a quote that kept the screened transcript's line number", () => {
    expect(evidenceHolds("[L2] We will send you the checklist for the pilot data", foldEvidence("We will send you the checklist for the pilot data by Tuesday."))).toBe(true);
  });
});

