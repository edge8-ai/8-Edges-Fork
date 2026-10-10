import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
// The auth admin API is not PostgREST, so it is faked at its kernel door.
const lastSignInsFor = vi.fn();
vi.mock("@/kernel/identity/auth-users", () => ({ lastSignInsFor: (ids: string[]) => lastSignInsFor(ids) }));

import { takeAccountHealthSnapshots } from "./account-health";
import { loadAccountsNeedingAttention, sortAttention, type AttentionRow } from "./accounts-attention";

// 20:00 UTC on the 25th is 03:00 on the 26th in Saigon: the reading is filed
// under the Saigon day.
const NOW = new Date("2026-09-25T20:00:00Z");
const ACME = "11111111-1111-4111-8111-111111111111";
const GLOBEX = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  resetFake();
  lastSignInsFor.mockReset();
});

function scriptHealthyReads() {
  script("companies", { data: [{ id: ACME, name: "Acme Widgets" }, { id: GLOBEX, name: "Globex Test Co" }] });
  script("meetings", { data: [{ id: "m1", company_id: ACME, started_at: "2026-09-20T03:00:00Z" }] });
  script("invoices", { data: [{ company_id: GLOBEX, status: "overdue", balance_cents: 9900, due_date: "2026-09-01" }] });
  script("client_backlog_items", { data: [{ company_id: ACME, updated_at: "2026-09-24T00:00:00Z", archived_at: null }] });
  script("portal_members", { data: [{ company_id: ACME, people: { auth_user_id: "auth-1" } }] });
  lastSignInsFor.mockResolvedValue(new Map([["auth-1", "2026-09-25T01:00:00Z"]]));
}

describe("takeAccountHealthSnapshots", () => {
  it("upserts one reading per account for the Saigon day, from the four signals", async () => {
    scriptHealthyReads();
    script("account_health_snapshots", { data: null });

    const r = await takeAccountHealthSnapshots(NOW);

    expect(r).toEqual({ ok: true, takenOn: "2026-09-26", accounts: 2 });
    const write = calls.find((c) => c.table === "account_health_snapshots");
    expect(write?.ops[0]).toBe("upsert");
    expect(write?.options[0]).toEqual({ onConflict: "company_id,taken_on" });
    expect(write?.payloads[0]).toEqual([
      {
        company_id: ACME,
        taken_on: "2026-09-26",
        signals: { daysSinceMeeting: 6, neverMet: false, overdueInvoices: 0, roadmapMoves30d: 1, portalSignInDays: 1, portalNeverSignedIn: false },
        score: 100,
      },
      {
        company_id: GLOBEX,
        taken_on: "2026-09-26",
        // Never met (-35) and one overdue invoice (-15); no roadmap and no
        // portal members cost nothing.
        signals: { daysSinceMeeting: null, neverMet: true, overdueInvoices: 1, roadmapMoves30d: null, portalSignInDays: null, portalNeverSignedIn: false },
        score: 50,
      },
    ]);
    expect(lastSignInsFor).toHaveBeenCalledWith(["auth-1"]);
  });

  it("reads accounts with the Clients page's filter, archived companies left out", async () => {
    scriptHealthyReads();
    script("account_health_snapshots", { data: null });
    await takeAccountHealthSnapshots(NOW);
    const companies = calls.find((c) => c.table === "companies");
    expect(companies?.filters).toContainEqual(["is", "archived_at", null]);
    expect(companies?.filters.filter((f) => f[0] === "or")).toHaveLength(3);
  });

  it("refuses to write when any read fails", async () => {
    script("companies", { data: [{ id: ACME, name: "Acme Widgets" }] });
    script("meetings", { data: [] });
    script("invoices", { error: { message: "invoices unavailable" } });
    script("client_backlog_items", { data: [] });
    script("portal_members", { data: [] });
    lastSignInsFor.mockResolvedValue(new Map());

    const r = await takeAccountHealthSnapshots(NOW);

    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain("invoices unavailable");
    expect(calls.some((c) => c.table === "account_health_snapshots")).toBe(false);
  });

  it("writes nothing when there are no accounts", async () => {
    script("companies", { data: [] });
    expect(await takeAccountHealthSnapshots(NOW)).toEqual({ ok: true, takenOn: "2026-09-26", accounts: 0 });
    expect(calls.map((c) => c.table)).toEqual(["companies"]);
  });
});

const row = (name: string, score: number | null, renewalSoon = false): AttentionRow => ({
  id: name,
  name,
  score,
  signals: null,
  renewal: null,
  renewalSoon,
});

describe("sortAttention", () => {
  it("puts the lowest score first and accounts with no reading last", () => {
    const got = sortAttention([row("Beta", 90), row("Unread", null), row("Alpha", 40), row("Gamma", 65)]);
    expect(got.map((r) => r.name)).toEqual(["Alpha", "Gamma", "Beta", "Unread"]);
  });

  it("breaks a tie with a renewal coming up, then the name", () => {
    const got = sortAttention([row("Zeta", 70), row("Eta", 70, true), row("Alpha", 70)]);
    expect(got.map((r) => r.name)).toEqual(["Eta", "Alpha", "Zeta"]);
  });
});

describe("loadAccountsNeedingAttention", () => {
  it("joins each account to the latest night's reading and its live renewal", async () => {
    script("companies", { data: [{ id: ACME, name: "Acme Widgets" }, { id: GLOBEX, name: "Globex Test Co" }] });
    script(
      "account_health_snapshots",
      { data: [{ taken_on: "2026-09-25" }] },
      {
        data: [
          { company_id: ACME, score: 85, signals: { daysSinceMeeting: 3, neverMet: false, overdueInvoices: 1, roadmapMoves30d: 2, portalSignInDays: null, portalNeverSignedIn: false } },
          // A row in a shape the schema refuses keeps its score but no words.
          { company_id: GLOBEX, score: 40, signals: { legacy: true } },
        ],
      },
    );
    script("renewals", { data: [{ id: "r1", company_id: ACME, renews_on: "2026-10-15", term_months: 12, status: "upcoming", note: null }] });

    const { rows, takenOn } = await loadAccountsNeedingAttention("2026-09-25");

    expect(takenOn).toBe("2026-09-25");
    expect(rows.map((r) => [r.name, r.score, r.renewalSoon, r.signals === null])).toEqual([
      ["Globex Test Co", 40, false, true],
      ["Acme Widgets", 85, true, false],
    ]);
  });

  it("shows every account unread before the routine has run", async () => {
    script("companies", { data: [{ id: ACME, name: "Acme Widgets" }] });
    script("account_health_snapshots", { data: [] });
    script("renewals", { data: [] });
    const { rows, takenOn } = await loadAccountsNeedingAttention("2026-09-25");
    expect(takenOn).toBeNull();
    expect(rows).toEqual([{ id: ACME, name: "Acme Widgets", score: null, signals: null, renewal: null, renewalSoon: false }]);
  });
});
