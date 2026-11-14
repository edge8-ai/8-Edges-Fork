import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.5: what opening a cycle proposes, and the checks the screen's command
// makes before it opens one through the November script's own command.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({
  placements: [] as { team_member_id: string; client_manager_person_id: string | null }[],
  contacts: [] as { person_id: string; people: Record<string, unknown> | null }[],
  opened: vi.fn(async (_input: unknown) => ({ ok: true as const, cycleId: "cyc", reused: false, membersAdded: 1, partsAdded: 2, told: 1, emailed: 1 })),
}));
vi.mock("@/entities/contacts", () => ({
  activePlacementsWithClientManagerAt: async () => ({ data: h.placements, error: null }),
  contactLinksOfCompany: async () => ({ data: h.contacts, error: null }),
}));
vi.mock("./open-cycle", () => ({ openClientReviewCycle: (input: unknown) => h.opened(input) }));

import { clientContactsOf, openCycleForClient, openCycleProposal } from "./proposal";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const FRAMEWORK = "22222222-2222-4222-8222-222222222222";
const ROSHINI = "33333333-3333-4333-8333-333333333333";
const SAMI = "44444444-4444-4444-8444-444444444444";
const GONE = "88888888-8888-4888-8888-888888888888";
const TAM = "55555555-5555-4555-8555-555555555555";
const LOI = "66666666-6666-4666-8666-666666666666";
const OWNER = { personId: "99999999-9999-4999-8999-999999999999", ownTeamMemberIds: [] as string[] };

const person = (full_name: string, archived_at: string | null = null) => ({ full_name, display_name: null, preferred_name: null, email: null, first_name: null, last_name: null, archived_at });

beforeEach(() => {
  resetFake();
  h.opened.mockClear();
  h.contacts = [
    { person_id: ROSHINI, people: person("Roshini Manickam") },
    { person_id: SAMI, people: person("Sami Mian") },
    { person_id: GONE, people: person("Left the client", "2026-10-01T00:00:00Z") },
  ];
  h.placements = [];
});

describe("clientContactsOf", () => {
  it("offers the client's current contacts by name, never an archived one", async () => {
    expect(await clientContactsOf(CLIENT)).toEqual([
      { id: ROSHINI, name: "Roshini Manickam" },
      { id: SAMI, name: "Sami Mian" },
    ]);
  });
});

describe("openCycleProposal", () => {
  it("proposes each placed member with the client manager on their placement, and the last cycle's skip-manager", async () => {
    h.placements = [
      { team_member_id: TAM, client_manager_person_id: ROSHINI },
      { team_member_id: LOI, client_manager_person_id: SAMI },
    ];
    script("review_cycles", { data: [{ skip_manager_person_id: SAMI }] });
    script("team_members", {
      data: [
        { id: TAM, people: person("Nguyễn Minh Tâm") },
        { id: LOI, people: person("Nguyen Trung Loi") },
      ],
    });
    expect(await openCycleProposal(CLIENT)).toEqual({
      // By name, accents aside: Minh before Trung.
      members: [
        { teamMemberId: TAM, name: "Nguyễn Minh Tâm", clientManagerPersonId: ROSHINI },
        { teamMemberId: LOI, name: "Nguyen Trung Loi", clientManagerPersonId: SAMI },
      ],
      contacts: [
        { id: ROSHINI, name: "Roshini Manickam" },
        { id: SAMI, name: "Sami Mian" },
      ],
      skipManagerPersonId: SAMI,
    });
  });

  it("proposes no client manager or skip-manager who is no longer a current contact", async () => {
    h.placements = [{ team_member_id: TAM, client_manager_person_id: GONE }];
    script("review_cycles", { data: [{ skip_manager_person_id: GONE }] });
    script("team_members", { data: [{ id: TAM, people: person("Nguyễn Minh Tâm") }] });
    const proposal = await openCycleProposal(CLIENT);
    expect(proposal.members).toEqual([{ teamMemberId: TAM, name: "Nguyễn Minh Tâm", clientManagerPersonId: null }]);
    expect(proposal.skipManagerPersonId).toBeNull();
  });

  it("proposes nobody for a client with no active placement, and reads no team member", async () => {
    script("review_cycles", { data: [] });
    expect(await openCycleProposal(CLIENT)).toMatchObject({ members: [], skipManagerPersonId: null });
  });
});

describe("openCycleForClient", () => {
  const input = { companyId: CLIENT, frameworkId: FRAMEWORK, name: "November 2026", skipManagerPersonId: null, members: [{ teamMemberId: TAM, clientManagerPersonId: ROSHINI }] };

  /** The command's checks: the client is an active customer, who is on the team now, and the client's cycles. */
  function checks({ customer = true, onTeam = [TAM], cycles = [] as { id: string; name: string }[] } = {}) {
    script("companies", { data: customer ? [{ id: CLIENT }] : [] });
    script("team_members", { data: onTeam.map((id) => ({ id })) });
    script("review_cycles", { data: cycles });
  }

  it("opens through the November script's command, as the person acting, and with no skip-manager", async () => {
    checks();
    expect(await openCycleForClient(input, OWNER)).toEqual({ ok: true, cycleId: "cyc", reused: false });
    expect(h.opened).toHaveBeenCalledWith({ ...input, openedByPersonId: OWNER.personId });
  });

  it("refuses a client manager or a skip-manager who is not a current contact", async () => {
    checks();
    expect((await openCycleForClient({ ...input, members: [{ teamMemberId: TAM, clientManagerPersonId: GONE }] }, OWNER)).ok).toBe(false);
    checks();
    expect((await openCycleForClient({ ...input, skipManagerPersonId: GONE }, OWNER)).ok).toBe(false);
    expect(h.opened).not.toHaveBeenCalled();
  });

  // The boundary review on PR 2600: the command checks what the page offered.
  it("refuses a company that is not an active customer", async () => {
    checks({ customer: false });
    expect(await openCycleForClient(input, OWNER)).toEqual({ ok: false, error: "Choose one of the active clients." });
    expect(h.opened).not.toHaveBeenCalled();
  });

  it("refuses someone who is not on the team now", async () => {
    checks({ onTeam: [] });
    expect(await openCycleForClient(input, OWNER)).toEqual({ ok: false, error: "Everyone reviewed must be on the team now. Reload the page." });
    expect(h.opened).not.toHaveBeenCalled();
  });

  it("never adds to a cycle the client already has, and names it", async () => {
    checks({ cycles: [{ id: "c-nov", name: "november 2026 " }] });
    expect(await openCycleForClient(input, OWNER)).toEqual({
      ok: false,
      error: "This client already has a cycle with that name. Add people from its overview, or choose another name.",
      cycleId: "c-nov",
    });
    expect(h.opened).not.toHaveBeenCalled();
  });

  it("refuses opening a cycle that reviews the person opening it", async () => {
    expect(await openCycleForClient(input, { ...OWNER, ownTeamMemberIds: [TAM] })).toEqual({ ok: false, error: "You are on this list, so a colleague opens the cycle with you in it." });
    // A second engagement row is still them.
    expect(await openCycleForClient(input, { ...OWNER, ownTeamMemberIds: ["tm-other-row", TAM] })).toEqual({ ok: false, error: "You are on this list, so a colleague opens the cycle with you in it." });
    expect(h.opened).not.toHaveBeenCalled();
  });
});
