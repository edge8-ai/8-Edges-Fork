import { describe, expect, it, vi } from "vitest";

// The module reaches the database through its imports; the token functions
// never touch it, so the client is stubbed to keep the import side-effect free.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {}, supabase: {}, htt: {} }));

process.env.PROPOSAL_ACCEPT_SECRET = "test-secret-not-a-real-one";
const { proposalAcceptToken, verifyProposalAcceptToken } = await import("./proposal-accept");

const DEAL = "7f3c0922-18e5-4427-8c35-123f13eb8a7b";

describe("proposal accept tokens", () => {
  it("verifies a token signed for a deal, and returns that deal", () => {
    const token = proposalAcceptToken(DEAL);
    expect(token).not.toBeNull();
    expect(verifyProposalAcceptToken(token as string)).toBe(DEAL);
  });

  it("refuses a token pointed at another deal", () => {
    const sig = (proposalAcceptToken(DEAL) as string).split(".")[1];
    expect(verifyProposalAcceptToken(`00000000-0000-4000-8000-000000000000.${sig}`)).toBeNull();
  });

  it("refuses a tampered or malformed token", () => {
    expect(verifyProposalAcceptToken(`${DEAL}.not-the-signature`)).toBeNull();
    expect(verifyProposalAcceptToken("no-dot")).toBeNull();
    expect(verifyProposalAcceptToken("not-a-uuid.abc")).toBeNull();
  });

  it("refuses every token when the secret is missing, rather than accepting unsigned ones", () => {
    const token = proposalAcceptToken(DEAL) as string;
    const saved = process.env.PROPOSAL_ACCEPT_SECRET;
    delete process.env.PROPOSAL_ACCEPT_SECRET;
    try {
      expect(verifyProposalAcceptToken(token)).toBeNull();
      expect(proposalAcceptToken(DEAL)).toBeNull();
    } finally {
      process.env.PROPOSAL_ACCEPT_SECRET = saved;
    }
  });
});
