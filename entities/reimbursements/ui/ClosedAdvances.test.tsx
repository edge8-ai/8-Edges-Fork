import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdvanceRow } from "../lib/advance-lifecycle";
import { ClosedAdvances } from "./ClosedAdvances";

const row = (over: Partial<AdvanceRow> = {}) => ({ id: "advance-1", refNo: 7, status: "rejected", purpose: "Venue deposit", amountVnd: 8_000_000, ...over }) as AdvanceRow;

describe("ClosedAdvances", () => {
  it("shows nothing for someone with none, so My claims stays as it was", () => {
    expect(renderToStaticMarkup(<ClosedAdvances advances={[]} />)).toBe("");
  });

  it("links each one to its own page, because the reason and the papers are there", () => {
    const html = renderToStaticMarkup(<ClosedAdvances advances={[row()]} />);
    expect(html).toContain('href="/team/claims/advances/advance-1"');
    expect(html).toContain("ADV-0007");
    expect(html).toContain("Rejected");
  });
});
