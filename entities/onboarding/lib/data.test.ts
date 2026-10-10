import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.46: the new-member intake processor writes to the record that carries bank
// and ID data, so a read that fails must never be taken as an empty answer.
// Each case fails one read and checks the write it guards does not happen:
// metadata is not replaced by the form's answers alone, no second team member
// is created, no login is taken from someone else, and no invite or Ops note
// goes out on a guess about whether the person applied.

type Res = { data: unknown; error: { message: string } | null };
const reads = vi.hoisted(() => ({ byTable: new Map<string, Res>() }));
const ok = (data: unknown): Res => ({ data, error: null });
const fail = (message: string): Res => ({ data: null, error: { message } });

function builder(table: string) {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(reads.byTable.get(table) ?? ok(null)).then(resolve),
    insert: vi.fn(async () => ({ error: null })),
  };
  for (const op of ["select", "eq", "neq", "not", "limit", "maybeSingle"]) b[op] = () => b;
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builder(table) },
  supabase: { auth: { admin: { inviteUserByEmail: vi.fn(async () => ({ data: { user: { id: "auth-1" } }, error: null })) } } },
}));
const writes = vi.hoisted(() => ({ people: [] as Record<string, unknown>[], teamInserts: [] as unknown[], teamUpdates: [] as unknown[] }));
vi.mock("@/kernel/identity/writes", () => ({
  updatePeople: (patch: Record<string, unknown>) => {
    writes.people.push(patch);
    return { eq: async () => ({ error: null }) };
  },
  insertTeamMembers: (row: unknown) => {
    writes.teamInserts.push(row);
    return { select: () => ({ maybeSingle: async () => ({ data: { id: "tm-new" }, error: null }) }) };
  },
  updateTeamMembers: (patch: unknown) => {
    writes.teamUpdates.push(patch);
    return { eq: async () => ({ error: null }) };
  },
}));
vi.mock("@/entities/hiring", () => ({ selectApplications: () => builder("applications") }));
vi.mock("@/entities/contacts", () => ({ upsertPeopleSensitiveRow: vi.fn(async () => ({ error: null })) }));
vi.mock("@/entities/retreats", () => ({ promoteSelfieToAvatar: vi.fn(async () => true) }));
vi.mock("@/entities/onboarding/lib/cycle", () => ({ ensureJourney: vi.fn(async () => undefined) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
const sent = vi.hoisted(() => ({ emails: [] as unknown[] }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async (m: unknown) => void sent.emails.push(m)) }));
vi.mock("@/kernel/identity/auth-users", () => ({ findAuthUserByEmail: vi.fn(async () => null) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://www.example.com" }));
vi.mock("@/entities/org", () => ({}));

const { processOnboardingSubmission } = await import("./data");

const field = (id: string, maps_to: string) => ({ id, config: { maps_to } }) as never;
function input(answers: Record<string, string>) {
  return {
    personId: "p1",
    email: "new@example.com",
    name: "New Member",
    fields: [field("f1", "people.metadata.fun_stuff"), field("f2", "people.github_login")],
    answers: new Map(Object.entries(answers)),
  };
}

beforeEach(() => {
  reads.byTable.clear();
  writes.people.length = 0;
  writes.teamInserts.length = 0;
  writes.teamUpdates.length = 0;
  sent.emails.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processOnboardingSubmission, rule 2 (Y.46)", () => {
  it("merges the form's metadata into what the person already has", async () => {
    reads.byTable.set("people", ok({ metadata: { kept: true } }));
    await processOnboardingSubmission(input({ f1: "chess" }));
    expect(writes.people[0].metadata).toMatchObject({ kept: true, fun_stuff: "chess", onboarding_completed_at: expect.any(String) });
  });

  it("does not replace the metadata when the current metadata cannot be read", async () => {
    reads.byTable.set("people", fail("timeout"));
    const r = await processOnboardingSubmission(input({ f1: "chess" }));
    expect(writes.people[0]).not.toHaveProperty("metadata");
    expect(r.warnings.join("\n")).toMatch(/people metadata not merged/);
  });

  it("creates no second team member when the current record cannot be read", async () => {
    reads.byTable.set("team_members", fail("timeout"));
    const r = await processOnboardingSubmission(input({}));
    expect(writes.teamInserts).toEqual([]);
    expect(writes.teamUpdates).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/team member not moved to pre-boarding/);
  });

  it("creates the team member when there is none", async () => {
    reads.byTable.set("team_members", ok(null));
    await processOnboardingSubmission(input({}));
    expect(writes.teamInserts).toHaveLength(1);
  });

  it("sends no invite and no Ops note when it cannot tell whether the person applied", async () => {
    reads.byTable.set("applications", fail("timeout"));
    const r = await processOnboardingSubmission(input({}));
    expect(sent.emails).toEqual([]);
    expect(writes.people.some((p) => "auth_user_id" in p)).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/could not tell whether this person applied/);
  });

  it("takes no GitHub login when it cannot check who holds it", async () => {
    reads.byTable.set("people", fail("timeout"));
    const r = await processOnboardingSubmission(input({ f2: "octocat" }));
    expect(writes.people.some((p) => "github_login" in p)).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/github login not set/);
  });
});
