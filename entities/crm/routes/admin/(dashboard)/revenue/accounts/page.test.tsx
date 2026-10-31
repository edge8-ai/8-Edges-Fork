import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttentionRow } from "@/entities/crm/lib/accounts-attention";

// Pins what the screen says, not how it loads: the loader has its own tests.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => "/admin/revenue/accounts",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/kernel/shell/surface", () => ({ surfaceBase: () => "/admin" }));
// The page asks for its declared permission first (ADR 0013); the guard is
// tested on its own, so here it only records what was asked.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/config/dates", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-09-25",
}));
const rows: AttentionRow[] = [
  {
    id: "a1",
    name: "Quiet Harbour Ltd",
    score: 30,
    signals: { daysSinceMeeting: null, neverMet: true, overdueInvoices: 2, roadmapMoves30d: 0, portalSignInDays: null, portalNeverSignedIn: false },
    renewal: { id: "r1", company_id: "a1", renews_on: "2026-10-20", term_months: 12, status: "upcoming", note: null },
    renewalSoon: true,
  },
  { id: "a2", name: "Fresh Start Co", score: null, signals: null, renewal: null, renewalSoon: false },
];
vi.mock("@/entities/crm/lib/accounts-attention", () => ({
  loadAccountsNeedingAttention: async () => ({ rows, takenOn: "2026-09-25" }),
}));

import AccountsNeedingAttentionPage from "./page";

describe("Accounts needing attention", () => {
  it("shows each account's score, signals in words and renewal, and flags a renewal in text", async () => {
    const html = renderToStaticMarkup(await AccountsNeedingAttentionPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Quiet Harbour Ltd");
    expect(html).toContain("30 / 100");
    expect(html).toContain("Never met");
    expect(html).toContain("2 overdue invoices");
    expect(html).toContain("No roadmap moves in 30 days");
    expect(html).toContain("No portal members");
    // The flag is words on a badge, never colour alone.
    expect(html).toContain("Renews within 60 days");
    expect(html).toContain("in 25 days");
    expect(html).toContain("No reading yet");
    expect(html).toContain("1 renewing within 60 days");
    expect(html.indexOf("Quiet Harbour Ltd")).toBeLessThan(html.indexOf("Fresh Start Co"));
  });

  it("names no person anywhere on the screen", async () => {
    const html = renderToStaticMarkup(await AccountsNeedingAttentionPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toMatch(/owner|assignee/i);
  });
});
