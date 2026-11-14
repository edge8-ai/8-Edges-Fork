import { beforeEach, describe, expect, it, vi } from "vitest";

// What a booked discovery call does to a person's record: a new person becomes
// a lead, early leads move to meeting booked, later stages and customers are
// left alone, and each event is logged once however many days it is seen.

const db = vi.hoisted(() => ({
  isTeam: false,
  lead: null as { status: string } | null,
  openDeals: 0,
  customerCompanies: [] as { id: string }[],
  links: [] as { company_id: string }[],
  hostCompany: [] as { company_id: string }[],
  interactions: [] as { id: string; occurred_at: string }[],
}));
const spies = vi.hoisted(() => ({
  upsertLead: vi.fn(async (_row: unknown, _opts: unknown) => ({ error: null })),
  recordTransition: vi.fn(async (_t: unknown) => undefined),
  bump: vi.fn(async () => undefined),
  insert: vi.fn(async (_row: unknown) => ({ error: null })),
  move: vi.fn((_patch: unknown) => ({ eq: async () => ({ error: null }) })),
  link: vi.fn(async () => ({ error: null })),
  byHost: vi.fn(async () => ({ data: db.hostCompany, error: null })),
}));

// Every read here ends in .limit(1); the table says which fixture answers.
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        limit: async () => {
          if (table === "people") return { data: [{ is_team_member: db.isTeam }], error: null };
          if (table === "companies") return { data: db.customerCompanies, error: null };
          return { data: db.interactions, error: null };
        },
      };
      return chain;
    },
  },
}));
vi.mock("@/kernel/data/read", () => ({ mustRows: (r: { data: unknown[] }) => r.data }));
vi.mock("@/kernel/data/company-os", () => ({
  getOrCreatePerson: async (i: { email: string }) => ({ ok: true, id: `id:${i.email}` }),
}));
vi.mock("@/kernel/identity/free-mail", () => ({
  companyDomainOf: (email: string) => (email.endsWith("@gmail.com") ? null : email.split("@")[1]),
}));
vi.mock("@/kernel/identity/writes", () => ({
  findOrCreateCompanyByHost: spies.byHost,
  updatePeople: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
}));
vi.mock("@/kernel/messaging/writes", () => ({ insertInteractions: spies.insert, updateInteractions: spies.move }));
vi.mock("@/entities/contacts", () => ({
  companyIdsOfPerson: async () => ({ data: db.links, error: null }),
  linkPersonToCompanyOnce: spies.link,
}));
vi.mock("./lifecycle", () => ({
  getLead: async () => ({ ok: true, lead: db.lead }),
  recordTransition: spies.recordTransition,
  bumpPersonCompanies: spies.bump,
}));
vi.mock("./reads", () => ({
  selectDeals: () => {
    const chain = { eq: () => chain, in: () => chain, is: async () => ({ count: db.openDeals, error: null }) };
    return chain;
  },
}));
vi.mock("./writes", () => ({ upsertLead: spies.upsertLead }));

import { isDiscoveryCall, leadMoveFor, recordScheduledDiscoveryCall } from "./scheduled-discovery-call";

const call = {
  eventId: "evt_0",
  title: "Ada Example and Host Example: AI Discovery Call",
  startsAt: "2026-11-12T03:00:00.000Z",
  attendees: [{ email: "ada@example.test", name: null }],
};

beforeEach(() => {
  Object.assign(db, { isTeam: false, lead: null, openDeals: 0, customerCompanies: [], links: [], hostCompany: [], interactions: [] });
  Object.values(spies).forEach((s) => s.mockClear());
});

describe("isDiscoveryCall", () => {
  it("matches a booking's title and nothing else", () => {
    expect(isDiscoveryCall("Bo Example and Host Example: AI Discovery Call")).toBe(true);
    expect(isDiscoveryCall("Weekly client sync")).toBe(false);
  });
});

describe("leadMoveFor", () => {
  it.each([
    [null, false, "create"],
    [null, true, "none"],
    ["new", false, "advance"],
    ["attempting", false, "advance"],
    ["connected", false, "advance"],
    ["meeting_booked", false, "none"],
    ["open_deal", false, "none"],
    ["nurture", false, "none"],
    ["unqualified", false, "none"],
  ] as const)("status %s, customer %s: %s", (status, customer, move) => {
    expect(leadMoveFor(status, customer)).toBe(move);
  });
});

describe("recordScheduledDiscoveryCall", () => {
  it("makes a new person a booked lead and logs the call", async () => {
    const out = await recordScheduledDiscoveryCall(call);
    expect(out).toMatchObject({ leadsCreated: 1, call: "logged" });
    expect(spies.upsertLead.mock.calls[0][0]).toMatchObject({ status: "meeting_booked", sla_due_at: null });
    expect(spies.recordTransition.mock.calls[0][0]).toMatchObject({ fromStatus: null, toStatus: "meeting_booked" });
    expect(spies.insert.mock.calls[0][0]).toMatchObject({
      kind: "meeting",
      occurred_at: call.startsAt,
      metadata: { source: "lark_calendar", lark_event_id: "evt_0" },
    });
  });

  it("moves an early lead forward, from the status it held", async () => {
    db.lead = { status: "attempting" };
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ leadsAdvanced: 1 });
    expect(spies.recordTransition.mock.calls[0][0]).toMatchObject({ fromStatus: "attempting" });
  });

  it("leaves a deal's stage alone but still records the call", async () => {
    db.lead = { status: "open_deal" };
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ stageKept: 1, call: "logged" });
    expect(spies.upsertLead).not.toHaveBeenCalled();
  });

  it("never makes a lead of someone at a customer account", async () => {
    db.links = [{ company_id: "c1" }];
    db.customerCompanies = [{ id: "c1" }];
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ leadsCreated: 0, stageKept: 1, call: "logged" });
    expect(spies.upsertLead).not.toHaveBeenCalled();
  });

  it("skips a colleague on the invite and logs nothing for them", async () => {
    db.isTeam = true;
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ teamSkipped: 1, call: "no_contact" });
    expect(spies.upsertLead).not.toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("does not log an event twice", async () => {
    db.lead = { status: "meeting_booked" };
    db.interactions = [{ id: "i1", occurred_at: "2026-11-12T03:00:00+00:00" }];
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ call: "unchanged" });
    expect(spies.insert).not.toHaveBeenCalled();
    expect(spies.move).not.toHaveBeenCalled();
  });

  it("moves the entry when the call is rescheduled", async () => {
    db.lead = { status: "meeting_booked" };
    db.interactions = [{ id: "i1", occurred_at: "2026-11-11T03:00:00+00:00" }];
    expect(await recordScheduledDiscoveryCall(call)).toMatchObject({ call: "moved" });
    expect(spies.move).toHaveBeenCalledWith({ occurred_at: call.startsAt });
  });

  it("links a person to a company their domain already names, and never creates one", async () => {
    db.hostCompany = [{ company_id: "c9" }];
    await recordScheduledDiscoveryCall(call);
    expect(spies.byHost).toHaveBeenCalledWith("example.test", null, false);
    expect(spies.link).toHaveBeenCalledWith("id:ada@example.test", "c9", true);
  });

  it("looks up no company for a free mailbox", async () => {
    await recordScheduledDiscoveryCall({ ...call, attendees: [{ email: "ada@gmail.com", name: null }] });
    expect(spies.byHost).not.toHaveBeenCalled();
  });
});
