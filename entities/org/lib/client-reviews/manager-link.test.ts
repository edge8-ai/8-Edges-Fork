import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.6: a client manager's one link to a cycle. Cancelling and replacing it
// also give every one of their forms in the cycle a new token, so a form link
// copied before stops opening the form; a change of client manager retires
// the previous one's link once they review nobody left; someone among the
// manager's own members may not touch the link; and nothing here writes to
// anything that reaches a person, at the client or anywhere else.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ audit: vi.fn(async (_entry: unknown) => {}) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import { clientPartAccess } from "./access";
import { cancelManagerLink, ensureManagerLinks, managerReplaced, markManagerLinkCopied, memberWithdrawn, reissueManagerLink } from "./manager-link";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const ROSA = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const BY = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com", ownTeamMemberIds: [] as string[] };

const openCycle = { data: [{ id: CYCLE, closed_at: null }] };
const twoMembers = { data: [{ team_member_id: ANA, withdrawn_at: null }, { team_member_id: BAO, withdrawn_at: null }] };
const link = (over: Record<string, unknown> = {}) => ({ data: [{ id: "link-1", access_token: "manager-token-old", copied_at: null, cancelled_at: null, ...over }] });

/** The tables a person could be reached through. None of them may be touched. */
const REACHES_PEOPLE = ["notifications", "interactions", "email_sends", "email_series", "lark_messages", "assistant_messages"];
const ALLOWED = new Set(["review_cycles", "review_cycle_members", "review_cycle_manager_links", "performance_reviews"]);

const writesTo = (table: string, op = "update") => calls.filter((c) => c.table === table && c.ops.includes(op));
const rotatedTokens = () => writesTo("performance_reviews").map((c) => (c.payloads[0] as { access_token: string }).access_token);

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
});

describe("cancelling a manager's link", () => {
  it("stops the link and gives each of their forms a new token, in one command", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    script("performance_reviews", { data: [{ id: "part-ana" }, { id: "part-bao" }] }, { data: null }, { data: null });

    expect(await cancelManagerLink(CYCLE, ROSA, BY)).toMatchObject({ ok: true });

    expect(writesTo("review_cycle_manager_links")[0]?.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    // Only the manager's client parts of this cycle are read for rotating.
    const read = calls.find((c) => c.table === "performance_reviews" && c.ops.includes("select"))!;
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ["eq", "review_cycle_id", CYCLE],
        ["eq", "review_type", "client"],
        ["eq", "rater_kind", "client_manager"],
        ["in", "team_member_id", [ANA, BAO]],
      ]),
    );
    const tokens = rotatedTokens();
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(2);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The rotation writes the token alone, so no answer can be written over.
    expect(writesTo("performance_reviews").map((c) => Object.keys(c.payloads[0] as object))).toEqual([["access_token"], ["access_token"]]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain("manager-token-old");
    for (const t of tokens) expect(JSON.stringify(h.audit.mock.calls)).not.toContain(t);
  });

  it("finishes a run that stopped halfway: an already cancelled link rotates the forms again, recorded once", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link({ cancelled_at: "2026-11-20T00:00:00Z" }), { data: [] });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null });
    expect(await cancelManagerLink(CYCLE, ROSA, BY)).toEqual({ ok: true, at: "2026-11-20T00:00:00Z" });
    expect(rotatedTokens()).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("fails closed when a form could not be given a new token: the link is stopped first, and that closes the forms too", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { error: { message: "connection reset" } });
    expect(await cancelManagerLink(CYCLE, ROSA, BY)).toEqual({
      ok: false,
      error: "The link is cancelled and none of its forms opens, but they could not all be given new links. Cancel again to finish.",
    });
    // The cancel landed before the write that failed.
    const stop = writesTo("review_cycle_manager_links")[0]!;
    const failed = writesTo("performance_reviews")[0]!;
    expect(stop.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    expect(stop.resolvedAt!).toBeLessThan(failed.resolvedAt!);
    // A form link copied before, whose token the failed write never changed,
    // no longer opens the form while the link is cancelled.
    formSetting({ token: "part-token-copied-before", managerLinkCancelledAt: "2026-11-20T00:00:00Z" });
    expect(await clientPartAccess(anaPart("part-token-copied-before"), { token: "part-token-copied-before", teamMemberId: null })).toMatchObject({
      ok: false,
      reason: "cancelled",
    });
  });
});

/** Ana's client-manager part as a form link presents it. */
const anaPart = (token: string) => ({ id: "part-ana", rater_kind: "client_manager", team_member_id: ANA, access_token: token });

/** The reads the form makes to judge a presented token, with the part holding `token` and the manager's link as given. */
function formSetting({ token, managerLinkCancelledAt }: { token: string; managerLinkCancelledAt: string | null }) {
  script("performance_reviews", { data: [{ cycle_label: `client:${CYCLE}`, team_member_id: ANA }] });
  script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: null, framework_id: "f", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, company_id: "c" }] });
  script("review_cycle_members", { data: [{ withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null, client_manager_person_id: ROSA }] });
  script("performance_reviews", {
    data: [
      { id: "part-self", team_member_id: ANA, rater_kind: "self", review_type: "client", status: "submitted", metadata: {}, access_token: null },
      { id: "part-ana", team_member_id: ANA, rater_kind: "client_manager", review_type: "client", status: "open", metadata: {}, access_token: token },
    ],
  });
  script("review_cycle_manager_links", { data: [{ cancelled_at: managerLinkCancelledAt }] });
}

describe("a form link copied before the cancel", () => {
  it("no longer opens the form; the new token opens it only once the link is live again", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", { data: [{ team_member_id: ANA, withdrawn_at: null }] });
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null });
    await cancelManagerLink(CYCLE, ROSA, BY);
    const fresh = rotatedTokens()[0]!;

    // The form judges a presented token against the part as it now stands.
    formSetting({ token: fresh, managerLinkCancelledAt: null });
    expect(await clientPartAccess(anaPart(fresh), { token: "part-token-copied-before", teamMemberId: null })).toMatchObject({ ok: false, reason: "no_match" });
    // While the manager's link stays cancelled, even the new token opens nothing.
    formSetting({ token: fresh, managerLinkCancelledAt: "2026-11-20T00:00:00Z" });
    expect(await clientPartAccess(anaPart(fresh), { token: fresh, teamMemberId: null })).toMatchObject({ ok: false, reason: "cancelled" });
    formSetting({ token: fresh, managerLinkCancelledAt: null });
    expect(await clientPartAccess(anaPart(fresh), { token: fresh, teamMemberId: null })).toMatchObject({ ok: true });
  });
});

describe("reissuing a manager's link", () => {
  it("replaces the token, clears the cancel and the copied time, and rotates the forms", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link({ cancelled_at: "2026-11-20T00:00:00Z", copied_at: "2026-11-19T00:00:00Z" }), { data: null });
    script("performance_reviews", { data: [{ id: "part-ana" }, { id: "part-bao" }] }, { data: null }, { data: null });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toMatchObject({ ok: true });
    const payload = writesTo("review_cycle_manager_links")[0]?.payloads[0] as Record<string, unknown>;
    expect(payload).toEqual({ access_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), cancelled_at: null, copied_at: null });
    expect(payload.access_token).not.toBe("manager-token-old");
    expect(rotatedTokens()).toHaveLength(2);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycle_manager_links", recordId: "link-1", context: expect.objectContaining({ action: "client_review.manager_link_reissued", wasCancelled: true }) }));
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain(payload.access_token as string);
  });

  it("issues a first link for a manager who has none, written cancelled until the forms have new tokens", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", { data: [] }, { data: { id: "link-new" } }, { data: null });
    script("performance_reviews", { data: [] });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toMatchObject({ ok: true });
    expect(writesTo("review_cycle_manager_links", "insert")[0]?.payloads[0]).toEqual({
      cycle_id: CYCLE,
      client_manager_person_id: ROSA,
      access_token: expect.any(String),
      cancelled_at: expect.any(String),
    });
    const opened = writesTo("review_cycle_manager_links")[0]!;
    expect(opened.payloads[0]).toEqual({ access_token: expect.any(String), cancelled_at: null, copied_at: null });
    expect(opened.filters).toEqual([["eq", "id", "link-new"]]);
  });

  it("stops a live link first, gives the forms new tokens second, and only then opens the new link", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] }, { data: null });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toMatchObject({ ok: true });
    const [stop, open] = writesTo("review_cycle_manager_links");
    const rotate = writesTo("performance_reviews")[0]!;
    expect(stop!.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    expect(open!.payloads[0]).toEqual({ access_token: expect.any(String), cancelled_at: null, copied_at: null });
    expect(stop!.resolvedAt!).toBeLessThan(rotate.resolvedAt!);
    expect(rotate.resolvedAt!).toBeLessThan(open!.resolvedAt!);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "client_review.manager_link_reissued", wasCancelled: false }) }));
  });

  it("fails closed when a form could not be given a new token: the old link stays stopped and no new one opens", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    script("performance_reviews", { data: [{ id: "part-ana" }, { id: "part-bao" }] }, { data: null }, { error: { message: "connection reset" } });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toEqual({
      ok: false,
      error: "The old link and its forms are stopped, but the new link is not ready yet. Issue a new link again to finish.",
    });
    // The only write to the link is the stop: the old token is still stored,
    // but cancelled, so the hub refuses it, and no new token was handed out.
    expect(writesTo("review_cycle_manager_links").map((c) => c.payloads[0])).toEqual([{ cancelled_at: expect.any(String) }]);
    expect(h.audit).not.toHaveBeenCalled();
    // The form whose token was not changed refuses a link copied before, too.
    formSetting({ token: "part-token-copied-before", managerLinkCancelledAt: "2026-11-20T00:00:00Z" });
    expect(await clientPartAccess(anaPart("part-token-copied-before"), { token: "part-token-copied-before", teamMemberId: null })).toMatchObject({
      ok: false,
      reason: "cancelled",
    });
  });

  it("fails closed when the new token cannot be written: the link stays stopped", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] }, { error: { message: "connection reset" } });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toEqual({
      ok: false,
      error: "The old link and its forms are stopped, but the new link is not ready yet. Issue a new link again to finish.",
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("changes nothing when the old link cannot be stopped", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { error: { message: "connection reset" } });
    expect(await reissueManagerLink(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "A new link could not be issued." });
    expect(writesTo("performance_reviews")).toEqual([]);
  });
});

describe("copying a manager's link", () => {
  it("records when, only against the link as it was read and still live", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    expect(await markManagerLinkCopied(CYCLE, ROSA, BY)).toMatchObject({ ok: true });
    const write = writesTo("review_cycle_manager_links")[0]!;
    expect(write.payloads[0]).toEqual({ copied_at: expect.any(String) });
    expect(write.filters).toEqual(expect.arrayContaining([["eq", "access_token", "manager-token-old"], ["is", "cancelled_at", null]]));
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("refuses a cancelled link", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link({ cancelled_at: "2026-11-20T00:00:00Z" }));
    expect(await markManagerLinkCopied(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "This link is cancelled. Issue a new one first." });
    expect(writesTo("review_cycle_manager_links")).toEqual([]);
  });
});

describe("who may act on a manager's link", () => {
  const commands = [markManagerLinkCopied, cancelManagerLink, reissueManagerLink];

  it("refuses someone among the manager's own members, since the link opens the part that rates them", async () => {
    for (const command of commands) {
      resetFake();
      script("review_cycles", openCycle);
      script("review_cycle_members", twoMembers);
      expect(await command(CYCLE, ROSA, { ...BY, ownTeamMemberIds: [BAO] })).toEqual({
        ok: false,
        error: "They are your client manager in this cycle, so a colleague looks after their link.",
      });
      expect(calls.filter((c) => c.ops.some((op) => op === "update" || op === "insert"))).toEqual([]);
    }
  });

  it("lets a colleague in the cycle act on a manager who does not review them", async () => {
    script("review_cycles", openCycle);
    script("review_cycle_members", twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    expect(await markManagerLinkCopied(CYCLE, ROSA, { ...BY, ownTeamMemberIds: ["88888888-8888-4888-8888-888888888888"] })).toMatchObject({ ok: true });
  });

  it("refuses a closed cycle, an unknown cycle and someone who reviews nobody still in it", async () => {
    for (const command of commands) {
      resetFake();
      script("review_cycles", { data: [{ id: CYCLE, closed_at: "2026-11-30T00:00:00Z" }] });
      expect(await command(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "This cycle is closed, so its links no longer open." });
      resetFake();
      script("review_cycles", { data: [] });
      expect(await command(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "That cycle was not found." });
      resetFake();
      script("review_cycles", openCycle);
      script("review_cycle_members", { data: [{ team_member_id: ANA, withdrawn_at: "2026-11-21T00:00:00Z" }] });
      expect(await command(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "They are not a client manager of anyone in this cycle." });
      expect(await command("not-a-cycle", ROSA, BY)).toEqual({ ok: false, error: "That link was not found." });
    }
  });
});

describe("keeping one link per manager", () => {
  it("adds a row for each manager of a member still in the cycle, never replacing one already there", async () => {
    script("review_cycle_members", { data: [{ client_manager_person_id: ROSA }, { client_manager_person_id: ROSA }, { client_manager_person_id: OTHER }] });
    script("review_cycle_manager_links", { data: null });
    expect(await ensureManagerLinks(CYCLE)).toEqual({ ok: true });
    const write = writesTo("review_cycle_manager_links", "upsert")[0]!;
    expect((write.payloads[0] as { client_manager_person_id: string }[]).map((r) => r.client_manager_person_id)).toEqual([ROSA, OTHER]);
    expect(write.options[0]).toEqual({ onConflict: "cycle_id,client_manager_person_id", ignoreDuplicates: true });
    const read = calls.find((c) => c.table === "review_cycle_members")!;
    expect(read.filters).toEqual(expect.arrayContaining([["is", "withdrawn_at", null]]));
  });

  it("writes nothing for a cycle with no client manager", async () => {
    script("review_cycle_members", { data: [] });
    expect(await ensureManagerLinks(CYCLE)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links", "upsert")).toEqual([]);
  });
});

describe("when a member is handed to another client manager", () => {
  const ensured = () => {
    script("review_cycle_members", { data: [{ client_manager_person_id: OTHER }] });
    script("review_cycle_manager_links", { data: null });
  };

  it("leaves the previous manager's link alone while they still review someone in the cycle", async () => {
    ensured();
    script("review_cycle_members", { data: [{ team_member_id: BAO, withdrawn_at: null }] });
    expect(await managerReplaced(CYCLE, ROSA, BY)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links")).toEqual([]);
    expect(writesTo("performance_reviews")).toEqual([]);
  });

  it("cancels and removes the link of a manager no member row names any more", async () => {
    ensured();
    script("review_cycle_members", { data: [] });
    script("review_cycle_manager_links", link(), { data: null }, { data: null });
    expect(await managerReplaced(CYCLE, ROSA, BY)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links")[0]?.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    // Removed, so the row's key to the person never stops the CRM deleting them.
    expect(writesTo("review_cycle_manager_links", "delete")[0]?.filters).toEqual([["eq", "id", "link-1"]]);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "client_review.manager_link_retired", deleted: true }) }));
  });

  it("cancels the link of a manager left with only withdrawn members, rotates their forms and keeps the row", async () => {
    ensured();
    script("review_cycle_members", { data: [{ team_member_id: BAO, withdrawn_at: "2026-11-21T00:00:00Z" }] });
    script("review_cycle_manager_links", link(), { data: null });
    script("performance_reviews", { data: [{ id: "part-bao" }] }, { data: null });
    expect(await managerReplaced(CYCLE, ROSA, BY)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links")[0]?.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    expect(rotatedTokens()).toHaveLength(1);
    expect(writesTo("review_cycle_manager_links", "delete")).toEqual([]);
  });

  it("only writes the new manager's link when the member had no client manager before", async () => {
    ensured();
    expect(await managerReplaced(CYCLE, null, BY)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links", "upsert")).toHaveLength(1);
  });
});

// Khoa's ruling 4 (2026-11-17): once the last member a client manager reviews
// in a cycle is withdrawn, their link is cancelled outright.
describe("when a member is withdrawn", () => {
  it("leaves the manager's link live while they still review someone in the cycle", async () => {
    script("review_cycle_members", { data: [{ team_member_id: ANA, withdrawn_at: "2026-11-21T00:00:00Z" }, { team_member_id: BAO, withdrawn_at: null }] });
    expect(await memberWithdrawn(CYCLE, ROSA, BY)).toEqual({ ok: true });
    expect(writesTo("review_cycle_manager_links")).toEqual([]);
    expect(writesTo("performance_reviews")).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("cancels the link of a manager left with nobody, gives their forms new tokens and keeps the row", async () => {
    script("review_cycle_members", { data: [{ team_member_id: ANA, withdrawn_at: "2026-11-21T00:00:00Z" }] });
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null });
    expect(await memberWithdrawn(CYCLE, ROSA, BY)).toEqual({ ok: true });
    const stop = writesTo("review_cycle_manager_links")[0]!;
    expect(stop.payloads[0]).toEqual({ cancelled_at: expect.any(String) });
    expect(stop.filters).toEqual(expect.arrayContaining([["eq", "id", "link-1"], ["is", "cancelled_at", null]]));
    expect(rotatedTokens()).toHaveLength(1);
    // The withdrawn member's row still names them, so the row stays.
    expect(writesTo("review_cycle_manager_links", "delete")).toEqual([]);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ table: "review_cycle_manager_links", recordId: "link-1", context: expect.objectContaining({ action: "client_review.manager_link_retired", reason: "member_withdrawn", deleted: false }) }),
    );
    // Only this cycle's rows naming this manager are read.
    const read = calls.find((c) => c.table === "review_cycle_members")!;
    expect(read.filters).toEqual(expect.arrayContaining([["eq", "cycle_id", CYCLE], ["eq", "client_manager_person_id", ROSA]]));
  });

  it("says so when the link could not be stopped", async () => {
    script("review_cycle_members", { data: [{ team_member_id: ANA, withdrawn_at: "2026-11-21T00:00:00Z" }] });
    script("review_cycle_manager_links", link(), { error: { message: "connection reset" } });
    expect(await memberWithdrawn(CYCLE, ROSA, BY)).toEqual({ ok: false, error: "Their client manager's link could not be stopped. Try again." });
    expect(writesTo("performance_reviews")).toEqual([]);
  });

  it("touches nothing for a member who had no client manager", async () => {
    expect(await memberWithdrawn(CYCLE, null, BY)).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });
});

describe("the app never contacts anyone at the client", () => {
  it("touches only the review tables, whatever the owner does to a link", async () => {
    script("review_cycles", openCycle, openCycle, openCycle);
    script("review_cycle_members", twoMembers, twoMembers, twoMembers);
    script("review_cycle_manager_links", link(), { data: [{ id: "link-1" }] }, link(), { data: [{ id: "link-1" }] }, link(), { data: [{ id: "link-1" }] }, { data: null });
    script("performance_reviews", { data: [{ id: "part-ana" }] }, { data: null }, { data: [{ id: "part-ana" }] }, { data: null });
    await markManagerLinkCopied(CYCLE, ROSA, BY);
    await cancelManagerLink(CYCLE, ROSA, BY);
    await reissueManagerLink(CYCLE, ROSA, BY);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(ALLOWED.has(c.table)).toBe(true);
    for (const table of REACHES_PEOPLE) expect(calls.some((c) => c.table === table)).toBe(false);
  });
});
