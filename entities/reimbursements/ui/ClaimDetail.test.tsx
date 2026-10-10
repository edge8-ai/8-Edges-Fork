import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatVndWhole } from "@/kernel/ui/format";
import { ClaimDetail } from "./ClaimDetail";
import { DecidedClaim } from "./DecidedClaim";
import type { MyClaim, MyItem } from "../lib/my-claims";

// The receipt controls refresh the page through Next's router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

// Every viewer of a claim sees its trip and what is to be rebilled (RB.11), in
// the shared ClaimDetail, so the owner, the checker and the deciders to come
// read the same facts. An old receipt carries a gentle label on the line.
const item = (over: Partial<MyItem> = {}): MyItem => ({
  id: "item-1",
  label: "Grab · Oct 2, 2026",
  description: "Taxi",
  seller: "Grab",
  boughtOn: "2026-10-02",
  category: "transport",
  amount: 126_000,
  currency: "vnd",
  amountVnd: 126_000,
  fxRate: 1,
  fxSource: "none",
  fxAsOf: null,
  chargedVnd: null,
  boughtInVietnam: true,
  lostReceiptNote: null,
  rebill: false,
  rebillCompany: null,
  olderThan90Days: false,
  declined: false,
  declineReason: null,
  removed: null,
  documents: [],
  reading: null,
  flags: [],
  duplicateOfItemId: null,
  ...over,
});

const claim = (over: Partial<MyClaim> = {}): MyClaim => ({
  id: "claim-1",
  personId: "person-a",
  ownerName: "Avery Stone",
  bankConfirmedAt: null,
  trip: null,
  title: "Australia trip – taxis",
  status: "submitted",
  submittedAt: "2026-10-06T03:00:00Z",
  createdAt: "2026-10-05T03:00:00Z",
  receipts: 1,
  totalVnd: 126_000,
  ratePending: 0,
  bankReceiptFileId: null,
  line: "Submitted.",
  items: [item()],
  events: [],
  ...over,
});

const ACME = { id: "co-acme", name: "Acme Pty Ltd" };
const render = (c: MyClaim, tripEditor?: React.ReactNode) =>
  renderToStaticMarkup(<ClaimDetail claim={c} back={{ href: "/team/claims", label: "My claims" }} totalVnd={c.totalVnd} receipts={null} tripEditor={tripEditor} />);

describe("ClaimDetail: the trip and the rebill (RB.11)", () => {
  it("names the trip with its dates", () => {
    const html = render(claim({ trip: { id: "ev-1", title: "Australia trip", type: "private_trip", startsOn: "2026-10-02", endsOn: "2026-10-09" } }));
    expect(html).toContain("Australia trip · Oct 2, 2026 – Oct 9, 2026");
  });

  it("says when the claim names no trip", () => {
    expect(render(claim())).toContain("No event");
  });

  it("shows the editor it is handed in place of the trip's name", () => {
    const html = render(claim(), <span>TRIP-PICKER</span>);
    expect(html).toContain("TRIP-PICKER");
    expect(html).not.toContain("No event");
  });

  it("sums what is to be rebilled by client, leaving declined receipts out", () => {
    const html = render(
      claim({
        items: [
          item({ id: "a", rebill: true, rebillCompany: ACME, amountVnd: 100_000 }),
          item({ id: "b", rebill: true, rebillCompany: ACME, amountVnd: 50_000 }),
          item({ id: "c", rebill: true, rebillCompany: ACME, amountVnd: 70_000, declined: true, declineReason: "Personal" }),
          item({ id: "d", amountVnd: 30_000 }),
        ],
      }),
    );
    expect(html).toContain("Acme Pty Ltd");
    expect(html).toContain("2 receipts");
    expect(html).toContain(formatVndWhole(150_000));
  });

  it("counts a rebilled receipt whose rate is pending instead of summing it as nothing (RB.10)", () => {
    const html = render(
      claim({
        items: [
          item({ id: "a", rebill: true, rebillCompany: ACME, amountVnd: 100_000 }),
          item({ id: "b", rebill: true, rebillCompany: ACME, currency: "aud", amount: 6280, amountVnd: null, boughtInVietnam: false }),
        ],
      }),
    );
    expect(html).toContain("2 receipts");
    expect(html).toContain(formatVndWhole(100_000));
    expect(html).toContain("+ 1 receipt, rate pending");
  });

  it("rebills nothing for a receipt its owner removed (20261008090000)", () => {
    const html = render(
      claim({
        items: [
          item({ id: "a", rebill: true, rebillCompany: ACME, amountVnd: 100_000 }),
          item({ id: "b", rebill: true, rebillCompany: ACME, amountVnd: 50_000, removed: { at: "2026-10-06T03:00:00Z", reason: "Charged twice" } }),
        ],
      }),
    );
    expect(html).toContain("1 receipt<");
    expect(html).toContain(formatVndWhole(100_000));
    expect(html).not.toContain(formatVndWhole(150_000));
  });

  it("shows no rebill section when nothing is to be rebilled", () => {
    expect(render(claim())).not.toContain("Rebill");
  });
});

describe("DecidedClaim: a line's rebill tag and an old receipt (RB.14)", () => {
  const ok = async () => ({ ok: true as const });
  const check = { decide: ok, decline: ok, enterRate: ok, reread: ok, doneHref: "/admin/finance/reimbursements/to-check" };
  // As a checker reads it: someone else's submitted claim.
  const receipts = (c: MyClaim) =>
    renderToStaticMarkup(
      <DecidedClaim
        claim={{ ...c, keptTotalVnd: c.totalVnd, declined: 0, ratePending: 0, documents: new Map() }}
        viewerPersonId="person-checker"
        mayDecideOwn={false}
        back={{ href: "/admin/finance/reimbursements/to-check", label: "To check" }}
        openFile={async () => ({ ok: false as const, error: "no" })}
        check={check}
      />,
    );

  it("tags a rebilled line with its client", () => {
    expect(receipts(claim({ items: [item({ rebill: true, rebillCompany: ACME })] }))).toContain("Rebill to Acme Pty Ltd");
  });

  // Plan §10, 20261008090000: nothing ever submitted is deleted. A removed
  // line stays, with the owner's reason, and a replaced document stays beside
  // its line; a removed line draws no decline or rate control.
  it("shows a removed line with its reason and no decline or rate control, and a replaced document marked", () => {
    const doc = { id: "f1", kind: "receipt" as const, filename: "grab.jpg", mimeType: "image/jpeg", sizeBytes: 10, replacedAt: "2026-10-06T03:00:00Z" };
    const removed = item({ currency: "aud", chargedVnd: null, removed: { at: "2026-10-06T03:00:00Z", reason: "Charged twice" }, documents: [doc] });
    const html = receipts(claim({ items: [removed] }));
    expect(html).toContain("Removed: Charged twice");
    expect(html).toContain("Replaced");
    expect(html).not.toContain(">Decline<");
    expect(html).not.toContain("Enter the rate by hand");
    const kept = receipts(claim({ items: [item({ currency: "aud", chargedVnd: null })] }));
    expect(kept).toContain(">Decline<");
    expect(kept).toContain("Enter the rate by hand");
    expect(kept).not.toContain("Removed:");
  });

  it("labels a receipt older than 90 days, gently", () => {
    expect(receipts(claim({ items: [item({ olderThan90Days: true })] }))).toContain("Older than 90 days");
    expect(receipts(claim())).not.toContain("Older than 90 days");
  });
});
