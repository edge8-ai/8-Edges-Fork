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
  line: "Not sent yet.",
  ...over,
});

describe("ClaimList", () => {
  it("marks a total that leaves a rate-pending receipt out", () => {
    const html = renderToStaticMarkup(<ClaimList claims={[claim({ ratePending: 1 })]} />);
    expect(html).toContain("126,000");
    expect(html).toContain("+ 1 receipt, rate pending");
  });

  it("shows a plain total when every receipt has its value", () => {
    expect(renderToStaticMarkup(<ClaimList claims={[claim()]} />)).not.toMatch(/rate pending/);
  });
});

describe("vndFromInput", () => {
  it("reads whole dong from what was typed, separators and all", () => {
    expect(vndFromInput("1,490,000")).toBe(1_490_000);
    expect(vndFromInput("1.490.000 ₫")).toBe(1_490_000);
    expect(vndFromInput("")).toBeNull();
  });
});
