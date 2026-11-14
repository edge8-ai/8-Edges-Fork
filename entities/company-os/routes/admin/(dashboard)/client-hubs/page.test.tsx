import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Client Hubs' cards (AH.6) read boards, invoices and meetings only for a
// reader who may open the page that owns each, so the hub shows no figure to
// someone who could not see it there (the comment on Portfolio in page.tsx).
const opens = vi.hoisted(() => ({ pages: new Set<string>() }));
const spies = vi.hoisted(() => ({ flow: 0, invoices: 0, meetings: 0 }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ may: () => true }) }));
vi.mock("@/kernel/identity/may-open", () => ({ mayOpen: (_a: unknown, href: string) => opens.pages.has(href) }));
vi.mock("@/kernel/data/supabase", () => {
  const rows = { data: [{ id: "c1", name: "Acme", metadata: { client_hub_active: true } }], error: null };
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "or", "is"]) chain[k] = () => chain;
  chain.order = async () => rows;
  return { companyOs: { from: () => chain } };
});
vi.mock("@/entities/portal", () => ({ countActiveProgramsByCompany: async () => new Map() }));
vi.mock("@/entities/crm", () => ({ CompanyLinkRow: () => null, getLastMeetingsForCompanies: async () => (spies.meetings++, new Map()) }));
vi.mock("@/entities/boards", () => ({ loadFlow: async () => (spies.flow++, { perBoard: [] }) }));
vi.mock("@/entities/finance", () => ({ overdueInvoicesOf: async () => (spies.invoices++, { data: [], error: null }) }));
vi.mock("./ClientHubFilter", () => ({ ClientHubFilter: () => null }));

const { default: ClientHubsPage } = await import("./page");

// The page hands the cards to an async component; run it the way React would.
async function cards() {
  const el = (await ClientHubsPage({ searchParams: Promise.resolve({}) })) as ReactElement<Record<string, unknown>>;
  return (el.type as (p: Record<string, unknown>) => Promise<unknown>)(el.props);
}

beforeEach(() => {
  spies.flow = spies.invoices = spies.meetings = 0;
});

describe("Client Hubs' sources", () => {
  it("reads no boards, invoices or meetings for a reader who may open none of their pages", async () => {
    opens.pages = new Set();
    await cards();
    expect(spies).toEqual({ flow: 0, invoices: 0, meetings: 0 });
  });

  it("reads each source when the reader may open the page that owns it", async () => {
    opens.pages = new Set(["/admin/edges/workboard", "/admin/revenue/invoices", "/admin/revenue/meetings"]);
    await cards();
    expect(spies).toEqual({ flow: 1, invoices: 1, meetings: 1 });
  });
});
