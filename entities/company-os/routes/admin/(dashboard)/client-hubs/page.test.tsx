import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Client Hubs' cards (AH.6) read boards, invoices and meetings only for a
// reader who may open the page that owns each, so the hub shows no figure to
// someone who could not see it there (the comment on Portfolio in page.tsx).
const opens = vi.hoisted(() => ({ pages: new Set<string>(), personId: "p1" as string | null, blockersFor: [] as string[], denied: new Set<string>() }));
const spies = vi.hoisted(() => ({ flow: 0, invoices: 0, meetings: 0, blockers: 0, moves: 0 }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ may: (p: string) => !opens.denied.has(p), personId: opens.personId }) }));
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
vi.mock("@/entities/boards", () => ({
  loadFlow: async () => (
    spies.flow++,
    { perBoard: [{ id: "b1", name: "Rollout", slug: "rollout", clientCompanyId: "c1", open: 1, clientLate: [{ id: "k1", title: "Import", lateDays: 9 }], oldBlockers: [], lastMoveDays: 1 }] }
  ),
  dueMovesOf: async (ids: string[]) => (ids.length && spies.moves++, new Map()),
  openBlockersOn: async (personId: string) => (spies.blockers++, opens.blockersFor.push(personId), []),
  toggleBlocker: async () => ({ ok: true }),
}));
vi.mock("@/entities/finance", () => ({ overdueInvoicesOf: async () => (spies.invoices++, { data: [], error: null }) }));
vi.mock("./ClientHubFilter", () => ({ ClientHubFilter: () => null }));

const { default: ClientHubsPage } = await import("./page");

// The page hands the cards to an async component; run it the way React would.
async function cards() {
  const el = (await ClientHubsPage({ searchParams: Promise.resolve({}) })) as ReactElement<Record<string, unknown>>;
  return (el.type as (p: Record<string, unknown>) => Promise<unknown>)(el.props);
}

beforeEach(() => {
  spies.flow = spies.invoices = spies.meetings = spies.blockers = spies.moves = 0;
  opens.personId = "p1";
  opens.blockersFor = [];
  opens.denied = new Set();
});

describe("Client Hubs' sources", () => {
  it("reads no boards, invoices or meetings for a reader who may open none of their pages", async () => {
    opens.pages = new Set();
    await cards();
    expect(spies).toEqual({ flow: 0, invoices: 0, meetings: 0, blockers: 0, moves: 0 });
  });

  it("reads each source when the reader may open the page that owns it", async () => {
    opens.pages = new Set(["/admin/edges/workboard", "/admin/revenue/invoices", "/admin/revenue/meetings"]);
    await cards();
    expect(spies).toEqual({ flow: 1, invoices: 1, meetings: 1, blockers: 1, moves: 1 });
  });

  // A blocker's text and holder reach a card only when it waits on the reader
  // (client-portfolio.ts): the read names the reader and nobody else.
  it("reads only the reader's own blockers, and none for a reader with no person record", async () => {
    opens.pages = new Set(["/admin/edges/workboard"]);
    await cards();
    expect(opens.blockersFor).toEqual(["p1"]);
    opens.personId = null;
    opens.blockersFor = [];
    await cards();
    expect(opens.blockersFor).toEqual([]);
  });

  // A card's history is shown on the board only to its members and
  // boards.admin, so the date-move count it feeds is read only for boards.admin.
  it("reads date moves for boards.admin, and none for a reader who may open the boards without it", async () => {
    opens.pages = new Set(["/admin/edges/workboard"]);
    await cards();
    expect([spies.flow, spies.moves]).toEqual([1, 1]);
    spies.flow = spies.moves = 0;
    opens.denied = new Set(["boards.admin"]);
    await cards();
    expect([spies.flow, spies.moves]).toEqual([1, 0]);
  });
});
