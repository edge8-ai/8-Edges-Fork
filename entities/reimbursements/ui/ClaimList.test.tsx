import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimList } from "./ClaimList";
import { vndFromInput } from "./RecordPayment";

// The owner's list of claims: a receipt whose rate is pending is said beside
// the total (ui/ClaimTotal), never counted as nothing.
const claim = (over: Partial<Parameters<typeof ClaimList>[0]["claims"][number]> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Australia trip",
  status: "draft" as const,
  receipts: 2,
  totalVnd: 126_000,
  ratePending: 0,
  declined: 0,
  figureWord: null,
  line: "Not sent yet.",
  ...over,
});

describe("ClaimList", () => {
  it("says a total that leaves a receipt out for want of a rate is only so far, and how many it waits on (RB.29)", () => {
    const html = renderToStaticMarkup(<ClaimList claims={[claim({ ratePending: 1 })]} />);
    expect(html).toContain("126,000");
    expect(html).toContain("so far");
    expect(html).toContain("1 receipt waiting for its rate");
  });

  it("shows a plain total when every receipt has its value", () => {
    expect(renderToStaticMarkup(<ClaimList claims={[claim()]} />)).not.toMatch(/so far|waiting for|declined|spent/);
  });

  it("says how many receipts are declined beside the receipt count (RB.29)", () => {
    expect(renderToStaticMarkup(<ClaimList claims={[claim({ declined: 1 })]} />)).toContain("2 receipts · 1 declined");
  });

  it("says a settlement's figure is what was spent (RB.29)", () => {
    const html = renderToStaticMarkup(<ClaimList claims={[claim({ totalVnd: 8_500_000, figureWord: "spent" })]} />);
    expect(html).toContain("8,500,000");
    expect(html).toContain("spent");
  });
});

describe("vndFromInput", () => {
  it("reads whole dong from what was typed, separators and all", () => {
    expect(vndFromInput("1,490,000")).toBe(1_490_000);
    expect(vndFromInput("1.490.000 ₫")).toBe(1_490_000);
    expect(vndFromInput("")).toBeNull();
  });
});
