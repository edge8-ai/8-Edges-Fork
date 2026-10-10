import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatVndWhole } from "@/kernel/ui/format";
import { CheckQueue } from "./CheckQueue";
import type { ClaimToCheck } from "../lib/check-queue";

// The list every tab of Reimbursements renders (RB.3.3, RB.14): each claim
// opens on the claim page for the surface it is on, with who claimed it, how
// many receipts (and how many were declined), how long it has waited, what
// the AI flagged, and the total a check passes on.
const claim = (over: Partial<ClaimToCheck> = {}): ClaimToCheck => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Hanoi workshop",
  ownerName: "Avery Stone",
  submittedAt: "2026-10-01T03:00:00Z",
  receipts: 3,
  declined: 1,
  totalVnd: 626000,
  ratePending: 0,
  stageAt: "2026-10-01T03:00:00Z",
  flagged: 0,
  ...over,
});

describe("CheckQueue", () => {
  it("links each claim to the checker's page for it, with its claimant, receipts and the kept total", () => {
    const html = renderToStaticMarkup(
      <CheckQueue
        claims={[claim(), claim({ id: "22222222-2222-4222-8222-222222222222", title: "Taxi", receipts: 1, declined: 0, totalVnd: 50000 })]}
        hrefBase="/team/finance/claims"
      />,
    );
    expect(html).toContain('href="/team/finance/claims/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/team/finance/claims/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("Avery Stone");
    expect(html).toContain("3 receipts (1 declined)");
    expect(html).toContain("1 receipt");
    expect(html).toContain(formatVndWhole(626000));
    expect(html).toContain(formatVndWhole(50000));
  });

  it("opens each claim on the surface the list is on, and shows a mixed list's statuses", () => {
    const html = renderToStaticMarkup(<CheckQueue claims={[{ ...claim(), status: "approved" }]} hrefBase="/admin/finance/reimbursements" />);
    expect(html).toContain('href="/admin/finance/reimbursements/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain("/team/");
    expect(html).toContain("Approved");
  });

  it("marks a total that leaves out a receipt whose rate is pending, instead of showing it as the claim's total (RB.10)", () => {
    const html = renderToStaticMarkup(
      <CheckQueue
        claims={[claim({ totalVnd: 126000, ratePending: 2 }), claim({ id: "22222222-2222-4222-8222-222222222222", totalVnd: 50000 })]}
        hrefBase="/team/finance/claims"
      />,
    );
    const [pending, valued] = html.split('class="admin-rbq-row"').slice(1);
    expect(pending).toContain(formatVndWhole(126000));
    expect(pending).toContain("+ 2 receipts, rate pending");
    expect(valued).toContain(formatVndWhole(50000));
    expect(valued).not.toContain("rate pending");
  });

  it("marks a claim that has waited more than three days, and says what the AI flagged", () => {
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const html = renderToStaticMarkup(
      <CheckQueue
        claims={[claim({ stageAt: old, flagged: 2 }), claim({ id: "22222222-2222-4222-8222-222222222222", stageAt: new Date().toISOString() })]}
        hrefBase="/admin/finance/reimbursements"
      />,
    );
    const [stale, fresh] = html.split('class="admin-rbq-row"').slice(1);
    expect(stale).toContain("admin-badge--warn");
    expect(stale).toContain("5 days");
    expect(stale).toContain("2 receipts flagged");
    expect(fresh).toContain("today");
    expect(fresh).toContain("Nothing flagged");
  });

  it("says nothing waits when the queue is empty, in the list's own words", () => {
    expect(renderToStaticMarkup(<CheckQueue claims={[]} hrefBase="/team/finance/claims" />)).toContain("Nothing is waiting to be checked.");
    expect(renderToStaticMarkup(<CheckQueue claims={[]} hrefBase="/admin/finance/reimbursements" empty="Nothing is waiting for approval." />)).toContain(
      "Nothing is waiting for approval.",
    );
  });
});
