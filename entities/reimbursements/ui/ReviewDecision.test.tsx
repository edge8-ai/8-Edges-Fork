import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDecision, type ReviewDecisionProps } from "./ReviewDecision";

// Dave, 2026-10-12: there is no Checked phase. A check under the approval
// limit approves the claim (RB.22), so the checker sends it for payment; only
// a claim at or over the limit is sent for approval.
const render = (over: Partial<ReviewDecisionProps>) =>
  renderToStaticMarkup(
    <ReviewDecision
      claimId="claim-1"
      kind="check"
      decide={async () => ({ ok: true })}
      ownerName="Avery Stone"
      totalLabel="₫1,376,940"
      passHint="hint"
      seen={{ count: 4, total: 4 }}
      onDone={() => {}}
      {...over}
    />,
  );

describe("ReviewDecision", () => {
  it("sends a check under the approval limit for payment, never for approval or as Checked", () => {
    const html = render({ approves: true });
    expect(html).toContain("Approve: send for payment");
    expect(html).toContain("Send for payment");
    expect(html).not.toMatch(/approval|Checked/);
  });

  it("sends a check at or over the limit for approval", () => {
    const html = render({ approves: false });
    expect(html).toContain("Send for approval");
    expect(html).toContain("Note for the approver (optional)");
    expect(html).not.toContain("Checked");
  });
});
