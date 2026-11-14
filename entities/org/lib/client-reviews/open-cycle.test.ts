import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.1.2: opening a client review cycle. The command writes the cycle, its
// members and their review parts, tells each member, and never tells a client
// contact. These tests drive it through its one export over the house fake.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("../reviews/ask-raters", () => ({ askRaters: vi.fn(async (ids: string[]) => ids.length) }));
vi.mock("./notices", () => ({ emailMembersTheirReviewIsOpen: vi.fn(async (ids: string[]) => ids.length) }));

import { askRaters } from "../reviews/ask-raters";
import { emailMembersTheirReviewIsOpen } from "./notices";
import { openClientReviewCycle } from "./open-cycle";

const FRAMEWORK = "ea140000-0000-4000-8000-000000000001";
const COMPANY = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SKIP = "33333333-3333-4333-8333-333333333333";
const CM = "44444444-4444-4444-8444-444444444444";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const CYCLE = "77777777-7777-4777-8777-777777777777";

const framework = {
  id: FRAMEWORK,
  rating_scale: "frequency-4",
  archived_at: null,
  member_survey: { slug: "competency-review-nov-self" },
  rater_survey: { slug: "competency-review-nov-rater" },
};

const input = (over: Record<string, unknown> = {}) => ({
  companyId: COMPANY,
  frameworkId: FRAMEWORK,
  name: "November 2026",
  openedByPersonId: OWNER,
  skipManagerPersonId: SKIP,
  members: [
    { teamMemberId: ANA, clientManagerPersonId: CM },
    { teamMemberId: BAO, clientManagerPersonId: null },
  ],
  ...over,
});

type PartRow = { team_member_id: string; rater_kind: string; review_type: string; review_cycle_id: string; access_token?: string; metadata?: { survey_slug?: string } };
const insertedParts = (): PartRow[] =>
  calls.filter((c) => c.table === "performance_reviews" && c.ops.includes("insert")).flatMap((c) => c.payloads[0] as PartRow[]);

beforeEach(() => {
  resetFake();
  vi.mocked(askRaters).mockClear();
  vi.mocked(emailMembersTheirReviewIsOpen).mockClear();
});

describe("openClientReviewCycle", () => {
  it("refuses a list that names the same member twice, before touching the database", async () => {
    const res = await openClientReviewCycle(input({ members: [{ teamMemberId: ANA, clientManagerPersonId: CM }, { teamMemberId: ANA, clientManagerPersonId: CM }] }));
    expect(res).toEqual({ ok: false, error: "A member is listed twice." });
    expect(calls).toHaveLength(0);
  });

  it("refuses a retired framework", async () => {
    script("review_frameworks", { data: [{ ...framework, archived_at: "2026-11-01T00:00:00Z" }] });
    const res = await openClientReviewCycle(input());
    expect(res).toEqual({ ok: false, error: "That framework is retired." });
  });

  it("opens a cycle with one part per member and kind, on the framework's forms and scale", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [] }, { data: { id: CYCLE } });
    script("review_cycle_members", { data: [] }, { data: null });
    script("performance_reviews", { data: [] }, {
      data: [
        { id: "p1", rater_kind: "self", team_member_id: ANA },
        { id: "p2", rater_kind: "client_manager", team_member_id: ANA },
        { id: "p3", rater_kind: "skip_manager", team_member_id: ANA },
        { id: "p4", rater_kind: "self", team_member_id: BAO },
        { id: "p5", rater_kind: "skip_manager", team_member_id: BAO },
      ],
    });

    const res = await openClientReviewCycle(input());

    expect(res).toMatchObject({ ok: true, cycleId: CYCLE, reused: false, membersAdded: 2, partsAdded: 5 });
    const parts = insertedParts();
    expect(parts.map((p) => `${p.team_member_id === ANA ? "ana" : "bao"}:${p.rater_kind}`).sort()).toEqual([
      "ana:client_manager",
      "ana:self",
      "ana:skip_manager",
      "bao:self",
      "bao:skip_manager",
    ]);
    for (const p of parts) {
      expect(p.review_type).toBe("client");
      expect(p.review_cycle_id).toBe(CYCLE);
    }
    expect(parts.find((p) => p.rater_kind === "self")?.metadata?.survey_slug).toBe("competency-review-nov-self");
    const cm = parts.find((p) => p.rater_kind === "client_manager");
    expect(cm?.metadata?.survey_slug).toBe("competency-review-nov-rater");
    expect(cm?.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("writes every part with the same keys, so no part is sent a NULL where the column has a default", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [] }, { data: { id: CYCLE } });
    script("review_cycle_members", { data: [] }, { data: null });
    script("performance_reviews", { data: [] }, { data: [] });
    await openClientReviewCycle(input());
    const parts = insertedParts() as unknown as Array<Record<string, unknown>>;
    const keys = (row: Record<string, unknown>) => Object.keys(row).sort().join(",");
    expect(new Set(parts.map(keys)).size).toBe(1);
    for (const p of parts) expect(p.metadata).toEqual(expect.any(Object));
  });

  it("gives a member with no client manager no client manager part", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [] }, { data: { id: CYCLE } });
    script("review_cycle_members", { data: [] }, { data: null });
    script("performance_reviews", { data: [] }, { data: [] });
    await openClientReviewCycle(input({ skipManagerPersonId: null }));
    const bao = insertedParts().filter((p) => p.team_member_id === BAO);
    expect(bao.map((p) => p.rater_kind)).toEqual(["self"]);
  });

  it("tells and emails only the members, never a client manager or a skip-manager", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [] }, { data: { id: CYCLE } });
    script("review_cycle_members", { data: [] }, { data: null });
    script("performance_reviews", { data: [] }, {
      data: [
        { id: "p1", rater_kind: "self", team_member_id: ANA },
        { id: "p2", rater_kind: "client_manager", team_member_id: ANA },
        { id: "p3", rater_kind: "skip_manager", team_member_id: ANA },
      ],
    });
    await openClientReviewCycle(input({ members: [{ teamMemberId: ANA, clientManagerPersonId: CM }] }));
    expect(vi.mocked(askRaters).mock.calls).toEqual([[["p1"]]]);
    expect(vi.mocked(emailMembersTheirReviewIsOpen).mock.calls).toEqual([[[ANA]]]);
  });

  it("finishes a half-opened cycle on a second run, writing and telling only what is missing", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [{ id: CYCLE, name: "november 2026", closed_at: null, skip_manager_person_id: SKIP, framework_id: FRAMEWORK }] });
    script("review_cycle_members", { data: [{ team_member_id: ANA }] }, { data: null });
    script(
      "performance_reviews",
      { data: [{ team_member_id: ANA, rater_kind: "self" }, { team_member_id: ANA, rater_kind: "client_manager" }, { team_member_id: ANA, rater_kind: "skip_manager" }] },
      { data: [{ id: "p4", rater_kind: "self", team_member_id: BAO }, { id: "p5", rater_kind: "skip_manager", team_member_id: BAO }] },
    );

    const res = await openClientReviewCycle(input());

    expect(res).toMatchObject({ ok: true, cycleId: CYCLE, reused: true, membersAdded: 1, partsAdded: 2 });
    expect(calls.some((c) => c.table === "review_cycles" && c.ops.includes("insert"))).toBe(false);
    expect(insertedParts().every((p) => p.team_member_id === BAO)).toBe(true);
    expect(vi.mocked(askRaters).mock.calls).toEqual([[["p4"]]]);
  });

  it("refuses to finish a cycle that runs a different framework", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: null, skip_manager_person_id: SKIP, framework_id: "ea140000-0000-4000-8000-000000000002" }] });
    const res = await openClientReviewCycle(input());
    expect(res).toEqual({ ok: false, error: "That cycle runs a different framework." });
    expect(insertedParts()).toHaveLength(0);
  });

  it("never reopens a closed cycle of the same name", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: "2026-11-30T00:00:00Z", skip_manager_person_id: SKIP, framework_id: FRAMEWORK }] });
    const res = await openClientReviewCycle(input());
    expect(res).toEqual({ ok: false, error: "A closed cycle already has that name." });
  });

  it("raises when the parts already written cannot be read, rather than writing a second set", async () => {
    script("review_frameworks", { data: [framework] });
    script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: null, skip_manager_person_id: SKIP, framework_id: FRAMEWORK }] });
    script("review_cycle_members", { data: [{ team_member_id: ANA }, { team_member_id: BAO }] });
    script("performance_reviews", { error: { message: "connection reset" } });
    await expect(openClientReviewCycle(input())).rejects.toThrow(/parts of the cycle/);
    expect(insertedParts()).toHaveLength(0);
  });
});
