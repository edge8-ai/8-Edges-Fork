import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The accountant's emails print the request title, which the client typed, and
// the client company's name. Both reach the email's HTML escaped (S.16.25).

const sent: { subject: string; html: string }[] = [];
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/config/env", () => ({ optionalEnv: (key: string) => (key === "ACCOUNTING_EMAIL" ? "books@edge8.test" : undefined) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: vi.fn(async (args: { subject: string; html: string }) => {
    sent.push(args);
    return true;
  }),
}));
vi.mock("./writes", () => ({
  updateContractorWorkRequests: () => ({ eq: async () => ({ error: null }) }),
  insertContractorWorkEvents: async () => ({ error: null }),
}));
let rateCents: number | null = 5000;
vi.mock("@/entities/company-os", () => ({
  billableRateCents: vi.fn(async () => rateCents),
  invoiceCompanyForHours: vi.fn(async () => ({
    ok: true,
    invoice: { id: "inv-1", docNumber: "1001", totalCents: 10000 },
    ledgerId: "led-1",
    emailed: true,
    companyName: "<b>Acme</b>",
  })),
}));

import { runWorkRequestBilling } from "./work-billing";

const request = (over: Record<string, unknown> = {}) => ({
  id: "w1",
  person_id: "p1",
  title: '<a href="https://evil.test">Deck</a>',
  status: "completed",
  origin: "portal",
  client_company_id: "c1",
  billing_status: null,
  actual_hours: 2,
  actual_overtime_hours: 0,
  ...over,
});

beforeEach(() => {
  resetFake();
  sent.length = 0;
  rateCents = 5000;
});

describe("the accountant's billing emails", () => {
  it("escape the client's title in the manual-invoice email", async () => {
    script("contractor_work_requests", { data: request({ actual_hours: 0 }) });
    await runWorkRequestBilling("w1");
    const { html } = sent[0];
    expect(html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;Deck&lt;/a&gt;");
    expect(html).not.toContain('<a href="https://evil.test">');
  });

  it("escape the title and the company name in the invoice-created email", async () => {
    script("contractor_work_requests", { data: request() });
    await runWorkRequestBilling("w1");
    const { html } = sent[0];
    expect(html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;Deck&lt;/a&gt;");
    expect(html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).not.toContain("<b>Acme</b>");
  });
});
