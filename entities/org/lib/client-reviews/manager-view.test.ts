import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.6: what a client manager's one link to a cycle shows. The token is the
// whole credential and only this cycle's links are compared, so a wrong
// token, another cycle's token and a cancelled link all show the same words
// and nothing of the cycle; a closed cycle is named; and each member's row
// opens that member's form under the form's own token, once the rules let
// the manager in.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { hubRow, managerHubView } from "./manager-view";
import type { ClientReviewFacts } from "./rules";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const ROSA = "22222222-2222-4222-8222-222222222222";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const CHI = "77777777-7777-4777-8777-777777777777";
const TOKEN = "manager-token-0123456789abcdefghijklmnopqrstu";

const links = (over: Record<string, unknown> = {}) => ({
  data: [
    { client_manager_person_id: "88888888-8888-4888-8888-888888888888", access_token: "another-managers-token-0123456789abcdefghijk", cancelled_at: null },
    { client_manager_person_id: ROSA, access_token: TOKEN, cancelled_at: null, ...over },
  ],
});
const cycle = (over: Record<string, unknown> = {}) => ({
  data: [{ id: CYCLE, name: "November 2026", closed_at: null, framework_id: "f", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, due_date: "2026-12-04", companies: { name: "Northwind" }, ...over }],
});
const member = (id: string) => ({ team_member_id: id, withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null });
const part = (teamMemberId: string, kind: string, status: string, over: Record<string, unknown> = {}) => ({
  id: `${teamMemberId.slice(0, 4)}-${kind}`,
  team_member_id: teamMemberId,
  rater_kind: kind,
  review_type: "client",
  status,
  submitted_at: status === "submitted" ? "2026-11-25T03:00:00Z" : null,
  metadata: kind === "client_manager" ? { survey_slug: "rater-form" } : { survey_slug: "self-form" },
  access_token: kind === "client_manager" ? `part-token-${teamMemberId.slice(0, 4)}` : null,
  ...over,
});

const NO = { kind: "no_longer_works" };

beforeEach(() => resetFake());

describe("a link that does not work", () => {
  it("shows the same words for an unknown token, reading nothing past the links", async () => {
    script("review_cycle_manager_links", links());
    expect(await managerHubView(CYCLE, "guessed-token-0123456789abcdefghijklmnopqrstu")).toEqual(NO);
    expect(calls.map((c) => c.table)).toEqual(["review_cycle_manager_links"]);
    expect(calls[0]!.filters).toEqual([["eq", "cycle_id", CYCLE]]);
  });

  it("does not open under another cycle: only that cycle's links are compared", async () => {
    // The token is real, but in another cycle, so this cycle's links do not hold it.
    script("review_cycle_manager_links", { data: [{ client_manager_person_id: ROSA, access_token: "this-cycles-token-0123456789abcdefghijklmno", cancelled_at: null }] });
    expect(await managerHubView(CYCLE, TOKEN)).toEqual(NO);
  });

  it("shows the same words for a cancelled link, and nothing of the cycle", async () => {
    script("review_cycle_manager_links", links({ cancelled_at: "2026-11-20T00:00:00Z" }));
    expect(await managerHubView(CYCLE, TOKEN)).toEqual(NO);
    expect(calls.some((c) => c.table === "review_cycles")).toBe(false);
  });

  it("asks nothing for no token or a cycle id that is not one", async () => {
    expect(await managerHubView(CYCLE, null)).toEqual(NO);
    expect(await managerHubView("../etc", TOKEN)).toEqual(NO);
    expect(calls).toEqual([]);
  });

  it("names a closed cycle, as every client review link does", async () => {
    script("review_cycle_manager_links", links());
    script("review_cycles", cycle({ closed_at: "2026-11-30T00:00:00Z" }));
    expect(await managerHubView(CYCLE, TOKEN)).toEqual({ kind: "closed", cycleName: "November 2026", closedAt: "2026-11-30T00:00:00Z" });
    expect(calls.some((c) => c.table === "review_cycle_members")).toBe(false);
  });

  it("opens nothing once the manager reviews nobody still in the cycle", async () => {
    script("review_cycle_manager_links", links());
    script("review_cycles", cycle());
    script("review_cycle_members", { data: [] });
    expect(await managerHubView(CYCLE, TOKEN)).toEqual(NO);
  });
});

describe("a link that works", () => {
  it("lists the manager's own members still in the cycle, each opening their form under its own token", async () => {
    script("review_cycle_manager_links", links());
    script("review_cycles", cycle());
    script("review_cycle_members", { data: [member(BAO), member(ANA), member(CHI)] });
    script("performance_reviews", {
      data: [
        part(ANA, "self", "submitted"),
        part(ANA, "client_manager", "open"),
        part(BAO, "self", "open"),
        part(BAO, "client_manager", "open"),
        part(CHI, "self", "submitted"),
        part(CHI, "client_manager", "submitted"),
      ],
    });
    script("team_members", { data: [{ id: ANA, people: { full_name: "Ana Perez" } }, { id: BAO, people: { full_name: "Ben Okafor" } }, { id: CHI, people: { full_name: "Cleo Hart" } }] });
    script("people", { data: [{ full_name: "Rosa Vance", first_name: "Rosa" }] });

    const view = await managerHubView(CYCLE, TOKEN);

    expect(view).toEqual({
      kind: "list",
      cycleName: "November 2026",
      clientName: "Northwind",
      managerGreeting: "Rosa",
      dueDate: "2026-12-04",
      rows: [
        { teamMemberId: ANA, name: "Ana Perez", state: "not_started", sentAt: null, href: `/surveys/rater-form?review=5555-client_manager&t=part-token-5555` },
        { teamMemberId: BAO, name: "Ben Okafor", state: "waiting", sentAt: null, href: null },
        { teamMemberId: CHI, name: "Cleo Hart", state: "sent", sentAt: "2026-11-25T03:00:00Z", href: `/surveys/rater-form?review=7777-client_manager&t=part-token-7777` },
      ],
    });
    // Only this manager's members, and only those still in the cycle.
    const members = calls.find((c) => c.table === "review_cycle_members")!;
    expect(members.filters).toEqual(expect.arrayContaining([["eq", "cycle_id", CYCLE], ["eq", "client_manager_person_id", ROSA], ["is", "withdrawn_at", null]]));
    // A member's address never reaches the client: their names are read without it.
    expect(String(calls.find((c) => c.table === "team_members")!.columns)).not.toContain("email");
  });
});

describe("one member's row", () => {
  const facts = (over: Partial<{ member: string; cm: string; cancelled: boolean; unlocked: string | null }> = {}): ClientReviewFacts => ({
    cycle: { closedAt: null, hasSkipManager: false, skipManagerLinkCancelled: false },
    member: { withdrawnAt: null, raterUnlockedAt: over.unlocked ?? null, skipWaivedAt: null, releasedAt: null },
    parts: {
      member: { status: (over.member ?? "submitted") as "submitted" },
      clientManager: { status: (over.cm ?? "open") as "open", linkCancelled: over.cancelled ?? false },
      skipManager: null,
    },
  });
  const cm = (status: string) => part(ANA, "client_manager", status) as never;

  it("reads a saved, unsent part as in progress", () => {
    expect(hubRow(facts({ cm: "draft" }), cm("draft"), "Ana")?.state).toBe("in_progress");
  });

  it("opens a part the owner unlocked before the member sent theirs", () => {
    expect(hubRow(facts({ member: "open", unlocked: "2026-11-20T00:00:00Z" }), cm("open"), "Ana")).toMatchObject({ state: "not_started", href: expect.stringContaining("t=part-token-5555") });
  });

  it("leaves off a member with no client manager part, or one whose own link was cancelled", () => {
    expect(hubRow(facts(), null, "Ana")).toBeNull();
    expect(hubRow(facts({ cancelled: true }), cm("open"), "Ana")).toBeNull();
  });
});
