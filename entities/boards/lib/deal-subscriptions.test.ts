import { beforeEach, describe, expect, it, vi } from "vitest";

// Boards' side of a won deal (S.2).
//
// `ensureProgramBoard` is reached today from exactly two places, and both of
// them are programme CREATION: portal/lib/ai-programs.ts and htt's
// registrations. A programme created from the CRM admin screen
// (/admin/revenue/companies/[id]/programs) gets no board at all — that page
// only reads boards — so delivery for a client sold through the pipeline had
// no board until somebody went through one of the other two paths by hand.
//
// Crm may not call boards: boards is the entity that requires crm. So the win
// is a fact and this is the reaction.

const ensureProgramBoard = vi.fn(async (p: { id: string }) => ({ ok: true as const, id: `board-${p.id}`, slug: "s", created: true }));
vi.mock("./create", () => ({ ensureProgramBoard: (p: { id: string }) => ensureProgramBoard(p) }));

let programs: { ok: boolean; programs?: unknown[]; error?: string } = { ok: true, programs: [] };
vi.mock("@/entities/client-programs", () => ({
  liveProgramsForCompany: async () => programs,
}));

import { openDeliveryBoardsForWin } from "./deal-subscriptions";

const WON = {
  dealId: "deal-1",
  companyId: "co-1",
  personId: "person-1",
  amountUsdCents: 1_200_000,
  closedAt: "2026-09-22T04:00:00.000Z",
};

beforeEach(() => {
  ensureProgramBoard.mockClear();
  programs = { ok: true, programs: [] };
});

describe("openDeliveryBoardsForWin", () => {
  it("opens a board for every live programme the winning account runs", async () => {
    programs = {
      ok: true,
      programs: [
        { id: "prog-1", companyId: "co-1", name: "Install 8 Edges OS" },
        { id: "prog-2", companyId: "co-1", name: "Revenue Cockpit" },
      ],
    };
    await openDeliveryBoardsForWin(WON);
    expect(ensureProgramBoard.mock.calls.map(([p]) => p)).toEqual([
      { id: "prog-1", name: "Install 8 Edges OS", companyId: "co-1" },
      { id: "prog-2", name: "Revenue Cockpit", companyId: "co-1" },
    ]);
  });

  it("does nothing for a win nobody has mapped to an account", async () => {
    // There is no client to open a board for, and guessing one from the person
    // would be boards inventing an account link crm did not make.
    await openDeliveryBoardsForWin({ ...WON, companyId: null });
    expect(ensureProgramBoard).not.toHaveBeenCalled();
  });

  it("does nothing when the account runs no programme yet", async () => {
    await openDeliveryBoardsForWin(WON);
    expect(ensureProgramBoard).not.toHaveBeenCalled();
  });

  it("throws when the programmes could not be read, so the bus audits the drop", async () => {
    // Silence would look exactly like "this client has no programmes", which
    // is the normal case — the one shape of failure nobody would ever notice.
    programs = { ok: false, error: "connection reset" };
    await expect(openDeliveryBoardsForWin(WON)).rejects.toThrow(/co-1/);
  });

  it("throws when a board could not be opened", async () => {
    programs = { ok: true, programs: [{ id: "prog-1", companyId: "co-1", name: "Install 8 Edges OS" }] };
    ensureProgramBoard.mockResolvedValueOnce({ ok: false, error: "slug clash" } as never);
    await expect(openDeliveryBoardsForWin(WON)).rejects.toThrow(/prog-1/);
  });
});
