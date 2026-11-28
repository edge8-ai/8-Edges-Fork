import { beforeEach, describe, expect, it, vi } from "vitest";

// The Weekly status page's actions (Z.12.2): since the client's own team holds
// client-programs.status-release at scope clients, each action asks whether
// that reach covers the company on the report's own row. The actions take no
// company from the caller, so a team member cannot edit another client's
// draft by naming a report of theirs. The flows are stood in for by recorders:
// a refused action must reach none of them. The stand-in access object answers
// as the resolver does: scope all reaches every company, scope clients only
// the person's clients, and with no target either is enough.

const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "cccccccc-0000-4000-8000-000000000003";
const MINE = "11111111-0000-4000-8000-000000000001";
const THEIRS = "33333333-0000-4000-8000-000000000003";
const MISSING = "99999999-0000-4000-8000-000000000009";

const seen = vi.hoisted(() => ({
  holds: new Set<string>(),
  clientHolds: new Set<string>(),
  clients: [] as string[],
  reportCompanies: new Map<string, string>(),
  readFails: false,
  flows: [] as string[],
}));

vi.mock("@/kernel/identity/access-request", () => {
  const may = (q: string, target?: { company?: string }) =>
    seen.holds.has(q) || (seen.clientHolds.has(q) && (!target || (target.company !== undefined && seen.clients.includes(target.company))));
  return {
    requirePermission: async (p: string) => {
      if (!may(p)) throw new Error("NEXT_NOT_FOUND");
      return { personId: "person-1", user: { email: "owner@example.test" }, may };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/entities/boards", () => ({ getWorkboard: async () => null }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://edge8.test" }));
vi.mock("@/entities/client-programs/lib/client-status/review", () => ({
  reportCompanyId: async (id: string) => {
    if (seen.readFails) throw new Error("connection reset");
    return seen.reportCompanies.get(id) ?? null;
  },
  editSummary: async (id: string) => {
    seen.flows.push(`edit ${id}`);
    return { ok: true, version: "abcdefabcdef" };
  },
  draftAgain: async (id: string) => {
    seen.flows.push(`draft ${id}`);
    return { ok: true };
  },
  adoptPlainReport: async (id: string) => {
    seen.flows.push(`plain ${id}`);
    return { ok: true };
  },
}));

const { editClientStatusSummary, draftClientStatusAgain, makePlainClientStatus } = await import("./actions");

const edit = (reportId: string) => editClientStatusSummary({ reportId, version: "abcdefabcdef", summary: "A good week." });
const all = (reportId: string) => [edit(reportId), draftClientStatusAgain({ reportId }), makePlainClientStatus({ reportId })];

const onClientTeam = () => {
  seen.holds = new Set(["surface.team", "team.clients"]);
  seen.clientHolds = new Set(["client-programs.status", "client-programs.status-release"]);
  seen.clients = [CO];
};

beforeEach(() => {
  seen.holds = new Set();
  seen.clientHolds = new Set();
  seen.clients = [];
  seen.reportCompanies = new Map([[MINE, CO], [THEIRS, OTHER]]);
  seen.readFails = false;
  seen.flows = [];
});

describe("the Weekly status actions", () => {
  it("let someone on the client's team edit, draft again and use the plain report on their own client's report", async () => {
    onClientTeam();
    const results = await Promise.all(all(MINE));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(seen.flows.sort()).toEqual([`draft ${MINE}`, `edit ${MINE}`, `plain ${MINE}`]);
  });

  it("refuse someone on one client's team on another client's report, and run no flow", async () => {
    onClientTeam();
    for (const r of await Promise.all(all(THEIRS))) expect(r).toEqual({ ok: false, error: "That is not a report." });
    expect(seen.flows).toEqual([]);
  });

  it("let an Admin act on any client's report", async () => {
    seen.holds = new Set(["client-programs.status", "client-programs.status-release"]);
    const results = await Promise.all([...all(MINE), ...all(THEIRS)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(seen.flows).toHaveLength(6);
  });

  it("refuse a report that does not exist in the same words, and a failed read in its own", async () => {
    seen.holds = new Set(["client-programs.status", "client-programs.status-release"]);
    for (const r of await Promise.all(all(MISSING))) expect(r).toEqual({ ok: false, error: "That is not a report." });
    seen.readFails = true;
    for (const r of await Promise.all(all(MINE))) expect(r).toEqual({ ok: false, error: "The report could not be read: connection reset" });
    expect(seen.flows).toEqual([]);
  });

  it("refuse someone who holds neither atom before reading anything", async () => {
    seen.holds = new Set(["surface.team"]);
    for (const p of all(MINE)) await expect(p).rejects.toThrow("NEXT_NOT_FOUND");
    expect(seen.flows).toEqual([]);
  });
});
