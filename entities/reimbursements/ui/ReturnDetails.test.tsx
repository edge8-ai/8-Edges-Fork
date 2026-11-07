import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReturnDetails } from "./ReturnDetails";

const ACCOUNT = "12345678";
const ready = { state: "ready" as const, bankName: "Vietcombank", accountNumber: ACCOUNT, holder: "Acme Co., Ltd", qrSvg: "<svg data-qr></svg>" };
const render = (account: Parameters<typeof ReturnDetails>[0]["account"]) => renderToStaticMarkup(<ReturnDetails account={account} amount="₫2,500,000" reference="AD-0012 HOAN UNG" />);

describe("ReturnDetails", () => {
  it("shows where to send it, and the code", () => {
    const html = render(ready);
    for (const words of ["Vietcombank", ACCOUNT, "Acme Co., Ltd", "₫2,500,000", "AD-0012 HOAN UNG", "data-qr", "scan it with your banking app"]) expect(html).toContain(words);
  });

  it("still shows the details when there is no code", () => {
    const html = render({ ...ready, qrSvg: null });
    expect(html).toContain(ACCOUNT);
    expect(html).not.toContain("adv-qr");
  });

  it("says to ask Finance when none is on file, and keeps the amount and reference", () => {
    const html = render({ state: "none" });
    expect(html).toContain("Ask Finance for the account.");
    expect(html).toContain("₫2,500,000");
    expect(html).toContain("AD-0012 HOAN UNG");
  });

  it("says a failed read failed", () => {
    expect(render({ state: "unavailable" })).toContain("could not be loaded");
  });
});
