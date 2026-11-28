import { describe, expect, it, vi } from "vitest";
import type { RequestAccess } from "@/kernel/identity/access-request";
import type { WaitingApprovalRow } from "./waiting-approvals";

// Admin Home's buttons (AH.5): a row gets an act, and a claim its amount, only
// for a reader who holds that action's own permission; without it nothing is
// read and the row stays a link (home-acts.ts).
const reads = vi.hoisted(() => ({ check: 0, approve: 0, drafts: 0 }));
const claim = { id: "c1", title: "Pads", ownerName: "A", submittedAt: "2026-11-01T00:00:00Z", receipts: 1, declined: 0, totalVnd: 2_400_000, ratePending: 0, stageAt: null, flagged: 0 };
vi.mock("@/entities/reimbursements", () => ({
  listClaimsToCheck: async () => (reads.check++, [claim]),
  listClaimsToApprove: async () => (reads.approve++, [claim]),
}));
vi.mock("@/entities/campaigns", () => ({ publishApprovalView: async () => (reads.drafts++, { pendingVersion: "abcdefabcdef", currentVersion: "abcdefabcdef" }) }));

const { approvalActs } = await import("./home-acts");

const rows: WaitingApprovalRow[] = [
  { id: "a1", label: "Check claim: Pads", kind: "Reimbursement: check", createdAt: "", href: "/c", subjectType: "reimbursement_check", subjectId: "c1" },
  { id: "a2", label: "Approve claim: Pads", kind: "Reimbursement: approval", createdAt: "", href: "/c", subjectType: "reimbursement_approval", subjectId: "c1" },
  { id: "a3", label: "Publish", kind: "Writer draft: publish", createdAt: "", href: "/w", subjectType: "campaign_publish", subjectId: "camp1" },
];
const reader = (held: string[]) => ({ personId: "p1", may: (atom: string) => held.includes(atom) }) as unknown as RequestAccess;

describe("approvalActs", () => {
  it("gives no act and reads nothing for a reader without the actions' permissions", async () => {
    reads.check = reads.approve = reads.drafts = 0;
    expect((await approvalActs(rows, reader([]))).size).toBe(0);
    expect(reads).toEqual({ check: 0, approve: 0, drafts: 0 });
  });

  it("gives each act only for the permission the reader holds", async () => {
    const acts = await approvalActs(rows, reader(["reimbursements.check"]));
    expect(acts.get("a1")).toEqual({ act: { kind: "claim", stage: "check", claimId: "c1", mark: { submittedAt: claim.submittedAt, totalVnd: 2_400_000 } }, amount: expect.any(String) });
    expect(acts.has("a2")).toBe(false);
    expect(acts.has("a3")).toBe(false);
  });

  it("offers Publish only for the version the approval waits on", async () => {
    const acts = await approvalActs(rows, reader(["campaigns.marketing"]));
    expect(acts.get("a3")?.act).toEqual({ kind: "draft", campaignId: "camp1", version: "abcdefabcdef" });
  });
});
