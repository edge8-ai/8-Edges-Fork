import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.2: the owner's hold on the skip-manager's link. A copy records only
// when; cancelling and replacing are recorded with who did it; a closed cycle
// or one with no skip-manager has no link to act on.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ audit: vi.fn(async (_entry: unknown) => {}) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import { cancelSkipManagerLink, markSkipManagerLinkCopied, reissueSkipManagerLink } from "./skip-link";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const BY = { personId: "mai", email: "mai@example.com", ownTeamMemberIds: [] as string[] };
const cycle = (over: Record<string, unknown> = {}) => ({ id: CYCLE, closed_at: null, skip_manager_person_id: "tim", skip_manager_token: "tok-old", skip_manager_link_cancelled_at: null, ...over });
const updates = () => calls.filter((c) => c.table === "review_cycles" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
});

describe("markSkipManagerLinkCopied", () => {
  it("records when, only against the link the page showed", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] });
    expect(await markSkipManagerLinkCopied(CYCLE, BY)).toMatchObject({ ok: true });
    expect(updates()[0].filters).toEqual(expect.arrayContaining([["eq", "skip_manager_token", "tok-old"]]));
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("refuses a cancelled link", async () => {
    script("review_cycles", { data: [cycle({ skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" })] });
    expect(await markSkipManagerLinkCopied(CYCLE, BY)).toEqual({ ok: false, error: "This link is cancelled. Issue a new one first." });
    expect(updates()).toEqual([]);
  });
});

describe("cancelSkipManagerLink", () => {
  it("stops the link and records who did it", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] });
    expect(await cancelSkipManagerLink(CYCLE, BY)).toMatchObject({ ok: true });
    expect(updates()[0].payloads[0]).toMatchObject({ skip_manager_link_cancelled_at: expect.any(String) });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycles", recordId: CYCLE, actor: "mai@example.com", context: expect.objectContaining({ action: "skip_manager_link_cancelled", byPersonId: "mai" }) }));
  });

  it("refuses a closed cycle and a cycle with no skip-manager", async () => {
    script("review_cycles", { data: [cycle({ closed_at: "2026-12-05T00:00:00Z" })] }, { data: [cycle({ skip_manager_person_id: null })] });
    expect(await cancelSkipManagerLink(CYCLE, BY)).toEqual({ ok: false, error: "This cycle is closed, so its links no longer open." });
    expect(await cancelSkipManagerLink(CYCLE, BY)).toEqual({ ok: false, error: "This cycle has no skip-manager." });
    expect(updates()).toEqual([]);
  });

  // The boundary review on PR 2606: the commands refuse it, not only the card.
  it("refuses someone reviewed in the cycle, for every action on the link", async () => {
    const own = { ...BY, ownTeamMemberIds: ["tm-mai"] };
    script("review_cycles", { data: [cycle()] }, { data: [cycle()] }, { data: [cycle()] });
    script("review_cycle_members", { data: [{ team_member_id: "tm-mai" }] }, { data: [{ team_member_id: "tm-mai" }] }, { data: [{ team_member_id: "tm-mai" }] });
    const refused = { ok: false, error: "You are reviewed in this cycle, so a colleague looks after the skip-manager's link." };
    expect(await cancelSkipManagerLink(CYCLE, own)).toEqual(refused);
    expect(await reissueSkipManagerLink(CYCLE, own)).toEqual(refused);
    expect(await markSkipManagerLinkCopied(CYCLE, own)).toEqual(refused);
    expect(updates()).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("reissueSkipManagerLink", () => {
  it("replaces the token, makes a cancelled link work again, and records who did it", async () => {
    script("review_cycles", { data: [cycle({ skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" })] }, { data: [{ id: CYCLE }] });
    expect(await reissueSkipManagerLink(CYCLE, BY)).toMatchObject({ ok: true });
    const payload = updates()[0].payloads[0] as Record<string, unknown>;
    expect(payload.skip_manager_token).toEqual(expect.any(String));
    expect(payload.skip_manager_token).not.toBe("tok-old");
    expect(payload).toMatchObject({ skip_manager_link_cancelled_at: null, skip_manager_link_copied_at: null });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "skip_manager_link_reissued", wasCancelled: true }) }));
  });
});
