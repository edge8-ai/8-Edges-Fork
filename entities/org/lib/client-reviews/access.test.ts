import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.2: who may fill a part of a client review. The module reads the rows
// and asks the rules module; these tests drive it over the house fake and pin
// the answers a link page and the submit endpoint act on.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientPartAccess, teamMemberIdsOf, tokenMatches } from "./access";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const TOKEN = "a-long-random-link-token";

const part = (kind: string, over: Record<string, unknown> = {}) => ({
  id: `${kind}-part`,
  team_member_id: ANA,
  rater_kind: kind,
  review_type: "client",
  status: "open",
  submitted_at: null,
  ratings: {},
  achievements: null,
  improvements: null,
  comments: null,
  metadata: {},
  access_token: kind === "client_manager" ? TOKEN : null,
  ...over,
});

type Setup = {
  closedAt?: string | null;
  member?: Record<string, unknown>;
  self?: Record<string, unknown>;
  clientManager?: Record<string, unknown>;
};

/** Scripts the four reads one access check makes, in the order it makes them. */
function setup({ closedAt = null, member = {}, self = {}, clientManager = {} }: Setup = {}) {
  script(
    "performance_reviews",
    { data: [{ cycle_label: `client:${CYCLE}`, team_member_id: ANA }] },
    { data: [part("self", self), part("client_manager", clientManager), part("skip_manager")] },
  );
  script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: closedAt, framework_id: "fw", skip_manager_person_id: "tim", skip_manager_link_cancelled_at: null }] });
  script("review_cycle_members", { data: [{ withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null, ...member }] });
}

const asClientManager = (token: string | null, stored: string | null = TOKEN) =>
  clientPartAccess({ id: "client_manager-part", rater_kind: "client_manager", team_member_id: ANA, access_token: stored }, { token, teamMemberId: null });

beforeEach(() => resetFake());

describe("the client manager's link", () => {
  it("may fill once the member has sent their part", async () => {
    setup({ self: { status: "submitted" } });
    expect((await asClientManager(TOKEN)).ok).toBe(true);
  });

  it("waits, saying so, while the member has not sent their part", async () => {
    setup();
    expect(await asClientManager(TOKEN)).toMatchObject({ ok: false, reason: "not_yet" });
  });

  it("may fill before the member has sent theirs once the owner unlocked it", async () => {
    setup({ member: { rater_unlocked_at: "2026-11-20T00:00:00Z" } });
    expect((await asClientManager(TOKEN)).ok).toBe(true);
  });

  it("shows its own answers, read-only, once it has sent them", async () => {
    setup({ self: { status: "submitted" }, clientManager: { status: "submitted" } });
    expect(await asClientManager(TOKEN)).toMatchObject({ ok: false, reason: "already_submitted" });
  });

  it("says the cycle has closed", async () => {
    setup({ closedAt: "2026-12-05T00:00:00Z", self: { status: "submitted" } });
    expect(await asClientManager(TOKEN)).toMatchObject({ ok: false, reason: "cycle_closed" });
  });

  it("stops working once the link was cancelled", async () => {
    setup({ self: { status: "submitted" }, clientManager: { metadata: { link_cancelled_at: "2026-11-19T00:00:00Z" } } });
    expect(await asClientManager(TOKEN)).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("learns nothing from a wrong token, not even that the cycle closed", async () => {
    setup({ closedAt: "2026-12-05T00:00:00Z" });
    expect(await asClientManager("a-guess")).toMatchObject({ ok: false, reason: "no_match" });
  });

  it("never counts a missing token against a missing stored token as a match", async () => {
    setup({ self: { status: "submitted" } });
    expect(await asClientManager(null, null)).toMatchObject({ ok: false, reason: "no_match" });
  });
});

describe("the member's own part", () => {
  const asMember = (teamMemberId: string | null) =>
    clientPartAccess({ id: "self-part", rater_kind: "self", team_member_id: ANA, access_token: null }, { token: null, teamMemberId });

  it("is filled by the member while the cycle is open", async () => {
    setup();
    expect((await asMember(ANA)).ok).toBe(true);
  });

  it("is refused to anyone else, token or not", async () => {
    setup();
    expect(await asMember("someone-else")).toMatchObject({ ok: false, reason: "not_rater" });
  });

  it("reads as submitted once it is sent", async () => {
    setup({ self: { status: "submitted" } });
    expect(await asMember(ANA)).toMatchObject({ ok: false, reason: "already_submitted" });
  });

  it("is locked, not submitted, once the cycle closed before the member sent it", async () => {
    setup({ closedAt: "2026-12-05T00:00:00Z" });
    expect(await asMember(ANA)).toMatchObject({ ok: false, reason: "locked" });
  });
});

describe("what grants nothing", () => {
  it("does not let the skip-manager fill a form here", async () => {
    setup({ self: { status: "submitted" } });
    const access = await clientPartAccess({ id: "skip_manager-part", rater_kind: "skip_manager", team_member_id: ANA, access_token: null }, { token: TOKEN, teamMemberId: null });
    expect(access).toMatchObject({ ok: false, reason: "not_rater" });
  });

  it("judges nothing when the part's label names a cycle its column does not", async () => {
    script(
      "performance_reviews",
      { data: [{ cycle_label: `client:${CYCLE}`, team_member_id: ANA }] },
      // The cycle's parts, read by the cycle column, do not include this part.
      { data: [part("self", { status: "submitted" })] },
    );
    script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: null, framework_id: "fw", skip_manager_person_id: null, skip_manager_link_cancelled_at: null }] });
    script("review_cycle_members", { data: [{ withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null }] });
    expect(await asClientManager(TOKEN)).toEqual({ ok: false, reason: "not_rater", setting: null });
  });

  it("refuses an id that is not a client review part", async () => {
    script("performance_reviews", { data: [] });
    expect(await asClientManager(TOKEN)).toEqual({ ok: false, reason: "not_rater", setting: null });
  });

  it("raises a failed read instead of answering that the link stopped working", async () => {
    script("performance_reviews", { data: null, error: { message: "boom" } });
    await expect(asClientManager(TOKEN)).rejects.toThrow(/read failed/);
  });
});

describe("tokenMatches", () => {
  it("matches the same token and nothing else", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches(null, null)).toBe(false);
  });
});

// The boundary review on PR 2608: who counts as the member is every team-member
// row of the signed-in person, read so that a failure refuses rather than
// answering "not you".
describe("teamMemberIdsOf", () => {
  it("is every team-member row of the person", async () => {
    script("team_members", { data: [{ id: "tm-1" }, { id: "tm-2" }] });
    expect(await teamMemberIdsOf("person-1")).toEqual(["tm-1", "tm-2"]);
  });

  it("is nobody for a sign-in with no person, without reading", async () => {
    expect(await teamMemberIdsOf(null)).toEqual([]);
  });

  it("throws when the read fails, never answering that the person is nobody", async () => {
    script("team_members", { error: { message: "read failed" } });
    await expect(teamMemberIdsOf("person-1")).rejects.toThrow(/read failed/);
  });
});
