import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RedInvoiceHint } from "./RedInvoiceHint";

// What a person reads at the top of the claim screens before buying something
// in Vietnam (RB.15, Mai's layout): the buyer's legal name, registered address
// and tax code to give the seller for a red invoice, each with a copy button
// and one to copy all three; a plain "not configured" for whatever is missing.
// Whoever keeps the legal details (org.legal-registration) is also handed a
// link to edit them. Rendered with react-dom/server, as the repo has no
// @testing-library/react.
type Props = Parameters<typeof RedInvoiceHint>[0];
const render = (buyer: Props["buyer"], editHref: string | null = null) => renderToStaticMarkup(<RedInvoiceHint buyer={buyer} editHref={editHref} />);

const ADDRESS = "Phòng 1.01, Số 1 Đường Ví Dụ, Phường Mẫu, Thành phố Hồ Chí Minh";
const READY: Props["buyer"] = { state: "ready", slug: "acme-vn", legalName: "CÔNG TY TNHH ACME VIỆT NAM", address: ADDRESS, taxCode: "0300000001" };

describe("RedInvoiceHint", () => {
  it("shows the legal name, address and tax code, each with a copy button, and one to copy all three", () => {
    const html = render(READY);
    expect(html).toContain("VAT invoice (red invoice) details");
    expect(html).toContain("CÔNG TY TNHH ACME VIỆT NAM");
    expect(html).toContain(ADDRESS);
    expect(html).toContain("0300000001");
    expect(html).toContain('aria-label="Copy the company name"');
    expect(html).toContain('aria-label="Copy the address"');
    expect(html).toContain('aria-label="Copy the tax code"');
    expect(html).toContain("Copy all");
    expect(html).not.toContain("not configured");
  });

  // RB.16 (Mai): a ride still brings its invoice where it can; it is only not
  // held to it strictly, so the box does not tell anyone a ride needs none.
  it("does not tell anyone a ride needs no invoice", () => {
    expect(render(READY)).not.toContain("need no invoice");
  });

  it("shows what is entered and says what is not configured", () => {
    const html = render({ state: "no_tax_code", slug: "acme-vn", legalName: "CÔNG TY TNHH ACME VIỆT NAM", address: null });
    expect(html).toContain("CÔNG TY TNHH ACME VIỆT NAM");
    expect(html).toContain("Tax code not configured yet.");
    expect(html).toContain("Address not configured yet.");
    expect(html).not.toContain('aria-label="Copy the tax code"');
    expect(html).not.toContain('aria-label="Copy the address"');
    // Copy all would copy a half-filled buyer, so it waits for all three.
    expect(html).not.toContain("Copy all");
  });

  it("offers nothing to copy when no buyer is configured, or the read failed", () => {
    const missing = render({ state: "not_configured" });
    expect(missing).toContain("not configured yet");
    expect(missing).not.toContain("Copy");
    const failed = render({ state: "unavailable" });
    expect(failed).toContain("could not be read");
    expect(failed).not.toContain("not configured");
  });

  it("links whoever keeps the legal details to edit them, and nobody else", () => {
    const keeper = render(READY, "/admin/settings/legal-entities?open=acme-vn");
    expect(keeper).toContain('href="/admin/settings/legal-entities?open=acme-vn"');
    expect(keeper).toContain("Edit legal details");
    expect(render(READY)).not.toContain("Edit legal details");
    // The keeper is the one who can fix a missing buyer, so the link stays.
    expect(render({ state: "not_configured" }, "/admin/settings/legal-entities")).toContain("Edit legal details");
  });
});
