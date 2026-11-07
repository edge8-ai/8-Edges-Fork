import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettlementStrip } from "./SettlementStrip";

const render = (spentVnd: number, ratePending = 0) => renderToStaticMarkup(<SettlementStrip advancedVnd={8_000_000} spentVnd={spentVnd} viewer="owner" ratePending={ratePending} />);

describe("SettlementStrip", () => {
  it("says who the difference falls on", () => {
    expect(render(7_360_000)).toContain("You return");
    expect(render(7_360_000)).toContain("₫640,000");
    expect(render(8_720_000)).toContain("The company pays you");
  });

  // A receipt with no rate counts as nothing yet, so the sum is short and "You return" would be false.
  it("names no difference while a receipt waits for a rate", () => {
    const html = render(1_000_000, 1);
    expect(html).toContain("Spent so far");
    expect(html).toContain("Waits for a rate");
    expect(html).not.toContain("You return");
    expect(html).not.toContain("₫7,000,000");
  });
});
