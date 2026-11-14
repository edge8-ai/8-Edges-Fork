import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.4: what the person running a client review does to it. These tests
// drive the commands over the house fake and pin the rules each must keep:
// nothing on a closed cycle or a withdrawn member, the old link stops when a
// new one is issued, a reopened part keeps its answers, and every change is
// audited without a token in it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const recordAudit = vi.fn(async (_input: unknown) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (input: unknown) => recordAudit(input) }));
const contactsOfClient = new Set<string>(["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"]);
vi.mock("@/entities/contacts", () => ({
  linkedPersonIdsAt: async (_companyId: string, personIds: string[]) => ({ data: personIds.filter((id) => contactsOfClient.has(id)).map((person_id) => ({ person_id })), error: null }),
}));
vi.mock("./open-cycle", () => ({
  newLinkToken: () => "a-fresh-token",
  openClientReviewCycle: vi.fn(async () => ({ ok: true, cycleId: "c", reused: true, membersAdded: 1, partsAdded: 1, told: 1, emailed: 1 })),
}));

import { openClientReviewCycle } from "./open-cycle";
import {
  addCycleMember,
  changeClientManager,
  closeClientCycle,
  reissueClientManagerLink,
  reopenClientPart,
  unlockClientManagerPart,
  withdrawCycleMember,
} from "./owner-actions";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const BY = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com", ownTeamMemberIds: [] as string[] };
const NEW_CM = "44444444-4444-4444-8444-444444444444";

const cycleRow = (over: Record<string, unknown> = {}) => ({
  id: CYCLE,
  name: "November 2026",
  closed_at: null,
  company_id: "11111111-1111-4111-8111-111111111111",
  framework_id: "22222222-2222-4222-8222-222222222222",
  opened_by: BY.personId,
  skip_manager_person_id: null,
  skip_manager_link_cancelled_at: null,
  ...over,
});
const memberRow = (over: Record<string, unknown> = {}) => ({
  team_member_id: ANA,
  client_manager_person_id: "33333333-3333-4333-8333-333333333333",
  withdrawn_at: null,
  rater_unlocked_at: null,
  skip_waived_at: null,
  released_at: null,
  ...over,
});
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
  metadata: { survey_slug: "form" },
  access_token: kind === "client_manager" ? "old-token" : null,
  ...over,
});
/** The people read that tells a current contact from an archived one. */
const current = (personId: string) => script("people", { data: [{ id: personId }] });

const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => op === "update" || op === "insert"));

beforeEach(() => {
  resetFake();
  recordAudit.mockClear();
});

describe("on a closed cycle or a withdrawn member", () => {
  it("refuses every member action once the cycle closed", async () => {
    script("review_cycles", { data: [cycleRow({ closed_at: "2026-12-05T00:00:00Z" })] });
    expect(await unlockClientManagerPart(CYCLE, ANA, BY)).toEqual({ ok: false, error: "This cycle is closed." });
    expect(writes("review_cycle_members")).toEqual([]);
  });

  it("refuses a withdrawn member", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow({ withdrawn_at: "2026-11-19T00:00:00Z" })] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] });
    expect(await reissueClientManagerLink(CYCLE, ANA, BY)).toEqual({ ok: false, error: "This member was withdrawn from the cycle." });
    expect(writes("performance_reviews")).toEqual([]);
  });
});

describe("a new link", () => {
  it("replaces the token, clears the copied time and audits without the token", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script(
      "performance_reviews",
      { data: [part("self"), part("client_manager", { metadata: { survey_slug: "form", link_copied_at: "2026-11-12T14:05:00Z" } })] },
      { data: [{ id: "client_manager-part" }] },
    );
    expect(await reissueClientManagerLink(CYCLE, ANA, BY)).toEqual({ ok: true });
    const update = writes("performance_reviews")[0]?.payloads[0] as { access_token: string; metadata: Record<string, unknown> };
    expect(update.access_token).toBe("a-fresh-token");
    expect(update.metadata.link_copied_at).toBeUndefined();
    expect(update.metadata.survey_slug).toBe("form");
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("a-fresh-token");
  });
});

describe("reopening a part", () => {
  it("puts a sent part back to open with its answers kept, and records it", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self", { status: "submitted", submitted_at: "2026-11-14T08:00:00Z" })] }, { data: [{ id: "self-part" }] });
    expect(await reopenClientPart(CYCLE, ANA, "self", BY)).toEqual({ ok: true });
    const update = writes("performance_reviews")[0]?.payloads[0] as { status: string; metadata: Record<string, unknown>; ratings?: unknown };
    expect(update.status).toBe("open");
    // The first send's time stays on the part; the resend will be its new submission time.
    expect(update.metadata).toMatchObject({ survey_slug: "form", reopened_by: BY.personId, previously_sent_at: "2026-11-14T08:00:00Z" });
    expect(update.ratings).toBeUndefined();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: BY.email, context: expect.objectContaining({ action: "client_review.reopen", raterKind: "self" }) }));
  });

  it("keeps the first send's time across a second reopening", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script(
      "performance_reviews",
      { data: [part("self", { status: "submitted", submitted_at: "2026-11-22T08:00:00Z", metadata: { survey_slug: "form", previously_sent_at: "2026-11-14T08:00:00Z" } })] },
      { data: [{ id: "self-part" }] },
    );
    expect(await reopenClientPart(CYCLE, ANA, "self", BY)).toEqual({ ok: true });
    expect((writes("performance_reviews")[0]?.payloads[0] as { metadata: Record<string, unknown> }).metadata.previously_sent_at).toBe("2026-11-14T08:00:00Z");
  });

  it("refuses a released review", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow({ released_at: "2026-11-21T00:00:00Z" })] });
    script("performance_reviews", { data: [part("self", { status: "submitted" })] });
    expect(await reopenClientPart(CYCLE, ANA, "self", BY)).toEqual({ ok: false, error: "This review is released, so it stays as it was." });
  });
});

describe("unlocking", () => {
  it("stamps the unlock, naming who did it, and audits it", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] }, { data: [{ team_member_id: ANA }] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] });
    expect(await unlockClientManagerPart(CYCLE, ANA, BY)).toEqual({ ok: true });
    const write = writes("review_cycle_members")[0];
    expect(write?.payloads[0]).toMatchObject({ rater_unlocked_by: BY.personId, rater_unlocked_at: expect.any(String) });
    expect(write?.filters).toEqual(expect.arrayContaining([["is", "rater_unlocked_at", null]]));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: BY.email, context: expect.objectContaining({ action: "client_review.unlock", teamMemberId: ANA }) }));
  });

  it("refuses once the member has sent their part", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self", { status: "submitted" }), part("client_manager")] });
    expect((await unlockClientManagerPart(CYCLE, ANA, BY)).ok).toBe(false);
  });
});

describe("adding and withdrawing", () => {
  it("adds through the command that opened the cycle", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [] });
    expect(await addCycleMember(CYCLE, ANA, null, BY)).toEqual({ ok: true });
    expect(openClientReviewCycle).toHaveBeenCalledWith(expect.objectContaining({ name: "November 2026", members: [{ teamMemberId: ANA, clientManagerPersonId: null }] }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: BY.email, context: expect.objectContaining({ action: "client_review.member_added", teamMemberId: ANA }) }));
  });

  it("keeps a withdrawn member's rows and only stamps the withdrawal", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] }, { data: [{ team_member_id: ANA }] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] });
    expect(await withdrawCycleMember(CYCLE, ANA, BY)).toEqual({ ok: true });
    expect(calls.some((c) => c.ops.includes("delete"))).toBe(false);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: BY.email, context: expect.objectContaining({ action: "client_review.member_withdrawn", teamMemberId: ANA }) }));
  });
});

describe("changing the client manager", () => {
  it("hands the part to the new manager blank, under a new link, before the member row changes", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] }, { data: [] });
    script(
      "performance_reviews",
      // A part the owner reopened: the previous manager's answers are still on it.
      { data: [part("self", { status: "submitted" }), part("client_manager", { metadata: { survey_slug: "form", comment_teamwork: "Old words.", confirmed_esign: true, reopened_at: "2026-11-20T00:00:00Z" } })] },
      { data: [{ id: "client_manager-part" }] },
    );
    current(NEW_CM);
    expect(await changeClientManager(CYCLE, ANA, NEW_CM, BY)).toEqual({ ok: true });
    const handover = writes("performance_reviews")[0]?.payloads[0] as Record<string, unknown>;
    expect(handover).toMatchObject({ access_token: "a-fresh-token", ratings: {}, achievements: null, improvements: null, comments: null });
    expect(handover.metadata).toEqual({ survey_slug: "form", link_reissued_at: expect.any(String) });
    // The part changed first, so a failure after it leaves the old link stopped.
    const order = calls.filter((c) => c.ops.includes("update")).map((c) => c.table);
    expect(order).toEqual(["performance_reviews", "review_cycle_members"]);
    // The audit says the previous manager's answers were cleared, and carries none of them.
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "client_review.client_manager_changed", answersCleared: true }) }));
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("Old words.");
  });

  it("says no answers were cleared when the part handed over was blank", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] }, { data: [] });
    script("performance_reviews", { data: [part("self"), part("client_manager", { metadata: { survey_slug: "form", link_copied_at: "2026-11-12T14:05:00Z" } })] }, { data: [{ id: "client_manager-part" }] });
    current(NEW_CM);
    expect(await changeClientManager(CYCLE, ANA, NEW_CM, BY)).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ answersCleared: false }) }));
  });

  it("refuses someone who is not one of the client's contacts", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] });
    expect(await changeClientManager(CYCLE, ANA, "88888888-8888-4888-8888-888888888888", BY)).toEqual({ ok: false, error: "Choose one of the client's contacts." });
    expect(writes("performance_reviews")).toEqual([]);
  });

  it("refuses an archived contact, whom the picker does not offer either", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] });
    script("people", { data: [] });
    expect(await changeClientManager(CYCLE, ANA, NEW_CM, BY)).toEqual({ ok: false, error: "Choose one of the client's contacts." });
    expect(writes("performance_reviews")).toEqual([]);
  });

  it("refuses handing over a part the client manager has sent", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self", { status: "submitted" }), part("client_manager", { status: "submitted" })] });
    expect(await changeClientManager(CYCLE, ANA, NEW_CM, BY)).toEqual({ ok: false, error: "The client manager has already sent their part. Reopen it first if it must be redone." });
    expect(writes("performance_reviews")).toEqual([]);
  });
});

describe("the actor's own review", () => {
  it("refuses every member action on the actor's own review", async () => {
    const self = { ...BY, ownTeamMemberIds: [ANA] };
    expect(await reopenClientPart(CYCLE, ANA, "self", self)).toEqual({ ok: false, error: "This is your own review, so a colleague acts on it." });
    expect(await withdrawCycleMember(CYCLE, ANA, self)).toEqual({ ok: false, error: "This is your own review, so a colleague acts on it." });
    expect(calls).toEqual([]);
  });
});

describe("a new link while a submission lands", () => {
  it("misses rather than writing over answers sent in between", async () => {
    script("review_cycles", { data: [cycleRow()] });
    script("review_cycle_members", { data: [memberRow()] });
    script("performance_reviews", { data: [part("self"), part("client_manager")] }, { data: [] });
    expect(await reissueClientManagerLink(CYCLE, ANA, BY)).toEqual({ ok: false, error: "That part changed just now. Reload and try again." });
    expect(writes("performance_reviews")[0]?.filters).toEqual(expect.arrayContaining([["eq", "status", "open"]]));
  });
});

describe("closing", () => {
  it("closes once, naming who closed it", async () => {
    script("review_cycles", { data: [cycleRow()] }, { data: [{ id: CYCLE }] });
    expect(await closeClientCycle(CYCLE, BY)).toEqual({ ok: true });
    expect(writes("review_cycles")[0]?.payloads[0]).toMatchObject({ closed_by: BY.personId });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: BY.email, context: expect.objectContaining({ action: "client_review.closed" }) }));
  });
});
