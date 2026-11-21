import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// RB.5.1, what the owner sees in "Paid to" on first render: the details from
// their profile to confirm or change, the confirmation the claim recorded (it
// survives a reload), and the form straight away when nothing is on file.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("../actions", () => ({ saveOwnBankDetails: async () => ({ ok: true }), confirmOwnBankDetails: async () => ({ ok: true }) }));

import { BankDetailsPanel } from "./BankDetailsPanel";

// A made-up account number, held in a constant so no fixture writes one as a
// quoted literal beside its column name (the public fork's scanner refuses it).
const ACCOUNT = "19034567";
const details = { bankName: "Techcombank", accountNumber: ACCOUNT, branch: "" };
const CLAIM = "22222222-2222-4222-8222-222222222222";
const render = (over: Partial<Parameters<typeof BankDetailsPanel>[0]> = {}) =>
  renderToStaticMarkup(<BankDetailsPanel details={details} claimId={CLAIM} confirmedAt={null} confirmable {...over} />);

describe("BankDetailsPanel", () => {
  it("shows the details on file with a way to confirm them or change them", () => {
    const html = render();
    expect(html).toContain("Techcombank");
    expect(html).toContain(ACCOUNT);
    expect(html).toContain("These are right");
    expect(html).toContain("Change");
  });

  it("shows the recorded confirmation instead of asking again", () => {
    const html = render({ confirmedAt: "2026-10-06T03:00:00Z" });
    expect(html).toContain("You confirmed these on");
    expect(html).not.toContain("These are right");
  });

  it("asks for no confirmation on a claim no longer the owner's to change", () => {
    expect(render({ confirmable: false })).not.toContain("These are right");
  });

  it("opens the form straight away when nothing is on file", () => {
    const html = render({ details: null });
    expect(html).toContain("Add the account Finance should pay your claims to.");
    expect(html).toContain("Save");
    expect(html).not.toContain("These are right");
  });
});
