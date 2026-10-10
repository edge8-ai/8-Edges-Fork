// The team assistant's client access rules, for four employees: a base
// employee, one assigned to client A, one with revenue access only, and one
// with revenue access plus client A. Every assertion reads the tool result,
// which is exactly what the route hands back to the model as the tool_result
// (route.test.ts pins that pass-through), so "not in the result" means the
// model never saw it, not merely that the final answer left it out.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/kernel/identity/reads", () => ({
  selectCompanies: (c: string, o?: unknown) => builderFor("companies").select(c, o),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ PORTAL_STATUSES: ["active", "on_leave", "notice", "pre_start"] }));
vi.mock("@/entities/billing", () => ({ selectOrders: (c: string) => builderFor("orders").select(c) }));
vi.mock("@/entities/contacts", () => ({
  selectPersonCompanies: (c: string) => builderFor("person_companies").select(c),
  selectStaffAssignments: (c: string) => builderFor("staff_assignments").select(c),
}));
vi.mock("@/entities/crm", () => ({
  // crm's rule (entities/crm/lib/client-visibility.ts): whoever may work the pipeline.
  seesEveryClient: (a: { may: (p: string) => boolean }) => a.may("crm.pipeline"),
  selectDeals: (c: string) => builderFor("deals").select(c),
  selectLead: (c: string, o?: unknown) => builderFor("lead").select(c, o),
  selectPipelineStages: (c: string) => builderFor("pipeline_stages").select(c),
}));
vi.mock("@/entities/finance", () => ({
  INVOICE_VOIDED: "voided",
  selectInvoices: (c: string) => builderFor("invoices").select(c),
  selectExpenses: (c: string) => builderFor("expenses").select(c),
  selectProducts: (c: string) => builderFor("products").select(c),
}));
vi.mock("@/entities/ideas", () => ({ selectIdeas: vi.fn() }));
vi.mock("@/entities/org", () => ({ selectCompanyInformation: vi.fn(), selectTeamDirectory: vi.fn() }));
vi.mock("@/entities/retreats", () => ({ selectEvents: vi.fn() }));
vi.mock("@/entities/site", () => ({ listGalleryPhotos: vi.fn() }));
vi.mock("@/entities/time-off", () => ({ selectTimeOff: vi.fn() }));
// The my_* tools' doors: run-tool loads them, and their own suite pins them.
vi.mock("@/entities/boards", () => ({}));
vi.mock("@/entities/coaching", () => ({}));
vi.mock("@/entities/reimbursements", () => ({}));

import { resolveChatAccess, type ChatAccess } from "./access";
import { runTeamDataTool } from "./run-tool";

const BASE: ChatAccess = { hasRevenueAccess: false, assignedClientIds: [] };
const ASSIGNED_A: ChatAccess = { hasRevenueAccess: false, assignedClientIds: ["client-a"] };
const REVENUE: ChatAccess = { hasRevenueAccess: true, assignedClientIds: [] };
const REVENUE_PLUS_A: ChatAccess = { hasRevenueAccess: true, assignedClientIds: ["client-a"] };

const ACME = { id: "client-a", name: "Acme" };
const BETA = { id: "client-b", name: "Beta Co" };

// Sentinels: none of these may appear in a result an employee is not entitled to.
const JANE = {
  id: "jane",
  full_name: "Jane Contact",
  preferred_name: null,
  display_name: null,
  email: "jane@acme.example",
  phone: "PHONE-SENTINEL",
  city: "Hanoi",
  country: "VN",
};
const ACME_INVOICE = {
  company_id: "client-a",
  doc_number: "INV-7001",
  txn_date: "2026-10-01",
  due_date: "2026-10-31",
  amount_cents: 1234567,
  balance_cents: 1234567,
  currency: "USD",
  status: "open",
};
const BETA_INVOICE = { ...ACME_INVOICE, company_id: "client-b", doc_number: "INV-8002", amount_cents: 7654321, balance_cents: 0 };

const run = (name: string, input: Record<string, unknown>, access: ChatAccess) => runTeamDataTool(name, input, access);
const filtersOn = (table: string) => calls.filter((c) => c.table === table).flatMap((c) => c.filters);

/** Script the company lookup a tool does by name. */
const lookup = (...rows: { id: string; name: string }[]) => script("companies", { data: rows });

/** Script everything clientContacts reads for Acme. */
function scriptAcmeContacts() {
  lookup(ACME);
  script("person_companies", {
    data: [{ person_id: "jane", company_id: "client-a", title: "CTO", role: "client", end_date: null }],
  });
  script("people", { data: [JANE] });
}

/** Script everything oneClient reads for a client with one order. */
function scriptClientMoney(company: { id: string; name: string }, invoice: typeof ACME_INVOICE) {
  lookup(company);
  script("invoices", { data: [invoice] });
  script("person_companies", { data: [{ person_id: "jane" }] });
  script("orders", {
    data: [
      {
        created_at: "2026-09-15T00:00:00Z",
        status: "paid",
        amount_cents: 99900,
        currency: "USD",
        amount_usd_cents: 99900,
        refunded_cents: 0,
        product_id: "prod-1",
      },
    ],
  });
  script("products", { data: [{ id: "prod-1", name: "AI Sprint" }] });
}

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveChatAccess", () => {
  const actor = { teamMemberId: "tm-1" };
  const holding = (...held: string[]) => ({ may: (p: string) => held.includes(p) });
  const member = holding("surface.team");

  it("gives a base employee no revenue access and no clients", async () => {
    script("staff_assignments", { data: [] });
    expect(await resolveChatAccess(actor, member)).toEqual(BASE);
  });

  it("reads assigned clients from the actor's own active staff assignments", async () => {
    script("staff_assignments", { data: [{ company_id: "client-a" }, { company_id: "client-a" }] });
    expect(await resolveChatAccess(actor, member)).toEqual(ASSIGNED_A);
    expect(filtersOn("staff_assignments")).toEqual([
      ["eq", "team_member_id", "tm-1"],
      ["eq", "status", "active"],
    ]);
  });

  it("grants revenue access to whoever may work the pipeline (the Revenue and Admin roles), and adds assignments to it", async () => {
    script("staff_assignments", { data: [] }, { data: [{ company_id: "client-a" }] });
    expect(await resolveChatAccess(actor, holding("surface.team", "crm.pipeline"))).toEqual(REVENUE);
    expect(await resolveChatAccess(actor, holding("surface.team", "crm.pipeline", "surface.admin"))).toEqual(REVENUE_PLUS_A);
  });

  it("raises a failed read instead of treating the person as unassigned", async () => {
    script("staff_assignments", { error: { message: "boom" } });
    await expect(resolveChatAccess(actor, member)).rejects.toThrow(/staff_assignments/);
  });
});

describe("open to every employee", () => {
  it("company_totals gives the base employee company-wide totals with no client in them", async () => {
    script("invoices", { data: [ACME_INVOICE, BETA_INVOICE] });
    script("orders", { data: [{ amount_usd_cents: 10000 }] });
    script("expenses", { data: [{ amount_cents: 5000, currency: "USD" }] });
    script("deals", { data: [{ amount_usd_cents: 2500000 }] });
    const out = await run("company_totals", { from: "2026-10-01", to: "2026-10-31" }, BASE);
    expect(out.isError).toBe(false);
    const body = JSON.parse(out.content);
    expect(body.invoiced).toEqual({ USD: 88888.88 });
    expect(body.openPipeline).toEqual({ deals: 1, usd: 25000 });
    expect(out.content).not.toMatch(/client-a|client-b|Acme|Beta|INV-/);
  });

  it("customers_and_prospects shows business names of new customers to the base employee", async () => {
    script("companies", { count: 12 }, { data: [{ name: "Gamma Ltd" }] }, { data: [ACME] });
    script("deals", { data: [{ company_id: "client-a" }] });
    script("lead", { count: 4 });
    const body = JSON.parse((await run("customers_and_prospects", {}, BASE)).content);
    expect(body).toMatchObject({ customers: 12, newCustomers: ["Acme"], newLeads: 4, newProspectBusinesses: ["Gamma Ltd"] });
  });

  it("list_deals shows deal amounts to everyone but never the deal's contact person", async () => {
    script("deals", {
      data: [
        {
          title: "Acme AI program",
          status: "open",
          stage_id: "st-3",
          owner_id: "dave",
          company_id: "client-a",
          amount_cents: 2500000,
          currency: "USD",
          amount_usd_cents: 2500000,
          expected_close_date: null,
          closed_at: null,
          person_id: "jane",
          email: JANE.email,
        },
      ],
    });
    script("pipeline_stages", { data: [{ id: "st-3", name: "Proposal" }] });
    script("people", { data: [{ id: "dave", display_name: "Dave", preferred_name: null, full_name: "Dave H" }] });
    script("companies", { data: [ACME] });
    const out = await run("list_deals", {}, BASE);
    expect(JSON.parse(out.content).deals[0]).toMatchObject({
      title: "Acme AI program",
      business: "Acme",
      stage: "Proposal",
      owner: "Dave",
      amount: 25000,
    });
    expect(out.content).not.toContain("jane");
  });

  it("list_businesses returns business fields only", async () => {
    script("companies", {
      data: [{ ...ACME, industry: "SaaS", country: "VN", lifecycle_stage: "customer", notes: `call ${JANE.email}`, billing_address: "1 Secret St" }],
    });
    const out = await run("list_businesses", {}, BASE);
    expect(JSON.parse(out.content).businesses[0]).toMatchObject({ name: "Acme", stage: "customer" });
    expect(out.content).not.toMatch(/jane@|Secret St/);
  });
});

describe("base employee", () => {
  it("is refused revenue by client, and the database is never asked", async () => {
    const out = await run("client_financials", {}, BASE);
    expect(out).toEqual({ isError: true, content: expect.stringMatching(/^Revenue by client is only for/) });
    expect(calls.filter((c) => c.table === "invoices")).toHaveLength(0);
  });

  it("is refused one client's financials, with no figure in the refusal", async () => {
    lookup(ACME);
    const out = await run("client_financials", { company: "Acme" }, BASE);
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/You can't see Acme's financials/);
    expect(calls.filter((c) => c.table === "invoices")).toHaveLength(0);
  });

  it("is refused a client's contact email, which never reaches the model", async () => {
    lookup(ACME);
    const out = await run("client_contacts", { company: "Acme" }, BASE);
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/You can't see the contact people at Acme/);
    expect(out.content).not.toMatch(/jane|Jane|PHONE-SENTINEL/);
    expect(calls.filter((c) => c.table === "people")).toHaveLength(0);
  });
});

describe("assigned to client A", () => {
  it("sees client A's invoices, orders and contacts", async () => {
    scriptClientMoney(ACME, ACME_INVOICE);
    const money = JSON.parse((await run("client_financials", { company: "Acme" }, ASSIGNED_A)).content);
    expect(money).toMatchObject({ client: "Acme", invoiced: { USD: 12345.67 }, orders: [{ product: "AI Sprint", amount: 999 }] });
    expect(money.invoices[0].number).toBe("INV-7001");

    scriptAcmeContacts();
    const contacts = JSON.parse((await run("client_contacts", { company: "Acme" }, ASSIGNED_A)).content);
    expect(contacts.contacts[0]).toMatchObject({ name: "Jane Contact", email: JANE.email, phone: JANE.phone });
  });

  it("is refused client B's financials and contacts", async () => {
    lookup(BETA);
    const money = await run("client_financials", { company: "Beta" }, ASSIGNED_A);
    expect(money.isError).toBe(true);
    expect(money.content).toMatch(/You can't see Beta Co's financials/);

    lookup(BETA);
    const contacts = await run("client_contacts", { company: "Beta" }, ASSIGNED_A);
    expect(contacts.isError).toBe(true);
    expect(calls.filter((c) => ["invoices", "orders", "people"].includes(c.table))).toHaveLength(0);
  });

  it("gets revenue by client for client A only, even if the database returned more", async () => {
    // The fake ignores filters, so B's row comes back: the body must drop it.
    script("invoices", { data: [ACME_INVOICE, BETA_INVOICE] });
    script("companies", { data: [ACME] });
    const out = await run("client_financials", {}, ASSIGNED_A);
    const body = JSON.parse(out.content);
    expect(body.scope).toBe("only the clients you are assigned to");
    expect(body.clients).toEqual([{ client: "Acme", invoiced: { USD: 12345.67 }, outstanding: { USD: 12345.67 }, invoiceCount: 1 }]);
    expect(out.content).not.toMatch(/Beta|76543/);
    expect(filtersOn("invoices")).toContainEqual(["in", "company_id", ["client-a"]]);
  });
});

describe("revenue access only", () => {
  it("sees revenue by client for every client", async () => {
    script("invoices", { data: [ACME_INVOICE, BETA_INVOICE] });
    script("companies", { data: [ACME, BETA] });
    const body = JSON.parse((await run("client_financials", {}, REVENUE)).content);
    expect(body.scope).toBe("all clients");
    // Largest first: "top clients by revenue".
    expect(body.clients.map((c: { client: string }) => c.client)).toEqual(["Beta Co", "Acme"]);
    expect(filtersOn("invoices").some(([op, col]) => op === "in" && col === "company_id")).toBe(false);
  });

  it("sees an unassigned client's financials and contact details", async () => {
    scriptClientMoney(BETA, BETA_INVOICE);
    const money = JSON.parse((await run("client_financials", { company: "Beta" }, REVENUE)).content);
    expect(money.invoices[0].number).toBe("INV-8002");

    scriptAcmeContacts();
    const contacts = JSON.parse((await run("client_contacts", { company: "Acme" }, REVENUE)).content);
    expect(contacts.contacts[0].email).toBe(JANE.email);
  });
});

describe("revenue access plus client A", () => {
  it("sees every client, the two grants adding together", async () => {
    script("invoices", { data: [ACME_INVOICE, BETA_INVOICE] });
    script("companies", { data: [ACME, BETA] });
    const body = JSON.parse((await run("client_financials", {}, REVENUE_PLUS_A)).content);
    expect(body.scope).toBe("all clients");
    expect(body.clients).toHaveLength(2);

    scriptClientMoney(BETA, BETA_INVOICE);
    expect((await run("client_financials", { company: "Beta" }, REVENUE_PLUS_A)).isError).toBe(false);
    scriptAcmeContacts();
    expect((await run("client_contacts", { company: "Acme" }, REVENUE_PLUS_A)).isError).toBe(false);
  });
});

describe("tool input cannot widen access", () => {
  it("ignores access-shaped fields the model puts in the input", async () => {
    lookup(BETA);
    const out = await run(
      "client_financials",
      { company: "Beta", hasRevenueAccess: true, assignedClientIds: ["client-b"] },
      ASSIGNED_A,
    );
    expect(out.isError).toBe(true);
  });

  it("says a failed read is a failure, not an empty answer", async () => {
    script("invoices", { error: { message: "boom" } });
    script("orders", { data: [] });
    script("expenses", { data: [] });
    script("deals", { data: [] });
    const out = await run("company_totals", {}, BASE);
    expect(out).toEqual({ isError: true, content: expect.stringMatching(/lookup failed/) });
  });
});
